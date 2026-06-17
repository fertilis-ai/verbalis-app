import { describe, it, expect } from "vitest";
import { trimMessagesToBudget } from "./trim";
import type { Message } from "@/stores/chat-store";

let idCounter = 0;
function user(content: string): Message {
  return { id: `u${++idCounter}`, role: "user", content, createdAt: new Date(0) };
}
function assistant(content: string, toolCalls?: Message["toolCalls"]): Message {
  return { id: `a${++idCounter}`, role: "assistant", content, createdAt: new Date(0), toolCalls };
}

describe("trimMessagesToBudget", () => {
  it("returns messages unchanged when within budget", () => {
    const messages = [user("hi"), assistant("hello")];
    const result = trimMessagesToBudget({
      messages,
      systemPrompt: "sys",
      contextWindow: 100_000,
      maxTokens: 1000,
    });
    expect(result.trimmed).toBe(false);
    expect(result.droppedCount).toBe(0);
    expect(result.messages).toBe(messages);
  });

  it("drops oldest messages until it fits the budget", () => {
    // Each message ~250 tokens (1000 chars). Tiny window forces trimming.
    const big = "x".repeat(1000);
    const messages = [
      user(big),
      assistant(big),
      user(big),
      assistant(big),
      user(big),
      assistant(big),
    ];
    const result = trimMessagesToBudget({
      messages,
      systemPrompt: "",
      contextWindow: 800, // available 800 - reserve
      maxTokens: 100,
      minRecentMessages: 2,
    });
    expect(result.trimmed).toBe(true);
    expect(result.messages.length).toBeLessThan(messages.length);
    // Most-recent messages are retained.
    expect(result.messages[result.messages.length - 1]).toBe(messages[messages.length - 1]);
  });

  it("never drops below minRecentMessages", () => {
    const big = "x".repeat(4000);
    const messages = [user(big), assistant(big), user(big), assistant(big)];
    const result = trimMessagesToBudget({
      messages,
      systemPrompt: "",
      contextWindow: 100, // impossibly small
      maxTokens: 10,
      minRecentMessages: 2,
    });
    expect(result.messages.length).toBe(2);
  });

  it("normalises the window to start on a user message", () => {
    const big = "x".repeat(1000);
    // After dropping, the front might be an assistant message; it should be removed.
    const messages = [
      user(big),
      assistant(big),
      assistant(big), // would be leading after trim
      user(big),
      assistant(big),
    ];
    const result = trimMessagesToBudget({
      messages,
      systemPrompt: "",
      contextWindow: 700,
      maxTokens: 100,
      minRecentMessages: 1,
    });
    expect(result.messages[0].role).toBe("user");
  });

  it("tightens with a lower historyBudgetFactor", () => {
    const big = "x".repeat(1000);
    const messages = [user(big), assistant(big), user(big), assistant(big)];
    const loose = trimMessagesToBudget({
      messages,
      systemPrompt: "",
      contextWindow: 2000,
      maxTokens: 100,
      minRecentMessages: 1,
      historyBudgetFactor: 1,
    });
    const tight = trimMessagesToBudget({
      messages,
      systemPrompt: "",
      contextWindow: 2000,
      maxTokens: 100,
      minRecentMessages: 1,
      historyBudgetFactor: 0.3,
    });
    expect(tight.messages.length).toBeLessThanOrEqual(loose.messages.length);
  });

  it("keeps tool-call messages intact (whole-message granularity)", () => {
    const big = "x".repeat(1000);
    const toolMsg = assistant("", [
      { id: "t1", name: "read_file", arguments: { path: "a" }, status: "success", result: big },
    ]);
    const messages = [user(big), toolMsg, user(big), assistant(big)];
    const result = trimMessagesToBudget({
      messages,
      systemPrompt: "",
      contextWindow: 700,
      maxTokens: 100,
      minRecentMessages: 1,
    });
    // Any retained message is intact (no partial tool calls possible).
    for (const m of result.messages) {
      if (m.toolCalls) {
        expect(m.toolCalls.every((tc) => tc.id && tc.name)).toBe(true);
      }
    }
  });
});
