import { describe, it, expect } from "vitest";
import {
  estimateTokensForText,
  estimateTokensForMessage,
  estimateTokensForMessages,
  estimateTokensForTools,
  computeContextBudget,
  reconcileWithUsage,
} from "./token-estimate";
import type { Message } from "@/stores/chat-store";
import type { Tool, Usage } from "@earendil-works/pi-ai";

function msg(partial: Partial<Message>): Message {
  return {
    id: "m1",
    role: "user",
    content: "",
    createdAt: new Date(0),
    ...partial,
  };
}

describe("estimateTokensForText", () => {
  it("returns 0 for empty/nullish", () => {
    expect(estimateTokensForText("")).toBe(0);
    expect(estimateTokensForText(undefined)).toBe(0);
    expect(estimateTokensForText(null)).toBe(0);
  });

  it("uses a chars/4 ceiling heuristic", () => {
    expect(estimateTokensForText("abcd")).toBe(1);
    expect(estimateTokensForText("abcde")).toBe(2);
    expect(estimateTokensForText("a".repeat(400))).toBe(100);
  });
});

describe("estimateTokensForMessage", () => {
  it("counts content plus per-message overhead", () => {
    // 4 chars => 1 token + 4 overhead
    expect(estimateTokensForMessage(msg({ content: "abcd" }))).toBe(5);
  });

  it("counts finished tool calls (name, args, result) but ignores in-flight ones", () => {
    const withTools = msg({
      role: "assistant",
      content: "",
      toolCalls: [
        {
          id: "t1",
          name: "read_file",
          arguments: { path: "x" },
          status: "success",
          result: "hello world",
        },
        {
          id: "t2",
          name: "write_file",
          arguments: {},
          status: "pending", // ignored
        },
      ],
    });
    const tokens = estimateTokensForMessage(withTools);
    // overhead(4) + content(0) + name + args + resultOverhead(4) + result
    expect(tokens).toBeGreaterThan(4);
    // pending tool contributes nothing beyond base
    const onlyPending = msg({
      role: "assistant",
      content: "",
      toolCalls: [{ id: "t2", name: "write_file", arguments: {}, status: "pending" }],
    });
    expect(estimateTokensForMessage(onlyPending)).toBe(4);
  });
});

describe("estimateTokensForMessages", () => {
  it("sums across messages", () => {
    const a = msg({ content: "abcd" });
    const b = msg({ content: "abcd" });
    expect(estimateTokensForMessages([a, b])).toBe(estimateTokensForMessage(a) * 2);
  });
});

describe("estimateTokensForTools", () => {
  it("returns 0 for empty", () => {
    expect(estimateTokensForTools(undefined)).toBe(0);
    expect(estimateTokensForTools([])).toBe(0);
  });

  it("estimates from serialized schema length", () => {
    const tools: Tool[] = [
      { name: "read_file", description: "Read a file", parameters: { type: "object" } as Tool["parameters"] },
    ];
    expect(estimateTokensForTools(tools)).toBeGreaterThan(0);
  });
});

describe("computeContextBudget", () => {
  it("computes used/available/remaining and withinBudget", () => {
    const budget = computeContextBudget({
      systemPrompt: "a".repeat(400), // 100 tokens
      tools: undefined,
      messages: [msg({ content: "a".repeat(400) })], // 100 + 4 overhead
      contextWindow: 1000,
      maxTokens: 200,
    });
    expect(budget.systemTokens).toBe(100);
    expect(budget.historyTokens).toBe(104);
    expect(budget.used).toBe(204);
    expect(budget.available).toBe(800);
    expect(budget.remaining).toBe(596);
    expect(budget.withinBudget).toBe(true);
  });

  it("flags over-budget prompts", () => {
    const budget = computeContextBudget({
      systemPrompt: "a".repeat(4000), // 1000 tokens
      messages: [],
      contextWindow: 1000,
      maxTokens: 200,
    });
    expect(budget.withinBudget).toBe(false);
    expect(budget.remaining).toBeLessThan(0);
  });
});

describe("reconcileWithUsage", () => {
  const usage = (input: number): Usage => ({
    input,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: input,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  });

  it("returns the actual/estimated ratio", () => {
    expect(reconcileWithUsage(100, usage(120))).toBeCloseTo(1.2);
  });

  it("returns null when not usable", () => {
    expect(reconcileWithUsage(0, usage(100))).toBeNull();
    expect(reconcileWithUsage(100, undefined)).toBeNull();
    expect(reconcileWithUsage(100, usage(0))).toBeNull();
  });
});
