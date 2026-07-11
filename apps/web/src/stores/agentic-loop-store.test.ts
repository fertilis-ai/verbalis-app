import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — break the circular dependency by mocking chat-store first
// (agentic-loop-store imports chat-store which calls subscribeToToolEvents)
// ---------------------------------------------------------------------------

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));

vi.mock("@/lib/storage", () => ({
  isTauri: vi.fn(() => false),
  getAppDataDir: vi.fn().mockResolvedValue("/mock-data"),
  loadChatTree: vi.fn().mockResolvedValue([]),
  saveChatToFolder: vi.fn().mockResolvedValue(undefined),
  deleteChatByPath: vi.fn().mockResolvedValue(undefined),
  loadChatByPath: vi.fn().mockResolvedValue(null),
  deleteChatFolder: vi.fn().mockResolvedValue(undefined),
  renameChatFolder: vi.fn().mockResolvedValue(undefined),
  createChatFolder: vi.fn().mockResolvedValue("/mock-data/chats/folder"),
  saveFolderMeta: vi.fn().mockResolvedValue(undefined),
  loadFolderMeta: vi.fn().mockResolvedValue(null),
  deletePath: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(""),
}));

vi.mock("@/lib/logger", () => ({
  logAgent: vi.fn(),
}));

vi.mock("@/lib/tools", () => ({
  getToolsForContext: vi.fn().mockReturnValue([]),
}));

vi.mock("@/lib/protocol-parser", () => ({
  stripProtocolMarkers: vi.fn((s: string) => s),
}));

vi.mock("@/lib/message-conversion", () => ({
  messagesToPiMessages: vi.fn().mockReturnValue([]),
}));

vi.mock("@earendil-works/pi-ai", () => ({
  streamSimple: vi.fn(),
  getModel: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/http", () => ({
  appFetch: vi.fn(),
}));

vi.mock("@/lib/models", () => ({
  DEFAULT_MODEL_ID: "claude-sonnet-4-20250514",
  getActiveModels: vi.fn().mockReturnValue([]),
  PROVIDER_API_MAP: {},
  PROVIDER_BASE_URL_MAP: {},
}));

// Mock settings store
vi.mock("./settings-store", () => ({
  useSettingsStore: Object.assign(vi.fn(() => ({})), {
    getState: vi.fn(() => ({
      apiKeys: {},
      localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
      guardrailsConfig: {},
      selectedModels: [],
      defaultModel: "claude-sonnet-4-20250514",
    })),
    subscribe: vi.fn(() => vi.fn()),
    setState: vi.fn(),
    getInitialState: vi.fn(),
  }),
}));

// Mock chat-store to break the circular dependency
// (chat-store imports agentic-loop-store and calls subscribeToToolEvents at module level)
vi.mock("./chat-store", () => ({
  useChatStore: Object.assign(vi.fn(() => ({})), {
    getState: vi.fn(() => ({
      conversations: [],
      markToolCallsStopped: vi.fn(),
    })),
    setState: vi.fn(),
  }),
}));

// Mock the adapter creation
const mockAdapterStop = vi.fn();
const mockAdapterOnEvent = vi.fn().mockReturnValue(vi.fn());
const mockAdapterGetContext = vi.fn().mockReturnValue({
  conversationId: "conv-1",
  agentId: null,
  config: { maxIterations: 25, maxConsecutiveErrors: 3, timeoutMs: 300000, autonomyLevel: "semi_autonomous", allowParallelTools: true, pauseOnError: true },
  iterations: [],
  currentIteration: null,
  status: "idle",
  startedAt: null,
  completedAt: null,
  consecutiveErrors: 0,
  totalToolCalls: 0,
  successfulToolCalls: 0,
  failedToolCalls: 0,
  skippedToolCalls: 0,
});
const mockAdapterConfirmTool = vi.fn();
const mockAdapterConfirmAllPending = vi.fn();
const mockAdapterRejectTool = vi.fn();
const mockAdapterRejectAllPending = vi.fn();

const mockCreateVerbalisAdapter = vi.fn().mockReturnValue({
  stop: mockAdapterStop,
  onEvent: mockAdapterOnEvent,
  getContext: mockAdapterGetContext,
  confirmTool: mockAdapterConfirmTool,
  confirmAllPending: mockAdapterConfirmAllPending,
  rejectTool: mockAdapterRejectTool,
  rejectAllPending: mockAdapterRejectAllPending,
});

vi.mock("@/lib/agentic/verbalis-agent-adapter", () => ({
  VerbalisAgentAdapter: vi.fn(),
  createVerbalisAdapter: (...args: unknown[]) => mockCreateVerbalisAdapter(...args),
}));

