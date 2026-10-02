import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Api, Model } from "@earendil-works/pi-ai";

const { mockStreamSimple } = vi.hoisted(() => ({ mockStreamSimple: vi.fn() }));

vi.mock("@earendil-works/pi-ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@earendil-works/pi-ai")>()),
  streamSimple: mockStreamSimple,
}));

import { streamPlain } from "./stream-plain";

const model = {
  id: "m",
  name: "m",
  api: "openai-completions",
  provider: "openrouter",
  baseUrl: "",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1000,
  maxTokens: 100,
} as Model<Api>;

function streamOf(events: unknown[]) {
  return (async function* () {
    yield* events;
  })();
}

const run = (onContent: (c: string) => void, fallbackError = "fallback") =>
  streamPlain({
    model,
    systemPrompt: "sys",
    messages: [{ id: "u", role: "user", content: "hi", createdAt: new Date(0) }],
    options: { apiKey: "k", temperature: 0.5 },
    fallbackError,
    onContent,
  });

beforeEach(() => mockStreamSimple.mockReset());

describe("streamPlain", () => {
  it("sends the system prompt, converted history and options", async () => {
    mockStreamSimple.mockReturnValue(streamOf([]));
    await run(() => {});
    const [sentModel, context, options] = mockStreamSimple.mock.calls[0]!;
    expect(sentModel).toBe(model);
    expect(context.systemPrompt).toBe("sys");
    expect(context.messages).toHaveLength(1);
    expect(context.messages[0]).toMatchObject({ role: "user" });
    expect(options).toEqual({ apiKey: "k", temperature: 0.5 });
  });

  it("reports the accumulated content after each delta, ignoring other events", async () => {
    mockStreamSimple.mockReturnValue(
      streamOf([
        { type: "start" },
        { type: "text_delta", delta: "Hel" },
        { type: "thinking_delta", delta: "hmm" },
        { type: "text_delta", delta: "lo" },
      ])
    );
    const seen: string[] = [];
    await run((c) => seen.push(c));
    expect(seen).toEqual(["Hel", "Hello"]);
  });

  it("strips protocol markers from the reported content", async () => {
    mockStreamSimple.mockReturnValue(
      streamOf([{ type: "text_delta", delta: `Hi <|channel|>commentary to=tool code<|message|>{"a":1}` }])
    );
    const seen: string[] = [];
    await run((c) => seen.push(c));
    expect(seen[0]).toContain("Hi");
    expect(seen[0]).not.toContain("<|channel|>");
  });

  it("throws the provider's error message", async () => {
    mockStreamSimple.mockReturnValue(streamOf([{ type: "error", error: { errorMessage: "Rate limited" } }]));
    await expect(run(() => {})).rejects.toThrow("Rate limited");
  });

  it("throws the fallback message when the provider gives none", async () => {
    mockStreamSimple.mockReturnValue(streamOf([{ type: "error", error: {} }]));
    await expect(run(() => {}, "Local LLM error")).rejects.toThrow("Local LLM error");
  });
});
