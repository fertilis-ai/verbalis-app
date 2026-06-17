import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentLoopEvent } from "@/lib/agentic/types";
import { DEFAULT_GUARDRAILS_CONFIG } from "@/lib/guardrails/types";

const mockAgentLoop = vi.fn();
const mockExecuteTool = vi.fn();
const mockIsTauri = vi.fn(() => true);
const mockGetToolsForContext = vi.fn();
const mockEvaluate = vi.fn();
const mockToolSupportsUndo = vi.fn((_toolName: string) => false);
const mockPrepareFileWriteUndo = vi.fn();
const mockPrepareFileDeleteUndo = vi.fn();
const mockPrepareDirectoryCreateUndo = vi.fn();
const mockRegisterUndo = vi.fn();

vi.mock("@earendil-works/pi-agent-core", () => ({
  agentLoop: (...args: unknown[]) => mockAgentLoop(...args),
}));

vi.mock("@/lib/storage", () => ({
  isTauri: () => mockIsTauri(),
}));

vi.mock("@/lib/logger", () => ({
  logAgent: vi.fn(),
}));

vi.mock("@/lib/protocol-parser", () => ({
  parseProtocolMarkers: (text: string) => ({ cleanText: text, toolCalls: [] }),
  stripProtocolMarkers: (text: string) => text,
}));

vi.mock("@/lib/message-conversion", () => ({
  buildEmptyUsage: () => ({ inputTokens: 0, outputTokens: 0, totalTokens: 0, costUSD: 0 }),
  messagesToPiMessages: () => [],
}));

vi.mock("@/lib/guardrails/evaluator", () => ({
  getGuardrailsEvaluator: () => ({
    evaluate: (...args: unknown[]) => mockEvaluate(...args),
    recordExecution: vi.fn(),
  }),
}));

vi.mock("@/lib/guardrails/undo-manager", () => ({
  getUndoManager: () => ({
    prepareFileWriteUndo: mockPrepareFileWriteUndo,
    prepareFileDeleteUndo: mockPrepareFileDeleteUndo,
    prepareDirectoryCreateUndo: mockPrepareDirectoryCreateUndo,
    registerUndo: mockRegisterUndo,
  }),
}));

vi.mock("@/lib/tools/execution-tracker", () => ({
  getExecutionTracker: () => ({
    createRecord: () => ({ id: "rec-1" }),
    markPendingConfirmation: vi.fn(),
    markCancelled: vi.fn(),
    markExecuting: vi.fn(),
    markSuccess: vi.fn(),
    markError: vi.fn(),
    setUndoAvailable: vi.fn(),
  }),
}));

vi.mock("@/lib/tools", () => ({
  executeTool: (...args: unknown[]) => mockExecuteTool(...args),
  getToolCategory: () => "file_system",
  getToolRiskLevel: () => "medium",
  getToolsForContext: (...args: unknown[]) => mockGetToolsForContext(...args),
  toolSupportsUndo: (...args: any[]) => mockToolSupportsUndo(args[0]),
  TOOL_DEFINITIONS: {},
}));

import { createSapioAdapter } from "./sapio-agent-adapter";

function createModel() {
  return {
    id: "test-model",
    name: "Test Model",
    api: "anthropic",
    provider: "anthropic",
    baseUrl: "https://example.com",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1000,
    maxTokens: 1000,
  } as const;
}

