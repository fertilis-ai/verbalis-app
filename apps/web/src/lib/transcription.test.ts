import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatFromMimeType, blobToBase64, transcribeAudio } from "./transcription";

const mockAppFetch = vi.fn();

vi.mock("@/lib/http", () => ({
  appFetch: (...args: unknown[]) => mockAppFetch(...args),
}));

function jsonResponse(data: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
  } as unknown as Response;
}

describe("formatFromMimeType", () => {
  it("maps common MediaRecorder mime types", () => {
    expect(formatFromMimeType("audio/webm;codecs=opus")).toBe("webm");
    expect(formatFromMimeType("audio/webm")).toBe("webm");
    expect(formatFromMimeType("audio/mp4")).toBe("m4a");
    expect(formatFromMimeType("audio/ogg;codecs=opus")).toBe("ogg");
  });

  it("falls back to webm for unknown types", () => {
    expect(formatFromMimeType("")).toBe("webm");
    expect(formatFromMimeType("audio/unknown")).toBe("webm");
  });
});

describe("blobToBase64", () => {
  it("returns raw base64 without a data-URI prefix", async () => {
    const blob = new Blob(["hello"], { type: "audio/webm" });
    const base64 = await blobToBase64(blob);
    expect(base64).toBe(btoa("hello"));
    expect(base64).not.toContain("data:");
  });
});

describe("transcribeAudio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts base64 audio and returns the transcript", async () => {
    mockAppFetch.mockResolvedValue(jsonResponse({ text: "hello world" }));
    const blob = new Blob(["audio-bytes"], { type: "audio/webm" });

    const text = await transcribeAudio(blob, {
      model: "openai/whisper-large-v3",
      apiKey: "sk-or-key",
      format: "webm",
    });

    expect(text).toBe("hello world");
    expect(mockAppFetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/audio/transcriptions",
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
      model: "openai/whisper-large-v3",
      input_audio: { data: btoa("audio-bytes"), format: "webm" },
    });
  });

  it("returns empty string when the response has no text", async () => {
    mockAppFetch.mockResolvedValue(jsonResponse({}));
    const text = await transcribeAudio(new Blob(["x"]), {
      model: "m",
      apiKey: "k",
      format: "webm",
    });
    expect(text).toBe("");
  });

  it("throws with the extracted error message on non-OK response", async () => {
    mockAppFetch.mockResolvedValue(
      jsonResponse({ error: { message: "Unauthorized" } }, false, 401)
    );
    await expect(
      transcribeAudio(new Blob(["x"]), { model: "m", apiKey: "bad", format: "webm" })
    ).rejects.toThrow("Transcription failed (HTTP 401: Unauthorized)");
  });
});
