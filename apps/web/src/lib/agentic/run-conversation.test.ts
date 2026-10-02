import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { AgentLoopEvent } from "@/lib/agentic/types";
import type { ToolCallState } from "@/lib/tools";
import type { Conversation, Message } from "@/stores/chat-store";

const { mockTrim } = vi.hoisted(() => ({ mockTrim: vi.fn() }));

vi.mock("@/lib/logger", () => ({ logAgent: vi.fn() }));
vi.mock("@/lib/tools", () => ({
  getToolsForContext: vi.fn(() => []),
  normalizeToolCallStatus: (s: string) => s,
}));
vi.mock("@/lib/context/trim", () => ({ trimMessagesToBudget: mockTrim }));

import { applyAdapterEvent, runConversation, updateLastAssistantMessage, type RunConversationDeps } from "./run-conversation";

const NOW = new Date(1000);
const msg = (role: Message["role"], content = "", toolCalls?: ToolCallState[]): Message => ({
  id: `${role}-${content}`,
  role,
  content,
  createdAt: new Date(0),
  ...(toolCalls ? { toolCalls } : {}),
});
const conv = (messages: Message[]): Conversation => ({
  id: "c1",
  title: "t",
  messages,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});
const tc = (id: string): ToolCallState => ({ id, name: "read_file", arguments: {}, status: "pending" });

describe("updateLastAssistantMessage", () => {
  it("patches the last message only when it is from the assistant", () => {
    expect(updateLastAssistantMessage([msg("user"), msg("assistant")], { content: "x" })[1]!.content).toBe("x");
    const userLast = [msg("assistant"), msg("user", "q")];
    expect(updateLastAssistantMessage(userLast, { content: "x" })).toEqual(userLast);
  });
});

