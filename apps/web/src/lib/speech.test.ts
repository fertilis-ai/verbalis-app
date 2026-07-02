import { describe, it, expect, vi, beforeEach } from "vitest";
import { stripMarkdownForSpeech, synthesizeSpeech } from "./speech";

const mockAppFetch = vi.fn();

vi.mock("@/lib/http", () => ({
  appFetch: (...args: unknown[]) => mockAppFetch(...args),
}));

function audioResponse(bytes = new Uint8Array([1, 2, 3])): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: () => Promise.resolve(bytes.buffer),
  } as unknown as Response;
}

function errorResponse(data: unknown, status = 400): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve(data),
  } as unknown as Response;
}

describe("stripMarkdownForSpeech", () => {
  it("drops fenced code blocks entirely", () => {
    expect(stripMarkdownForSpeech("Before.\n```ts\nconst x = 1;\n```\nAfter.")).toBe(
      "Before.\n\nAfter."
    );
  });

  it("keeps inline code content without backticks", () => {
    expect(stripMarkdownForSpeech("Run `bun install` first.")).toBe("Run bun install first.");
  });

  it("replaces links and images with their text", () => {
    expect(stripMarkdownForSpeech("See [the docs](https://example.com).")).toBe("See the docs.");
    expect(stripMarkdownForSpeech("![a chart](img.png)")).toBe("a chart");
  });

  it("strips heading, emphasis, blockquote, and list markers", () => {
    expect(stripMarkdownForSpeech("## Title\n\n> quoted\n\n- item one\n2. item two")).toBe(
      "Title\n\nquoted\n\nitem one\nitem two"
    );
    expect(stripMarkdownForSpeech("This is **bold** and _italic_.")).toBe(
      "This is bold and italic."
    );
  });

  it("removes horizontal rules and collapses blank lines", () => {
    expect(stripMarkdownForSpeech("a\n\n---\n\n\n\nb")).toBe("a\n\nb");
  });
});

describe("synthesizeSpeech", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts the text and returns an mp3 blob", async () => {
    mockAppFetch.mockResolvedValue(audioResponse());

    const blob = await synthesizeSpeech("Hello world", {
      model: "x-ai/grok-voice-tts-1.0",
      voice: "eve",
      apiKey: "sk-or-key",
    });

    expect(blob.type).toBe("audio/mpeg");
    expect(blob.size).toBe(3);
    expect(mockAppFetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/audio/speech",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer sk-or-key",
          "Content-Type": "application/json",
        },
      })
    );
    const body = JSON.parse((mockAppFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({
      model: "x-ai/grok-voice-tts-1.0",
      input: "Hello world",
      response_format: "mp3",
      voice: "eve",
    });
  });

  it("omits the voice field when no voice is given", async () => {
    mockAppFetch.mockResolvedValue(audioResponse());
    await synthesizeSpeech("Hi", { model: "m", apiKey: "k" });
    const body = JSON.parse((mockAppFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body).not.toHaveProperty("voice");
  });

  it("throws with the extracted error message on non-OK response", async () => {
    mockAppFetch.mockResolvedValue(errorResponse({ error: { message: "Unauthorized" } }, 401));
    await expect(synthesizeSpeech("Hi", { model: "m", apiKey: "bad" })).rejects.toThrow(
      "Speech synthesis failed (HTTP 401: Unauthorized)"
    );
  });

  it("falls back to the bare status when the error body is not JSON", async () => {
    mockAppFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("not json")),
    } as unknown as Response);
    await expect(synthesizeSpeech("Hi", { model: "m", apiKey: "k" })).rejects.toThrow(
      "Speech synthesis failed (HTTP 500)"
    );
  });
});
