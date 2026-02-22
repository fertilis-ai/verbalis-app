import { create } from "zustand";
import type {
  AgentLoopConfig,
  AgentLoopStatus,
  LoopContext,
  LoopIteration,
  AgentLoopEvent,
} from "@/lib/agentic/types";
import { DEFAULT_LOOP_CONFIG, createInitialLoopContext } from "@/lib/agentic/types";
import { SapioAgentAdapter, createSapioAdapter } from "@/lib/agentic/sapio-agent-adapter";
import { useSettingsStore } from "./settings-store";
import type { ToolCallState } from "@/lib/tools";
import { useChatStore } from "./chat-store";

// ============================================================================
// State Types
// ============================================================================

// Callback for tool state changes (used by chat-store to sync conversation state)
export type ToolStateCallback = (conversationId: string, toolCall: ToolCallState) => void;

// Module-level storage for tool state callbacks (outside zustand to avoid re-renders)
const toolStateCallbacks: Set<ToolStateCallback> = new Set();

export function subscribeToToolEvents(callback: ToolStateCallback): () => void {
  toolStateCallbacks.add(callback);
  return () => {
    toolStateCallbacks.delete(callback);
  };
}

function notifyToolStateChange(conversationId: string, toolCall: ToolCallState): void {
  for (const callback of toolStateCallbacks) {
    try {
      callback(conversationId, toolCall);
    } catch (error) {
      console.error("[agentic-loop-store] Tool state callback error:", error);
    }
  }
}

interface AgenticLoopState {
  // Active adapters (replacing loops)
  activeAdapters: Map<string, SapioAgentAdapter>;
  activeContexts: Map<string, LoopContext>;

  // Current loop (for primary UI)
  currentLoopId: string | null;
  currentStatus: AgentLoopStatus;
  currentIteration: LoopIteration | null;
  iterations: LoopIteration[];
  pendingToolCalls: ToolCallState[];

  // Statistics
  totalIterations: number;
  totalToolCalls: number;
  successfulToolCalls: number;
  failedToolCalls: number;

  // Configuration
  defaultConfig: AgentLoopConfig;

  // Actions - Adapter Management
  createAdapter: (conversationId: string, agentId: string | null, config?: Partial<AgentLoopConfig>) => SapioAgentAdapter;
  getAdapter: (conversationId: string) => SapioAgentAdapter | null;
  removeAdapter: (conversationId: string) => void;
  setCurrentLoop: (conversationId: string | null) => void;

  // Actions - Loop Control (delegates to adapter)
  stopLoop: (conversationId: string) => void;

  // Actions - Tool Approval
  confirmTool: (conversationId: string, toolCallId: string) => Promise<void>;
  confirmAllPending: (conversationId: string) => Promise<void>;
  rejectTool: (conversationId: string, toolCallId: string, reason?: string) => void;
  rejectAllPending: (conversationId: string, reason?: string) => void;