// Import store and dependencies after mocks
import { useAgenticLoopStore, subscribeToToolEvents } from "./agentic-loop-store";
import { createInitialLoopContext, DEFAULT_LOOP_CONFIG } from "@/lib/agentic/types";
import type { ToolCallState } from "@/lib/tools";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeToolCall(overrides: Partial<ToolCallState> = {}): ToolCallState {
  return {
    id: "tc-1",
    name: "test_tool",
    arguments: {},
    status: "pending",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("agentic-loop-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAgenticLoopStore.setState({
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
    });
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------
  describe("initial state", () => {
    it("starts idle with no active adapters", () => {
      const s = useAgenticLoopStore.getState();
      expect(s.currentStatus).toBe("idle");
      expect(s.activeAdapters.size).toBe(0);
      expect(s.activeContexts.size).toBe(0);
      expect(s.currentLoopId).toBeNull();
    });

    it("starts with zero statistics", () => {
      const s = useAgenticLoopStore.getState();
      expect(s.totalIterations).toBe(0);
      expect(s.totalToolCalls).toBe(0);
      expect(s.successfulToolCalls).toBe(0);
      expect(s.failedToolCalls).toBe(0);
    });

    it("starts with empty pending tool calls", () => {
      expect(useAgenticLoopStore.getState().pendingToolCalls).toEqual([]);
    });

    it("has default config", () => {
      expect(useAgenticLoopStore.getState().defaultConfig).toEqual(DEFAULT_LOOP_CONFIG);
    });
  });

  // -----------------------------------------------------------------------
  // createAdapter
  // -----------------------------------------------------------------------
  describe("createAdapter", () => {
    it("creates an adapter and stores it", () => {
      const adapter = useAgenticLoopStore.getState().createAdapter("conv-1", "agent-1");

      expect(adapter).toBeDefined();
      expect(mockCreateVerbalisAdapter).toHaveBeenCalledWith(
        "conv-1",
        "agent-1",
        expect.any(Object),
        expect.any(Object),
      );

      const s = useAgenticLoopStore.getState();
      expect(s.activeAdapters.has("conv-1")).toBe(true);
      expect(s.activeContexts.has("conv-1")).toBe(true);
    });

    it("stops existing adapter before creating new one", () => {
      // Create first adapter
      useAgenticLoopStore.getState().createAdapter("conv-1", "agent-1");
      // Create replacement
      useAgenticLoopStore.getState().createAdapter("conv-1", "agent-2");

      expect(mockAdapterStop).toHaveBeenCalled();
    });

    it("subscribes to events from the adapter", () => {
      useAgenticLoopStore.getState().createAdapter("conv-1", null);
      expect(mockAdapterOnEvent).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  // -----------------------------------------------------------------------
  // getAdapter
  // -----------------------------------------------------------------------
  describe("getAdapter", () => {
    it("returns null for nonexistent conversation", () => {
      expect(useAgenticLoopStore.getState().getAdapter("conv-1")).toBeNull();
    });

    it("returns adapter after creation", () => {
      useAgenticLoopStore.getState().createAdapter("conv-1", null);
      const adapter = useAgenticLoopStore.getState().getAdapter("conv-1");
      expect(adapter).not.toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // removeAdapter
  // -----------------------------------------------------------------------
  describe("removeAdapter", () => {
    it("stops and removes adapter", () => {
      useAgenticLoopStore.getState().createAdapter("conv-1", null);
      vi.clearAllMocks(); // Clear creation calls

      useAgenticLoopStore.getState().removeAdapter("conv-1");

      expect(mockAdapterStop).toHaveBeenCalled();
      expect(useAgenticLoopStore.getState().activeAdapters.has("conv-1")).toBe(false);
      expect(useAgenticLoopStore.getState().activeContexts.has("conv-1")).toBe(false);
    });

    it("resets current loop state when removing the current loop", () => {
      useAgenticLoopStore.getState().createAdapter("conv-1", null);
      useAgenticLoopStore.setState({ currentLoopId: "conv-1", currentStatus: "thinking" });

      useAgenticLoopStore.getState().removeAdapter("conv-1");

      const s = useAgenticLoopStore.getState();
      expect(s.currentLoopId).toBeNull();
      expect(s.currentStatus).toBe("idle");
      expect(s.pendingToolCalls).toEqual([]);
    });

    it("preserves current loop state when removing a different adapter", () => {
      useAgenticLoopStore.getState().createAdapter("conv-1", null);
      useAgenticLoopStore.getState().createAdapter("conv-2", null);
      useAgenticLoopStore.setState({ currentLoopId: "conv-1", currentStatus: "thinking" });

      useAgenticLoopStore.getState().removeAdapter("conv-2");

      expect(useAgenticLoopStore.getState().currentLoopId).toBe("conv-1");
      expect(useAgenticLoopStore.getState().currentStatus).toBe("thinking");
    });
  });

  // -----------------------------------------------------------------------
  // setCurrentLoop
  // -----------------------------------------------------------------------
  describe("setCurrentLoop", () => {
    it("sets current loop to null and resets state", () => {
      useAgenticLoopStore.setState({
        currentLoopId: "conv-1",
        currentStatus: "thinking",
        pendingToolCalls: [makeToolCall()],
      });

      useAgenticLoopStore.getState().setCurrentLoop(null);

      const s = useAgenticLoopStore.getState();
      expect(s.currentLoopId).toBeNull();
      expect(s.currentStatus).toBe("idle");
      expect(s.pendingToolCalls).toEqual([]);
      expect(s.iterations).toEqual([]);
    });

    it("restores state from active context", () => {
      const context = createInitialLoopContext("conv-1", null);
      context.status = "tool_pending";
      useAgenticLoopStore.setState({
        activeContexts: new Map([["conv-1", context]]),
      });

      useAgenticLoopStore.getState().setCurrentLoop("conv-1");

      const s = useAgenticLoopStore.getState();
      expect(s.currentLoopId).toBe("conv-1");
      expect(s.currentStatus).toBe("tool_pending");
    });
  });

  // -----------------------------------------------------------------------
  // stopLoop
  // -----------------------------------------------------------------------
  describe("stopLoop", () => {
    it("stops the adapter for the conversation", () => {
      useAgenticLoopStore.getState().createAdapter("conv-1", null);
      vi.clearAllMocks();

      useAgenticLoopStore.getState().stopLoop("conv-1");

      expect(mockAdapterStop).toHaveBeenCalled();
    });

    it("does nothing for nonexistent conversation", () => {
      useAgenticLoopStore.getState().stopLoop("missing");
      expect(mockAdapterStop).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Tool approval actions
  // -----------------------------------------------------------------------
  describe("tool approval", () => {
    it("confirmTool delegates to adapter", async () => {
      useAgenticLoopStore.getState().createAdapter("conv-1", null);

      await useAgenticLoopStore.getState().confirmTool("conv-1", "tc-1");

      expect(mockAdapterConfirmTool).toHaveBeenCalledWith("tc-1");
    });

    it("confirmAllPending delegates to adapter", async () => {
      useAgenticLoopStore.getState().createAdapter("conv-1", null);

      await useAgenticLoopStore.getState().confirmAllPending("conv-1");

      expect(mockAdapterConfirmAllPending).toHaveBeenCalled();
    });

    it("rejectTool delegates to adapter", () => {
      useAgenticLoopStore.getState().createAdapter("conv-1", null);

      useAgenticLoopStore.getState().rejectTool("conv-1", "tc-1", "Not safe");

      expect(mockAdapterRejectTool).toHaveBeenCalledWith("tc-1", "Not safe");
    });

    it("rejectAllPending delegates to adapter", () => {
      useAgenticLoopStore.getState().createAdapter("conv-1", null);

      useAgenticLoopStore.getState().rejectAllPending("conv-1", "Cancel all");

      expect(mockAdapterRejectAllPending).toHaveBeenCalledWith("Cancel all");
    });

    it("does nothing when adapter not found", async () => {
      await useAgenticLoopStore.getState().confirmTool("missing", "tc-1");
      useAgenticLoopStore.getState().rejectTool("missing", "tc-1");
      // No error should occur
    });
  });

  // -----------------------------------------------------------------------
  // handleLoopEvent - state transitions
  // -----------------------------------------------------------------------
  describe("handleLoopEvent", () => {
    beforeEach(() => {
      useAgenticLoopStore.setState({ currentLoopId: "conv-1" });
    });

    it("loop_started sets status to thinking", () => {
      const context = createInitialLoopContext("conv-1", null);
      useAgenticLoopStore.getState().handleLoopEvent("conv-1", {
        type: "loop_started",
        context,
      });
      expect(useAgenticLoopStore.getState().currentStatus).toBe("thinking");
    });

    it("thinking_started sets status to thinking", () => {
      useAgenticLoopStore.getState().handleLoopEvent("conv-1", {
        type: "thinking_started",
      });
      expect(useAgenticLoopStore.getState().currentStatus).toBe("thinking");
    });

    it("tool_pending adds to pending tool calls", () => {
      const tc = makeToolCall({ id: "tc-1" });
      useAgenticLoopStore.getState().handleLoopEvent("conv-1", {
        type: "tool_pending",
        toolCall: tc,
      });

      const s = useAgenticLoopStore.getState();
      expect(s.currentStatus).toBe("tool_pending");
      expect(s.pendingToolCalls).toHaveLength(1);
      expect(s.pendingToolCalls[0].id).toBe("tc-1");
    });

    it("tool_confirmed removes from pending", () => {
      const tc = makeToolCall({ id: "tc-1" });
      useAgenticLoopStore.setState({ pendingToolCalls: [tc], currentStatus: "tool_pending" });

      useAgenticLoopStore.getState().handleLoopEvent("conv-1", {
        type: "tool_confirmed",
        toolCallId: "tc-1",
      });

      expect(useAgenticLoopStore.getState().pendingToolCalls).toHaveLength(0);
      expect(useAgenticLoopStore.getState().currentStatus).toBe("thinking");
    });

    it("tool_rejected removes from pending", () => {
      const tc = makeToolCall({ id: "tc-1" });
      useAgenticLoopStore.setState({ pendingToolCalls: [tc], currentStatus: "tool_pending" });

      useAgenticLoopStore.getState().handleLoopEvent("conv-1", {
        type: "tool_rejected",
        toolCallId: "tc-1",
        reason: "Not safe",
      });

      expect(useAgenticLoopStore.getState().pendingToolCalls).toHaveLength(0);
      expect(useAgenticLoopStore.getState().currentStatus).toBe("thinking");
    });

    it("tool_executing sets status to tool_executing", () => {
      const tc = makeToolCall({ id: "tc-1", status: "executing" });
      useAgenticLoopStore.getState().handleLoopEvent("conv-1", {
        type: "tool_executing",
        toolCall: tc,
      });
      expect(useAgenticLoopStore.getState().currentStatus).toBe("tool_executing");
    });

    it("tool_completed increments successful stats", () => {
      const tc = makeToolCall({ id: "tc-1", status: "success" });
      useAgenticLoopStore.getState().handleLoopEvent("conv-1", {
        type: "tool_completed",
        toolCall: tc,
      });

      const s = useAgenticLoopStore.getState();
      expect(s.totalToolCalls).toBe(1);
      expect(s.successfulToolCalls).toBe(1);
    });

    it("tool_failed increments failed stats", () => {
      const tc = makeToolCall({ id: "tc-1", status: "error" });
      useAgenticLoopStore.getState().handleLoopEvent("conv-1", {
        type: "tool_failed",
        toolCall: tc,
        error: "Something went wrong",
      });

      const s = useAgenticLoopStore.getState();
      expect(s.totalToolCalls).toBe(1);
      expect(s.failedToolCalls).toBe(1);
    });

    it("tool_cancelled sets status back to thinking", () => {
      const tc = makeToolCall({ id: "tc-1", status: "cancelled" });
      useAgenticLoopStore.setState({ currentStatus: "tool_pending" });
      useAgenticLoopStore.getState().handleLoopEvent("conv-1", {
        type: "tool_cancelled",
        toolCall: tc,
        reason: "Rejected by user",
      });
      expect(useAgenticLoopStore.getState().currentStatus).toBe("thinking");
    });

    it("loop_paused sets status to paused", () => {
      useAgenticLoopStore.getState().handleLoopEvent("conv-1", {
        type: "loop_paused",
      });
      expect(useAgenticLoopStore.getState().currentStatus).toBe("paused");
    });

    it("loop_resumed sets status to thinking", () => {
      useAgenticLoopStore.setState({ currentStatus: "paused" });
      useAgenticLoopStore.getState().handleLoopEvent("conv-1", {
        type: "loop_resumed",
      });
      expect(useAgenticLoopStore.getState().currentStatus).toBe("thinking");
    });

    it("loop_completed sets status to completed and clears pending", () => {
      const context = createInitialLoopContext("conv-1", null);
      useAgenticLoopStore.setState({
        pendingToolCalls: [makeToolCall()],
      });

      useAgenticLoopStore.getState().handleLoopEvent("conv-1", {
        type: "loop_completed",
        context,
        reason: "natural_completion",
      });

      const s = useAgenticLoopStore.getState();
      expect(s.currentStatus).toBe("completed");
      expect(s.pendingToolCalls).toEqual([]);
    });

    it("loop_error sets status to error", () => {
      useAgenticLoopStore.getState().handleLoopEvent("conv-1", {
        type: "loop_error",
        error: "Something failed",
        errorType: "unknown",
      });
      expect(useAgenticLoopStore.getState().currentStatus).toBe("error");
    });

    it("loop_aborted sets status to aborted and clears pending", () => {
      useAgenticLoopStore.setState({ pendingToolCalls: [makeToolCall()] });

      useAgenticLoopStore.getState().handleLoopEvent("conv-1", {
        type: "loop_aborted",
      });

      const s = useAgenticLoopStore.getState();
      expect(s.currentStatus).toBe("aborted");
      expect(s.pendingToolCalls).toEqual([]);
    });

    it("iteration_completed increments totalIterations", () => {
      const iteration = {
        id: "iter-1",
        stepNumber: 1,
        status: "completed" as const,
        toolCalls: [],
        startedAt: new Date(),
        completedAt: new Date(),
      };

      useAgenticLoopStore.getState().handleLoopEvent("conv-1", {
        type: "iteration_completed",
        iteration,
      });

      expect(useAgenticLoopStore.getState().totalIterations).toBe(1);
      expect(useAgenticLoopStore.getState().iterations).toHaveLength(1);
    });

    it("ignores events for non-current loop", () => {
      useAgenticLoopStore.setState({ currentLoopId: "conv-1", currentStatus: "idle" });

      useAgenticLoopStore.getState().handleLoopEvent("conv-OTHER", {
        type: "thinking_started",
      });

      // Status should NOT change
      expect(useAgenticLoopStore.getState().currentStatus).toBe("idle");
    });

    it("iteration_started sets current iteration", () => {
      const iteration = {
        id: "iter-1",
        stepNumber: 1,
        status: "thinking" as const,
        toolCalls: [],
        startedAt: new Date(),
      };

      useAgenticLoopStore.getState().handleLoopEvent("conv-1", {
        type: "iteration_started",
        iteration,
      });

      const s = useAgenticLoopStore.getState();
      expect(s.currentIteration).toEqual(iteration);
      expect(s.currentStatus).toBe("thinking");
    });
  });

  // -----------------------------------------------------------------------
  // updateLoopContext
  // -----------------------------------------------------------------------
  describe("updateLoopContext", () => {
    it("stores context for conversation", () => {
      const context = createInitialLoopContext("conv-1", null);

      useAgenticLoopStore.getState().updateLoopContext("conv-1", context);

      expect(useAgenticLoopStore.getState().activeContexts.get("conv-1")).toEqual(context);
    });

    it("overwrites existing context", () => {
      const ctx1 = createInitialLoopContext("conv-1", null);
      const ctx2 = createInitialLoopContext("conv-1", "agent-2");

      useAgenticLoopStore.getState().updateLoopContext("conv-1", ctx1);
      useAgenticLoopStore.getState().updateLoopContext("conv-1", ctx2);

      expect(useAgenticLoopStore.getState().activeContexts.get("conv-1")?.agentId).toBe("agent-2");
    });
  });

  // -----------------------------------------------------------------------
  // subscribeToToolEvents
  // -----------------------------------------------------------------------
  describe("subscribeToToolEvents", () => {
    it("returns an unsubscribe function", () => {
      const callback = vi.fn();
      const unsub = subscribeToToolEvents(callback);
      expect(typeof unsub).toBe("function");
      unsub();
    });

    it("emits pending and cancelled lifecycle updates to subscribers", () => {
      useAgenticLoopStore.setState({ currentLoopId: "conv-1", currentStatus: "thinking" });
      const callback = vi.fn();
      const unsub = subscribeToToolEvents(callback);

      const pendingTool = makeToolCall({ id: "tc-1", status: "pending_confirmation" });
      const cancelledTool = makeToolCall({ id: "tc-1", status: "cancelled", error: "Rejected by user" });

      useAgenticLoopStore.getState().handleLoopEvent("conv-1", {
        type: "tool_pending",
        toolCall: pendingTool,
      });
      useAgenticLoopStore.getState().handleLoopEvent("conv-1", {
        type: "tool_rejected",
        toolCallId: "tc-1",
        reason: "Rejected by user",
      });
      useAgenticLoopStore.getState().handleLoopEvent("conv-1", {
        type: "tool_cancelled",
        toolCall: cancelledTool,
        reason: "Rejected by user",
      });

      expect(callback).toHaveBeenCalledWith("conv-1", pendingTool);
      expect(callback).toHaveBeenCalledWith("conv-1", cancelledTool);
      expect(useAgenticLoopStore.getState().pendingToolCalls).toHaveLength(0);
      unsub();
    });
  });
});