describe("sapio-agent-adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauri.mockReturnValue(true);
    mockToolSupportsUndo.mockReturnValue(false);
    mockPrepareFileWriteUndo.mockResolvedValue({ path: "/tmp/file.txt", originalContent: null });
    mockPrepareFileDeleteUndo.mockResolvedValue(null);
    mockPrepareDirectoryCreateUndo.mockResolvedValue(null);
    mockRegisterUndo.mockResolvedValue("undo-1");
  });

  it("emits tool_cancelled when a pending confirmation is rejected", async () => {
    mockEvaluate.mockReturnValue({
      allowed: true,
      requiresConfirmation: true,
      reason: "Confirmation required",
      violations: [],
      suggestions: [],
    });
    mockGetToolsForContext.mockReturnValue([
      {
        name: "write_file",
        description: "Write file",
        parameters: {},
      },
    ]);

    mockAgentLoop.mockImplementation((_prompts, context) => {
      const run = (async () => {
        await context.tools[0].execute("tc-1", { path: "/tmp/file.txt", content: "x" });
        return [];
      })();
      async function* stream() {
        yield { type: "turn_start" };
        await run;
        yield { type: "turn_end" };
      }
      const iterable = stream() as AsyncGenerator<unknown> & { result: Promise<unknown[]> };
      iterable.result = run;
      return iterable;
    });

    const adapter = createSapioAdapter("conv-1", null, DEFAULT_GUARDRAILS_CONFIG, {});
    adapter.setMessageProvider(() => []);

    const events: AgentLoopEvent[] = [];
    const runPromise = adapter.run({
      model: createModel() as any,
      systemPrompt: "You are a test assistant.",
      apiKey: "test-key",
      guardrailsConfig: DEFAULT_GUARDRAILS_CONFIG,
      onEvent: (event) => {
        events.push(event);
        if (event.type === "tool_pending") {
          queueMicrotask(() => {
            adapter.rejectTool(event.toolCall.id, "Rejected by user");
          });
        }
      },
    });

    await runPromise;

    const cancelled = events.find((e) => e.type === "tool_cancelled");
    expect(cancelled).toBeDefined();
    if (cancelled?.type === "tool_cancelled") {
      expect(cancelled.reason).toBe("Rejected by user");
      expect(cancelled.toolCall.status).toBe("cancelled");
    }
  });

  it("pauses on delete confirmation and resumes execution when accepted", async () => {
    mockEvaluate.mockImplementation((toolName: string) => {
      if (toolName === "delete_path") {
        return {
          allowed: true,
          requiresConfirmation: true,
          reason: "Confirmation required for high risk file_system tool",
          violations: [],
          suggestions: [],
        };
      }
      return {
        allowed: true,
        requiresConfirmation: false,
        reason: "Tool execution allowed",
        violations: [],
        suggestions: [],
      };
    });

    mockExecuteTool.mockImplementation(async (toolCall: { name: string }) => ({
      toolCallId: toolCall.name === "write_file" ? "tc-write" : "tc-delete",
      toolName: toolCall.name,
      status: "success",
      result: toolCall.name === "write_file" ? "Successfully wrote file" : "Successfully deleted file",
    }));

    mockGetToolsForContext.mockReturnValue([
      { name: "write_file", description: "Write file", parameters: {} },
      { name: "delete_path", description: "Delete path", parameters: {} },
    ]);

    mockAgentLoop.mockImplementation((_prompts, context) => {
      const run = (async () => {
        const writeTool = context.tools.find((t: { name: string }) => t.name === "write_file");
        const deleteTool = context.tools.find((t: { name: string }) => t.name === "delete_path");
        if (!writeTool || !deleteTool) {
          throw new Error("Expected write_file and delete_path tools to be registered");
        }
        await writeTool.execute("tc-write", { path: "/tmp/new.txt", content: "hello" });
        await deleteTool.execute("tc-delete", { path: "/tmp/new.txt" });
        return [];
      })();

      async function* stream() {
        yield { type: "turn_start" };
        await run;
        yield { type: "turn_end" };
      }

      const iterable = stream() as AsyncGenerator<unknown> & { result: Promise<unknown[]> };
      iterable.result = run;
      return iterable;
    });

    const adapter = createSapioAdapter("conv-1", null, DEFAULT_GUARDRAILS_CONFIG, {});
    adapter.setMessageProvider(() => []);

    const events: AgentLoopEvent[] = [];
    await adapter.run({
      model: createModel() as any,
      systemPrompt: "You are a test assistant.",
      apiKey: "test-key",
      guardrailsConfig: DEFAULT_GUARDRAILS_CONFIG,
      onEvent: (event) => {
        events.push(event);
        if (event.type === "tool_pending" && event.toolCall.id === "tc-delete") {
          queueMicrotask(() => adapter.confirmTool("tc-delete"));
        }
      },
    });

    expect(mockExecuteTool).toHaveBeenCalledTimes(2);

    const pendingIdx = events.findIndex((e) => e.type === "tool_pending" && e.toolCall.id === "tc-delete");
    const executingIdx = events.findIndex((e) => e.type === "tool_executing" && e.toolCall.id === "tc-delete");
    const completedIdx = events.findIndex((e) => e.type === "tool_completed" && e.toolCall.id === "tc-delete");

    expect(pendingIdx).toBeGreaterThanOrEqual(0);
    expect(executingIdx).toBeGreaterThan(pendingIdx);
    expect(completedIdx).toBeGreaterThan(executingIdx);
  });

  it("keeps created file action, then cancels delete when declined", async () => {
    mockEvaluate.mockImplementation((toolName: string) => {
      if (toolName === "delete_path") {
        return {
          allowed: true,
          requiresConfirmation: true,
          reason: "Confirmation required for high risk file_system tool",
          violations: [],
          suggestions: [],
        };
      }
      return {
        allowed: true,
        requiresConfirmation: false,
        reason: "Tool execution allowed",
        violations: [],
        suggestions: [],
      };
    });

    mockExecuteTool.mockImplementation(async (toolCall: { name: string }) => ({
      toolCallId: "tc-write",
      toolName: toolCall.name,
      status: "success",
      result: "Successfully wrote file",
    }));

    mockGetToolsForContext.mockReturnValue([
      { name: "write_file", description: "Write file", parameters: {} },
      { name: "delete_path", description: "Delete path", parameters: {} },
    ]);

    mockAgentLoop.mockImplementation((_prompts, context) => {
      const run = (async () => {
        const writeTool = context.tools.find((t: { name: string }) => t.name === "write_file");
        const deleteTool = context.tools.find((t: { name: string }) => t.name === "delete_path");
        if (!writeTool || !deleteTool) {
          throw new Error("Expected write_file and delete_path tools to be registered");
        }
        await writeTool.execute("tc-write", { path: "/tmp/new.txt", content: "hello" });
        await deleteTool.execute("tc-delete", { path: "/tmp/new.txt" });
        return [];
      })();

      async function* stream() {
        yield { type: "turn_start" };
        await run;
        yield { type: "turn_end" };
      }

      const iterable = stream() as AsyncGenerator<unknown> & { result: Promise<unknown[]> };
      iterable.result = run;
      return iterable;
    });

    const adapter = createSapioAdapter("conv-1", null, DEFAULT_GUARDRAILS_CONFIG, {});
    adapter.setMessageProvider(() => []);

    const events: AgentLoopEvent[] = [];
    await adapter.run({
      model: createModel() as any,
      systemPrompt: "You are a test assistant.",
      apiKey: "test-key",
      guardrailsConfig: DEFAULT_GUARDRAILS_CONFIG,
      onEvent: (event) => {
        events.push(event);
        if (event.type === "tool_pending" && event.toolCall.id === "tc-delete") {
          queueMicrotask(() => adapter.rejectTool("tc-delete", "Rejected by user"));
        }
      },
    });

    // write_file executes, delete_path does not
    expect(mockExecuteTool).toHaveBeenCalledTimes(1);
    expect(mockExecuteTool).toHaveBeenCalledWith(expect.objectContaining({ name: "write_file" }));

    const deleteCancelled = events.find((e) => e.type === "tool_cancelled" && e.toolCall.id === "tc-delete");
    expect(deleteCancelled).toBeDefined();
    if (deleteCancelled?.type === "tool_cancelled") {
      expect(deleteCancelled.reason).toBe("Rejected by user");
      expect(deleteCancelled.toolCall.status).toBe("cancelled");
    }
  });

  it("does not double-delete when delete undo preparation already moved target to trash", async () => {
    mockEvaluate.mockReturnValue({
      allowed: true,
      requiresConfirmation: false,
      reason: "Tool execution allowed",
      violations: [],
      suggestions: [],
    });
    mockPrepareFileDeleteUndo.mockResolvedValue({
      originalPath: "/tmp/new.txt",
      trashPath: "/tmp/trash/new.txt",
      wasDirectory: false,
    });
    mockRegisterUndo.mockResolvedValue("undo-delete-1");
    mockToolSupportsUndo.mockImplementation((toolName: string) => toolName === "delete_path");
    mockGetToolsForContext.mockReturnValue([
      { name: "delete_path", description: "Delete path", parameters: {} },
    ]);

    mockAgentLoop.mockImplementation((_prompts, context) => {
      const run = (async () => {
        await context.tools[0].execute("tc-delete", { path: "/tmp/new.txt" });
        return [];
      })();

      async function* stream() {
        yield { type: "turn_start" };
        await run;
        yield { type: "turn_end" };
      }

      const iterable = stream() as AsyncGenerator<unknown> & { result: Promise<unknown[]> };
      iterable.result = run;
      return iterable;
    });

    const adapter = createSapioAdapter("conv-1", null, DEFAULT_GUARDRAILS_CONFIG, {});
    adapter.setMessageProvider(() => []);

    const events: AgentLoopEvent[] = [];
    await adapter.run({
      model: createModel() as any,
      systemPrompt: "You are a test assistant.",
      apiKey: "test-key",
      guardrailsConfig: DEFAULT_GUARDRAILS_CONFIG,
      onEvent: (event) => {
        events.push(event);
      },
    });

    expect(mockPrepareFileDeleteUndo).toHaveBeenCalledTimes(1);
    expect(mockRegisterUndo).toHaveBeenCalledTimes(1);
    expect(mockExecuteTool).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === "tool_completed" && e.toolCall.id === "tc-delete")).toBe(true);
    expect(events.some((e) => e.type === "tool_failed" && e.toolCall.id === "tc-delete")).toBe(false);
  });

  it("emits loop_aborted once and keeps aborted state when stopped", async () => {
    mockIsTauri.mockReturnValue(false);
    mockAgentLoop.mockImplementation((_prompts, _context, _loopConfig, signal) => {
      const run = new Promise<unknown[]>((resolve) => {
        signal?.addEventListener("abort", () => resolve([]), { once: true });
      });

      async function* stream() {
        while (!signal?.aborted) {
          await new Promise((resolve) => setTimeout(resolve, 5));
          yield { type: "turn_start" };
        }
        throw new Error("aborted");
      }

      const iterable = stream() as AsyncGenerator<unknown> & { result: Promise<unknown[]> };
      iterable.result = run;
      return iterable;
    });

    const adapter = createSapioAdapter("conv-1", null, DEFAULT_GUARDRAILS_CONFIG, {});
    adapter.setMessageProvider(() => []);

    let abortedCount = 0;
    const runPromise = adapter.run({
      model: createModel() as any,
      systemPrompt: "You are a test assistant.",
      apiKey: "test-key",
      guardrailsConfig: DEFAULT_GUARDRAILS_CONFIG,
      onEvent: (event) => {
        if (event.type === "loop_aborted") {
          abortedCount += 1;
        }
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    adapter.stop();
    await runPromise;

    expect(abortedCount).toBe(1);
    expect(adapter.getContext().status).toBe("aborted");
  });

  it("emits guardrail block feedback and aborts loop on hard policy block", async () => {
    mockEvaluate.mockReturnValue({
      allowed: false,
      requiresConfirmation: false,
      reason: "Blocked by guardrails policy",
      violations: [
        {
          type: "blocked_path",
          message: "\"/etc/passwd\" matches blocked pattern \"/etc/*\"",
          severity: "error",
        },
      ],
      suggestions: [],
    });
    mockGetToolsForContext.mockReturnValue([
      {
        name: "read_file",
        description: "Read file",
        parameters: {},
      },
    ]);

    mockAgentLoop.mockImplementation((_prompts, context) => {
      const run = (async () => {
        await context.tools[0].execute("tc-guardrail", { path: "/etc/passwd" });
        return [];
      })();
      async function* stream() {
        yield { type: "turn_start" };
        await run;
        yield { type: "turn_end" };
      }
      const iterable = stream() as AsyncGenerator<unknown> & { result: Promise<unknown[]> };
      iterable.result = run;
      return iterable;
    });

    const adapter = createSapioAdapter("conv-1", null, DEFAULT_GUARDRAILS_CONFIG, {});
    adapter.setMessageProvider(() => []);

    const events: AgentLoopEvent[] = [];
    await adapter.run({
      model: createModel() as any,
      systemPrompt: "You are a test assistant.",
      apiKey: "test-key",
      guardrailsConfig: DEFAULT_GUARDRAILS_CONFIG,
      onEvent: (event) => {
        events.push(event);
      },
    });

    const cancelled = events.find((e) => e.type === "tool_cancelled");
    expect(cancelled).toBeDefined();
    if (cancelled?.type === "tool_cancelled") {
      expect(cancelled.reason).toBe("Blocked by guardrails policy");
      expect(cancelled.toolCall.guardrailReason).toBe("Blocked by guardrails policy");
      expect(cancelled.toolCall.guardrailViolations?.[0]?.type).toBe("blocked_path");
    }

    const abortedCount = events.filter((e) => e.type === "loop_aborted").length;
    expect(abortedCount).toBe(1);
    expect(adapter.getContext().status).toBe("aborted");
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it("emits tool_failed when pre-execution guardrail evaluation throws", async () => {
    mockEvaluate.mockImplementation(() => {
      throw new Error("Guardrails evaluator crashed");
    });
    mockGetToolsForContext.mockReturnValue([
      {
        name: "write_file",
        description: "Write file",
        parameters: {},
      },
    ]);

    mockAgentLoop.mockImplementation((_prompts, context) => {
      const run = (async () => {
        try {
          await context.tools[0].execute("tc-preflight", { path: "/tmp/test.txt", content: "x" });
          return { isError: false, text: "ok" };
        } catch (error) {
          return {
            isError: true,
            text: error instanceof Error ? error.message : String(error),
          };
        }
      })();

      async function* stream() {
        yield { type: "turn_start" };
        yield {
          type: "message_start",
          message: { role: "assistant", content: [] },
        };
        yield {
          type: "message_end",
          message: {
            role: "assistant",
            content: [
              {
                type: "toolCall",
                id: "tc-preflight",
                name: "write_file",
                arguments: { path: "/tmp/test.txt", content: "x" },
              },
            ],
          },
        };

        const result = await run;
        yield {
          type: "tool_execution_end",
          toolCallId: "tc-preflight",
          toolName: "write_file",
          result: {
            content: [{ type: "text", text: result.text }],
            details: {},
          },
          isError: result.isError,
        };
        yield { type: "turn_end" };
      }

      const iterable = stream() as AsyncGenerator<unknown> & { result: Promise<unknown[]> };
      iterable.result = run.then(() => []);
      return iterable;
    });

    const adapter = createSapioAdapter("conv-1", null, DEFAULT_GUARDRAILS_CONFIG, {});
    adapter.setMessageProvider(() => []);

    const events: AgentLoopEvent[] = [];
    await adapter.run({
      model: createModel() as any,
      systemPrompt: "You are a test assistant.",
      apiKey: "test-key",
      guardrailsConfig: DEFAULT_GUARDRAILS_CONFIG,
      onEvent: (event) => {
        events.push(event);
      },
    });

    expect(events.some((e) => e.type === "tool_failed" && e.toolCall.id === "tc-preflight")).toBe(true);
    expect(events.some((e) => e.type === "tool_completed" && e.toolCall.id === "tc-preflight")).toBe(false);
  });

  it("cancels undispatched tool calls and aborts loop to avoid silent retries", async () => {
    mockEvaluate.mockReturnValue({
      allowed: true,
      requiresConfirmation: false,
      reason: "Tool execution allowed",
      violations: [],
      suggestions: [],
    });
    mockGetToolsForContext.mockReturnValue([
      {
        name: "write_file",
        description: "Write file",
        parameters: {},
      },
    ]);

    mockAgentLoop.mockImplementation(() => {
      async function* stream() {
        yield { type: "turn_start" };
        yield {
          type: "message_start",
          message: { role: "assistant", content: [] },
        };
        yield {
          type: "message_end",
          message: {
            role: "assistant",
            content: [
              {
                type: "toolCall",
                id: "tc-undispatched",
                name: "write_file",
                arguments: { path: "/tmp/test.md", content: "hello" },
              },
            ],
          },
        };
        // No tool_execution_* events and no wrapped execute call.
        // Next turn start should trigger undispatched safeguard and abort.
        yield { type: "turn_start" };
      }

      const iterable = stream() as AsyncGenerator<unknown> & { result: Promise<unknown[]> };
      iterable.result = Promise.resolve([]);
      return iterable;
    });

    const adapter = createSapioAdapter("conv-1", null, DEFAULT_GUARDRAILS_CONFIG, {});
    adapter.setMessageProvider(() => []);

    const events: AgentLoopEvent[] = [];
    await adapter.run({
      model: createModel() as any,
      systemPrompt: "You are a test assistant.",
      apiKey: "test-key",
      guardrailsConfig: DEFAULT_GUARDRAILS_CONFIG,
      onEvent: (event) => {
        events.push(event);
      },
    });

    const cancelled = events.find((e) => e.type === "tool_cancelled");
    expect(cancelled).toBeDefined();
    if (cancelled?.type === "tool_cancelled") {
      expect(cancelled.toolCall.id).toBe("tc-undispatched");
      expect(cancelled.reason).toContain("not dispatched");
    }

    expect(events.some((e) => e.type === "loop_aborted")).toBe(true);
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it("does not cancel a tool call that was already executed when the same id appears again", async () => {
    mockEvaluate.mockReturnValue({
      allowed: true,
      requiresConfirmation: false,
      reason: "Tool execution allowed",
      violations: [],
      suggestions: [],
    });
    mockExecuteTool.mockResolvedValue({
      toolCallId: "tc-repeat",
      toolName: "write_file",
      status: "success",
      result: "ok",
    });
    mockGetToolsForContext.mockReturnValue([
      {
        name: "write_file",
        description: "Write file",
        parameters: {},
      },
    ]);

    mockAgentLoop.mockImplementation((_prompts, context) => {
      const run = (async () => {
        await context.tools[0].execute("tc-repeat", { path: "/tmp/test.md", content: "hello" });
        return [];
      })();

      async function* stream() {
        yield { type: "turn_start" };
        yield {
          type: "message_start",
          message: { role: "assistant", content: [] },
        };
        yield {
          type: "message_end",
          message: {
            role: "assistant",
            content: [
              {
                type: "toolCall",
                id: "tc-repeat",
                name: "write_file",
                arguments: { path: "/tmp/test.md", content: "hello" },
              },
            ],
          },
        };
        await run;
        // Some runtimes may re-emit the same assistant toolCall block.
        yield {
          type: "message_end",
          message: {
            role: "assistant",
            content: [
              {
                type: "toolCall",
                id: "tc-repeat",
                name: "write_file",
                arguments: { path: "/tmp/test.md", content: "hello" },
              },
            ],
          },
        };
        yield { type: "turn_start" };
      }

      const iterable = stream() as AsyncGenerator<unknown> & { result: Promise<unknown[]> };
      iterable.result = run;
      return iterable;
    });

    const adapter = createSapioAdapter("conv-1", null, DEFAULT_GUARDRAILS_CONFIG, {});
    adapter.setMessageProvider(() => []);

    const events: AgentLoopEvent[] = [];
    await adapter.run({
      model: createModel() as any,
      systemPrompt: "You are a test assistant.",
      apiKey: "test-key",
      guardrailsConfig: DEFAULT_GUARDRAILS_CONFIG,
      onEvent: (event) => {
        events.push(event);
      },
    });

    expect(events.some((e) => e.type === "tool_completed")).toBe(true);
    expect(events.some((e) => e.type === "tool_cancelled")).toBe(false);
    expect(events.some((e) => e.type === "loop_aborted")).toBe(false);
  });
});