describe("applyAdapterEvent", () => {
  const started: AgentLoopEvent = { type: "assistant_message_started", messageId: "m2", iterationId: "i" };

  it("fills the empty placeholder on the first turn", () => {
    const c = conv([msg("user", "q"), msg("assistant")]);
    expect(applyAdapterEvent(c, started, NOW)).toBe(c);
  });

  it("starts a new assistant message after a turn with content", () => {
    const c = conv([msg("user", "q"), msg("assistant", "first")]);
    const next = applyAdapterEvent(c, started, NOW);
    expect(next.messages).toHaveLength(3);
    expect(next.messages[2]).toEqual({ id: "m2", role: "assistant", content: "", createdAt: NOW });
    expect(next.updatedAt).toBe(NOW);
  });

  it("starts a new assistant message after a turn with only tool calls", () => {
    const c = conv([msg("assistant", "  ", [tc("a")])]);
    expect(applyAdapterEvent(c, started, NOW).messages).toHaveLength(2);
  });

  it("sets the full streamed content on text_delta", () => {
    const c = conv([msg("assistant", "Hel")]);
    const next = applyAdapterEvent(c, { type: "text_delta", delta: "lo", fullContent: "Hello", iterationId: "i" }, NOW);
    expect(next.messages[0]!.content).toBe("Hello");
  });

  it("sets content and merges new tool calls on thinking_completed", () => {
    const c = conv([msg("assistant", "draft", [tc("a")])]);
    const next = applyAdapterEvent(c, { type: "thinking_completed", content: "final", toolCalls: [tc("a"), tc("b")] }, NOW);
    expect(next.messages[0]!.content).toBe("final");
    expect(next.messages[0]!.toolCalls?.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("leaves tool calls alone on thinking_completed without any", () => {
    const c = conv([msg("assistant", "draft")]);
    const next = applyAdapterEvent(c, { type: "thinking_completed", content: "final", toolCalls: [] }, NOW);
    expect("toolCalls" in next.messages[0]!).toBe(false);
  });

  it("ignores thinking_completed when the last message is from the user", () => {
    const c = conv([msg("user", "q")]);
    expect(applyAdapterEvent(c, { type: "thinking_completed", content: "x", toolCalls: [] }, NOW)).toBe(c);
  });

  it("appends a loop error to the last assistant message", () => {
    const c = conv([msg("assistant", "partial")]);
    const next = applyAdapterEvent(c, { type: "loop_error", error: "boom", errorType: "unknown" } as AgentLoopEvent, NOW);
    expect(next.messages[0]!.content).toBe("partial\n\nError: boom");
  });

  it("returns the conversation unchanged for other events", () => {
    const c = conv([msg("assistant")]);
    expect(applyAdapterEvent(c, { type: "loop_aborted" }, NOW)).toBe(c);
  });
});

// ---------------------------------------------------------------------------
// runConversation
// ---------------------------------------------------------------------------

const model = {
  id: "m",
  name: "m",
  api: "openai-completions",
  provider: "openrouter",
  baseUrl: "",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 100_000,
  maxTokens: 1000,
} as Model<Api>;

/** A fake adapter whose run() emits the given events to its subscribers. */
function fakeAdapter(events: AgentLoopEvent[] = []) {
  const handlers = new Set<(e: AgentLoopEvent) => void>();
  const adapter = {
    stop: vi.fn(),
    setMessageProvider: vi.fn(),
    onEvent: vi.fn((h: (e: AgentLoopEvent) => void) => {
      handlers.add(h);
      return () => handlers.delete(h);
    }),
    run: vi.fn(async () => {
      for (const e of events) for (const h of handlers) h(e);
      return [];
    }),
    get subscribers() {
      return handlers.size;
    },
  };
  return adapter;
}

function setup(adapters: ReturnType<typeof fakeAdapter>[], existing: ReturnType<typeof fakeAdapter> | null = null) {
  let conversation = conv([msg("user", "q"), msg("assistant")]);
  const calls: string[] = [];
  const queue = [...adapters];
  const loopStore = {
    getAdapter: vi.fn(() => existing),
    createAdapter: vi.fn(() => {
      calls.push("create");
      const next = queue.shift();
      if (!next) throw new Error("no adapter left");
      return next;
    }),
    setCurrentLoop: vi.fn(() => calls.push("setCurrentLoop")),
    releaseAdapter: vi.fn(() => calls.push("release")),
  };
  const deps = {
    loopStore,
    getMessages: () => conversation.messages,
    updateConversation: (fn: (c: Conversation) => Conversation) => {
      conversation = fn(conversation);
    },
    onContextBudget: vi.fn(() => calls.push("budget")),
    onContextTrimmed: vi.fn(),
  } as unknown as RunConversationDeps;
  return { deps, loopStore, calls, conversation: () => conversation };
}

const params = {
  conversationId: "c1",
  agentId: "writer",
  model,
  apiKey: "k",
  reasoning: "high" as const,
  systemPrompt: "sys",
  temperature: 0.3,
  guardrailsConfig: {} as never,
  allowedTools: ["read_file"],
};

beforeEach(() => {
  mockTrim.mockReset();
  mockTrim.mockImplementation(({ messages }) => ({ messages, trimmed: false, droppedCount: 0 }));
});

describe("runConversation", () => {
  it("stops a previous adapter, reports the budget, then runs with the full config", async () => {
    const previous = fakeAdapter();
    const adapter = fakeAdapter();
    const { deps, loopStore, calls } = setup([adapter], previous);

    await runConversation(params, deps);

    expect(previous.stop).toHaveBeenCalled();
    expect(loopStore.createAdapter).toHaveBeenCalledWith("c1", "writer");
    expect(calls).toEqual(["create", "budget", "setCurrentLoop", "release"]);
    expect(adapter.run).toHaveBeenCalledWith(
      expect.objectContaining({
        model,
        systemPrompt: "sys",
        apiKey: "k",
        temperature: 0.3,
        reasoning: "high",
        allowedTools: ["read_file"],
      })
    );
    expect(loopStore.releaseAdapter).toHaveBeenCalledWith("c1", adapter);
    expect(adapter.subscribers).toBe(0);
  });

  it("applies adapter events to the conversation", async () => {
    const adapter = fakeAdapter([{ type: "text_delta", delta: "Hi", fullContent: "Hi", iterationId: "i" }]);
    const { deps, conversation } = setup([adapter]);
    await runConversation(params, deps);
    expect(conversation().messages[1]!.content).toBe("Hi");
  });

  it("provides trimmed history and reports when the window dropped messages", async () => {
    const adapter = fakeAdapter();
    const { deps } = setup([adapter]);
    await runConversation(params, deps);

    const provider = adapter.setMessageProvider.mock.calls[0]![0] as () => Message[];
    mockTrim.mockReturnValueOnce({ messages: [], trimmed: true, droppedCount: 2 });
    expect(provider()).toEqual([]);
    expect(deps.onContextTrimmed).toHaveBeenCalledTimes(1);
    expect(mockTrim).toHaveBeenLastCalledWith(expect.objectContaining({ historyBudgetFactor: 1, systemPrompt: "sys" }));
  });

  it("releases the adapter when run throws", async () => {
    const adapter = fakeAdapter();
    adapter.run.mockRejectedValueOnce(new Error("network"));
    const { deps, loopStore } = setup([adapter]);
    await expect(runConversation(params, deps)).rejects.toThrow("network");
    expect(loopStore.releaseAdapter).toHaveBeenCalledWith("c1", adapter);
  });

  it("retries a context overflow once with a tighter window, hiding the first error", async () => {
    const overflow = { type: "loop_error", error: "too long", errorType: "context_exceeded" } as AgentLoopEvent;
    const first = fakeAdapter([overflow]);
    const second = fakeAdapter([{ type: "text_delta", delta: "ok", fullContent: "ok", iterationId: "i" }]);
    const { deps, loopStore, conversation } = setup([first, second]);

    await runConversation(params, deps);

    expect(loopStore.createAdapter).toHaveBeenCalledTimes(2);
    expect(second.run).toHaveBeenCalled();
    expect(conversation().messages[1]!.content).toBe("ok");

    const provider = second.setMessageProvider.mock.calls[0]![0] as () => Message[];
    provider();
    expect(mockTrim).toHaveBeenLastCalledWith(expect.objectContaining({ historyBudgetFactor: 0.5 }));
  });

  it("shows a second context overflow instead of retrying again", async () => {
    const overflow = { type: "loop_error", error: "too long", errorType: "context_exceeded" } as AgentLoopEvent;
    const { deps, loopStore, conversation } = setup([fakeAdapter([overflow]), fakeAdapter([overflow])]);

    await runConversation(params, deps);

    expect(loopStore.createAdapter).toHaveBeenCalledTimes(2);
    expect(conversation().messages[1]!.content).toBe("\n\nError: too long");
  });

  it("shows other loop errors without retrying", async () => {
    const error = { type: "loop_error", error: "bad key", errorType: "api_error" } as AgentLoopEvent;
    const { deps, loopStore, conversation } = setup([fakeAdapter([error])]);
    await runConversation(params, deps);
    expect(loopStore.createAdapter).toHaveBeenCalledTimes(1);
    expect(conversation().messages[1]!.content).toBe("\n\nError: bad key");
  });
});