  // Internal - Event Handling
  handleLoopEvent: (conversationId: string, event: AgentLoopEvent) => void;
  updateLoopContext: (conversationId: string, context: LoopContext) => void;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useAgenticLoopStore = create<AgenticLoopState>((set, get) => ({
  // Initial State
  activeAdapters: new Map(),
  activeContexts: new Map(),
  currentLoopId: null,
  currentStatus: "idle",
  currentIteration: null,
  iterations: [],
  pendingToolCalls: [],
  totalIterations: 0,
  totalToolCalls: 0,
  successfulToolCalls: 0,
  failedToolCalls: 0,
  defaultConfig: DEFAULT_LOOP_CONFIG,

  // ============================================================================
  // Adapter Management
  // ============================================================================

  createAdapter: (conversationId, agentId, config) => {
    const { activeAdapters, defaultConfig } = get();

    // Remove existing adapter for this conversation if any
    if (activeAdapters.has(conversationId)) {
      const existing = activeAdapters.get(conversationId)!;
      existing.stop();
    }

    // Get guardrails config from settings
    const guardrailsConfig = useSettingsStore.getState().guardrailsConfig;

    // Create new adapter
    const loopConfig = { ...defaultConfig, ...config };
    const adapter = createSapioAdapter(conversationId, agentId, guardrailsConfig, loopConfig);

    // Subscribe to events
    adapter.onEvent((event) => {
      get().handleLoopEvent(conversationId, event);
    });

    // Store adapter and initial context
    const newAdapters = new Map(activeAdapters);
    newAdapters.set(conversationId, adapter);

    const newContexts = new Map(get().activeContexts);
    newContexts.set(conversationId, adapter.getContext());

    set({
      activeAdapters: newAdapters,
      activeContexts: newContexts,
    });

    return adapter;
  },

  getAdapter: (conversationId) => {
    return get().activeAdapters.get(conversationId) || null;
  },

  removeAdapter: (conversationId) => {
    const { activeAdapters, activeContexts, currentLoopId } = get();

    const adapter = activeAdapters.get(conversationId);
    if (adapter) {
      adapter.stop();
    }

    const newAdapters = new Map(activeAdapters);
    newAdapters.delete(conversationId);

    const newContexts = new Map(activeContexts);
    newContexts.delete(conversationId);

    set({
      activeAdapters: newAdapters,
      activeContexts: newContexts,
      currentLoopId: currentLoopId === conversationId ? null : currentLoopId,
      ...(currentLoopId === conversationId ? {
        currentStatus: "idle",
        currentIteration: null,
        iterations: [],
        pendingToolCalls: [],
      } : {}),
    });
  },

  setCurrentLoop: (conversationId) => {
    const { activeContexts } = get();

    if (conversationId === null) {
      set({
        currentLoopId: null,
        currentStatus: "idle",
        currentIteration: null,
        iterations: [],
        pendingToolCalls: [],
      });
      return;
    }

    const context = activeContexts.get(conversationId);
    if (context) {
      const pendingToolCalls = context.currentIteration?.toolCalls.filter(
        tc => tc.status === "pending_confirmation"
      ) || [];

      set({
        currentLoopId: conversationId,
        currentStatus: context.status,
        currentIteration: context.currentIteration,
        iterations: context.iterations,
        pendingToolCalls,
      });
    }
  },

  // ============================================================================
  // Loop Control
  // ============================================================================

  stopLoop: (conversationId) => {
    const adapter = get().getAdapter(conversationId);
    if (adapter) {
      adapter.stop();
    }
  },

  // ============================================================================
  // Tool Approval
  // ============================================================================

  confirmTool: async (conversationId, toolCallId) => {
    const adapter = get().getAdapter(conversationId);
    if (adapter) {
      await adapter.confirmTool(toolCallId);
    }
  },

  confirmAllPending: async (conversationId) => {
    const adapter = get().getAdapter(conversationId);
    if (adapter) {
      await adapter.confirmAllPending();
    }
  },

  rejectTool: (conversationId, toolCallId, reason) => {
    const adapter = get().getAdapter(conversationId);
    if (adapter) {
      adapter.rejectTool(toolCallId, reason);
    }
  },

  rejectAllPending: (conversationId, reason) => {
    const adapter = get().getAdapter(conversationId);
    if (adapter) {
      adapter.rejectAllPending(reason);
    }
  },

  // ============================================================================
  // Event Handling
  // ============================================================================

  handleLoopEvent: (conversationId, event) => {
    const { currentLoopId } = get();
    const isCurrentLoop = conversationId === currentLoopId;

    // Update state based on event
    switch (event.type) {
      case "loop_started":
        get().updateLoopContext(conversationId, event.context);
        if (isCurrentLoop) {
          set({ currentStatus: "thinking" });
        }
        break;

      case "iteration_started":
        if (isCurrentLoop) {
          set({
            currentIteration: event.iteration,
            currentStatus: event.iteration.status,
          });
        }
        break;

      case "iteration_completed":
        if (isCurrentLoop) {
          set((state) => ({
            iterations: [...state.iterations, event.iteration],
            totalIterations: state.totalIterations + 1,
          }));
        }
        break;

      case "thinking_started":
        if (isCurrentLoop) {
          set({ currentStatus: "thinking" });
        }
        break;

      case "thinking_completed":
        // Tool calls will be handled by tool_pending events
        break;

      case "text_delta":
        // Text streaming is handled by chat-store event listener
        // No state update needed here
        break;

      case "response_complete":
        // Response completion is handled by thinking_completed
        // This event provides additional info but no state change needed
        break;

      case "assistant_message_started":
        // UI notification that a new assistant message is being generated
        // No state change needed
        break;

      case "tool_pending":
        // Notify external listeners (chat-store)
        notifyToolStateChange(conversationId, event.toolCall);
        if (isCurrentLoop) {
          set((state) => ({
            currentStatus: "tool_pending",
            pendingToolCalls: [...state.pendingToolCalls, event.toolCall],
          }));
        }
        break;

      case "tool_confirmed":
        if (isCurrentLoop) {
          set((state) => ({
            currentStatus:
              state.pendingToolCalls.length <= 1 && state.currentStatus === "tool_pending"
                ? "thinking"
                : state.currentStatus,
            pendingToolCalls: state.pendingToolCalls.filter(
              tc => tc.id !== event.toolCallId
            ),
          }));
        }
        break;

      case "tool_rejected":
        if (isCurrentLoop) {
          set((state) => ({
            currentStatus:
              state.pendingToolCalls.length <= 1 && state.currentStatus === "tool_pending"
                ? "thinking"
                : state.currentStatus,
            pendingToolCalls: state.pendingToolCalls.filter(
              tc => tc.id !== event.toolCallId
            ),
          }));
        }
        break;

      case "tool_executing":
        // Notify external listeners (chat-store)
        notifyToolStateChange(conversationId, event.toolCall);
        if (isCurrentLoop) {
          set({ currentStatus: "tool_executing" });
        }
        break;

      case "tool_completed":
        // Notify external listeners (chat-store)
        notifyToolStateChange(conversationId, event.toolCall);
        if (isCurrentLoop) {
          set((state) => ({
            totalToolCalls: state.totalToolCalls + 1,
            successfulToolCalls: state.successfulToolCalls + 1,
          }));
        }
        break;

      case "tool_failed":
        // Notify external listeners (chat-store)
        notifyToolStateChange(conversationId, event.toolCall);
        if (isCurrentLoop) {
          set((state) => ({
            totalToolCalls: state.totalToolCalls + 1,
            failedToolCalls: state.failedToolCalls + 1,
          }));
        }
        break;

      case "tool_cancelled":
        // Notify external listeners (chat-store)
        notifyToolStateChange(conversationId, event.toolCall);
        if (isCurrentLoop) {
          set({ currentStatus: "thinking" });
        }
        break;

      case "loop_paused":
        if (isCurrentLoop) {
          set({ currentStatus: "paused" });
        }
        break;

      case "loop_resumed":
        if (isCurrentLoop) {
          set({ currentStatus: "thinking" });
        }
        break;

      case "loop_completed":
        get().updateLoopContext(conversationId, event.context);
        if (isCurrentLoop) {
          set({
            currentStatus: "completed",
            pendingToolCalls: [],
          });
        }
        // Clean up any tool calls still stuck in pending/executing state
        useChatStore.getState().markToolCallsStopped(conversationId);
        break;

      case "loop_error":
        if (isCurrentLoop) {
          set({ currentStatus: "error" });
        }
        break;

      case "loop_aborted":
        if (isCurrentLoop) {
          set({
            currentStatus: "aborted",
            pendingToolCalls: [],
          });
        }
        // Mark in-flight tool calls as "stopped" in conversation messages
        useChatStore.getState().markToolCallsStopped(conversationId);
        break;
    }
  },

  updateLoopContext: (conversationId, context) => {
    set((state) => {
      const newContexts = new Map(state.activeContexts);
      newContexts.set(conversationId, context);
      return { activeContexts: newContexts };
    });
  },
}));
