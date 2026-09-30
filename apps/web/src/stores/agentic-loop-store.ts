import { create } from "zustand";
import type {
  AgentLoopConfig,
  AgentLoopStatus,
  LoopContext,
  LoopIteration,
  AgentLoopEvent,
} from "@/lib/agentic/types";
import { DEFAULT_LOOP_CONFIG } from "@/lib/agentic/types";
import { type VerbalisAgentAdapter, createVerbalisAdapter } from "@/lib/agentic/verbalis-agent-adapter";
import type { ToolCallState } from "@/lib/tools";

// ============================================================================
// State Types
// ============================================================================

/**
 * Conversation-facing events, consumed by chat-store to keep messages in sync.
 * This bus is the only path from the loop to conversation state — chat-store
 * subscribes once at module load, so this store never imports chat-store.
 */
export type LoopBusEvent =
  | { type: "tool_state"; conversationId: string; toolCall: ToolCallState }
  /** The loop completed or was aborted; in-flight tool calls should be marked stopped. */
  | { type: "loop_ended"; conversationId: string };

export type LoopBusCallback = (event: LoopBusEvent) => void;

// Module-level storage for bus callbacks (outside zustand to avoid re-renders)
const loopBusCallbacks: Set<LoopBusCallback> = new Set();

export function subscribeToLoopEvents(callback: LoopBusCallback): () => void {
  loopBusCallbacks.add(callback);
  return () => {
    loopBusCallbacks.delete(callback);
  };
}

function publish(event: LoopBusEvent): void {
  for (const callback of loopBusCallbacks) {
    try {
      callback(event);
    } catch (error) {
      console.error("[agentic-loop-store] Loop bus callback error:", error);
    }
  }
}

function notifyToolStateChange(conversationId: string, toolCall: ToolCallState): void {
  publish({ type: "tool_state", conversationId, toolCall });
}

interface AgenticLoopState {
  // Active adapters (replacing loops)
  activeAdapters: Map<string, VerbalisAgentAdapter>;
  activeContexts: Map<string, LoopContext>;

  // Current loop (for primary UI)
  currentLoopId: string | null;
  currentStatus: AgentLoopStatus;
  currentIteration: LoopIteration | null;
  iterations: LoopIteration[];
  pendingToolCalls: ToolCallState[];

  // Statistics
  totalToolCalls: number;
  successfulToolCalls: number;
  failedToolCalls: number;

  // Configuration
  defaultConfig: AgentLoopConfig;

  // Actions - Adapter Management
  createAdapter: (conversationId: string, agentId: string | null, config?: Partial<AgentLoopConfig>) => VerbalisAgentAdapter;
  getAdapter: (conversationId: string) => VerbalisAgentAdapter | null;
  removeAdapter: (conversationId: string) => void;
  /**
   * Drop a finished adapter without touching the loop UI state (status,
   * iterations stay visible). No-op if `adapter` was already replaced.
   */
  releaseAdapter: (conversationId: string, adapter: VerbalisAgentAdapter) => void;
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

// Event-handler unsubscribers per conversation. Without unsubscribing, a
// replaced/removed adapter keeps emitting into handleLoopEvent with a stale
// conversationId (leak + cross-conversation state corruption).
const adapterUnsubscribers = new Map<string, () => void>();

function unsubscribeAdapter(conversationId: string): void {
  adapterUnsubscribers.get(conversationId)?.();
  adapterUnsubscribers.delete(conversationId);
}

export const useAgenticLoopStore = create<AgenticLoopState>((set, get) => ({
  // Initial State
  activeAdapters: new Map(),
  activeContexts: new Map(),
  currentLoopId: null,
  currentStatus: "idle",
  currentIteration: null,
  iterations: [],
  pendingToolCalls: [],
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
      unsubscribeAdapter(conversationId);
    }

    // Create new adapter (guardrails config is supplied per run via run(config))
    const loopConfig = { ...defaultConfig, ...config };
    const adapter = createVerbalisAdapter(conversationId, agentId, loopConfig);

    // Subscribe to events
    const unsubscribe = adapter.onEvent((event) => {
      get().handleLoopEvent(conversationId, event);
    });
    adapterUnsubscribers.set(conversationId, unsubscribe);

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
    unsubscribeAdapter(conversationId);

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

  releaseAdapter: (conversationId, adapter) => {
    const { activeAdapters } = get();
    if (activeAdapters.get(conversationId) !== adapter) return;
    unsubscribeAdapter(conversationId);
    const newAdapters = new Map(activeAdapters);
    newAdapters.delete(conversationId);
    set({ activeAdapters: newAdapters });
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
        publish({ type: "loop_ended", conversationId });
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
        publish({ type: "loop_ended", conversationId });
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
