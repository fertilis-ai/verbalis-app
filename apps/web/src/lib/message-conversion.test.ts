import { describe, it, expect } from "vitest";
import { buildEmptyUsage, messagesToPiMessages } from "./message-conversion";
import type { Message } from "@/stores/chat-store";
import type { Api } from "@earendil-works/pi-ai";

// ---------------------------------------------------------------------------
// buildEmptyUsage
// ---------------------------------------------------------------------------

describe("buildEmptyUsage", () => {
  it("returns a Usage object with all zeros", () => {
    const usage = buildEmptyUsage();
    expect(usage).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    });
  });

  it("returns a new object each call", () => {
    const a = buildEmptyUsage();
    const b = buildEmptyUsage();
    expect(a).not.toBe(b);
    expect(a.cost).not.toBe(b.cost);
  });
});

// ---------------------------------------------------------------------------
// messagesToPiMessages
// ---------------------------------------------------------------------------

const fakeApi = {} as Api;
const provider = "test-provider";
const model = "test-model";

function makeUserMsg(content: string, date?: Date): Message {
  return {
    id: crypto.randomUUID(),
    role: "user",
    content,
    createdAt: date ?? new Date("2025-01-01T00:00:00Z"),
  };
}

function makeAssistantMsg(
  content: string,
  toolCalls?: Message["toolCalls"],
  date?: Date,
): Message {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content,
    toolCalls,
    createdAt: date ?? new Date("2025-01-01T00:00:01Z"),
  };
}

describe("messagesToPiMessages", () => {
  it("returns empty array for empty input", () => {
    expect(messagesToPiMessages([], fakeApi, provider, model)).toEqual([]);
  });

  it("converts a user message", () => {
    const date = new Date("2025-06-01T12:00:00Z");
    const msgs: Message[] = [makeUserMsg("hello", date)];
    const result = messagesToPiMessages(msgs, fakeApi, provider, model);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      role: "user",
      content: "hello",
      timestamp: date.getTime(),
    });
  });

  it("converts a plain assistant message (no tool calls)", () => {
    const date = new Date("2025-06-01T12:00:01Z");
    const msgs: Message[] = [makeAssistantMsg("thinking...", undefined, date)];
    const result = messagesToPiMessages(msgs, fakeApi, provider, model);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      role: "assistant",
      stopReason: "stop",
      timestamp: date.getTime(),
    });
    // content should contain the text block
    const content = (result[0] as { content: unknown[] }).content;
    expect(content).toEqual([{ type: "text", text: "thinking..." }]);
  });

  it("skips empty assistant messages", () => {
    const msgs: Message[] = [makeAssistantMsg("", undefined)];
    const result = messagesToPiMessages(msgs, fakeApi, provider, model);
    expect(result).toHaveLength(0);
  });

  it("skips whitespace-only assistant messages", () => {
    const msgs: Message[] = [makeAssistantMsg("   \n  ", undefined)];
    const result = messagesToPiMessages(msgs, fakeApi, provider, model);
    expect(result).toHaveLength(0);
  });

  it("includes tool calls with success/error status", () => {
    const msgs: Message[] = [
      makeAssistantMsg("here is my plan", [
        {
          id: "tc1",
          name: "read_file",
          arguments: { path: "/tmp/test.txt" },
          status: "success",
          result: "file contents",
        },
      ]),
    ];

    const result = messagesToPiMessages(msgs, fakeApi, provider, model);
    // assistant message + tool result message
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ role: "assistant", stopReason: "toolUse" });

    const assistantContent = (result[0] as { content: unknown[] }).content;
    expect(assistantContent).toHaveLength(2); // text + toolCall
    expect(assistantContent[1]).toMatchObject({
      type: "toolCall",
      id: "tc1",
      name: "read_file",
    });

    expect(result[1]).toMatchObject({
      role: "toolResult",
      toolCallId: "tc1",
      toolName: "read_file",
      isError: false,
    });
  });

  it("marks tool results with error status as isError=true", () => {
    const msgs: Message[] = [
      makeAssistantMsg("", [
        {
          id: "tc2",
          name: "write_file",
          arguments: {},
          status: "error",
          error: "permission denied",
        },
      ]),
    ];

    const result = messagesToPiMessages(msgs, fakeApi, provider, model);
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({
      role: "toolResult",
      toolCallId: "tc2",
      isError: true,
    });
    const content = (result[1] as { content: { text: string }[] }).content;
    expect(content[0].text).toBe("permission denied");
  });

  it("ignores tool calls with non-terminal status (pending, executing, cancelled)", () => {
    const msgs: Message[] = [
      makeAssistantMsg("some text", [
        { id: "tc3", name: "shell", arguments: {}, status: "pending" },
        { id: "tc4", name: "shell", arguments: {}, status: "executing" },
        { id: "tc5", name: "shell", arguments: {}, status: "cancelled" },
      ]),
    ];

    const result = messagesToPiMessages(msgs, fakeApi, provider, model);
    // Only the assistant message with the text block, no tool calls or tool results
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ role: "assistant", stopReason: "stop" });
  });

  it("handles multiple tool calls in one assistant message", () => {
    const msgs: Message[] = [
      makeAssistantMsg("multi-tool", [
        { id: "a", name: "read_file", arguments: {}, status: "success", result: "ok" },
        { id: "b", name: "write_file", arguments: {}, status: "error", error: "fail" },
      ]),
    ];

    const result = messagesToPiMessages(msgs, fakeApi, provider, model);
    // assistant + 2 tool results
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ role: "assistant", stopReason: "toolUse" });
    expect(result[1]).toMatchObject({ role: "toolResult", toolCallId: "a", isError: false });
    expect(result[2]).toMatchObject({ role: "toolResult", toolCallId: "b", isError: true });
  });

  it("handles a conversation with multiple messages", () => {
    const msgs: Message[] = [
      makeUserMsg("do something"),
      makeAssistantMsg("sure", [
        { id: "tc-x", name: "shell", arguments: {}, status: "success", result: "done" },
      ]),
      makeUserMsg("thanks"),
      makeAssistantMsg("glad to help"),
    ];

    const result = messagesToPiMessages(msgs, fakeApi, provider, model);
    // user + assistant(with tool) + toolResult + user + assistant
    expect(result).toHaveLength(5);
    expect(result.map(m => m.role)).toEqual([
      "user",
      "assistant",
      "toolResult",
      "user",
      "assistant",
    ]);
  });

  it("uses empty string when tool result/error is undefined", () => {
    const msgs: Message[] = [
      makeAssistantMsg("", [
        { id: "tc-empty", name: "noop", arguments: {}, status: "success" },
      ]),
    ];

    const result = messagesToPiMessages(msgs, fakeApi, provider, model);
    expect(result).toHaveLength(2);
    const content = (result[1] as { content: { text: string }[] }).content;
    expect(content[0].text).toBe("");
  });

  it("trims assistant content text", () => {
    const msgs: Message[] = [makeAssistantMsg("  padded text  ")];
    const result = messagesToPiMessages(msgs, fakeApi, provider, model);
    const content = (result[0] as { content: { text: string }[] }).content;
    expect(content[0].text).toBe("padded text");
  });
});
