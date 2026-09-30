import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  formatFromMimeType,
  blobToBase64,
  encodeWav,
  recordingToWav,
  transcribeAudio,
} from "./transcription";

const mockAppFetch = vi.fn();

vi.mock("@/lib/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http")>()),
  appFetch: (...args: unknown[]) => mockAppFetch(...args),
}));

function jsonResponse(data: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
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

  it("requests ZDR routing only when asked", async () => {
    mockAppFetch.mockResolvedValue(jsonResponse({ text: "x" }));
    const blob = new Blob(["a"], { type: "audio/webm" });
    const bodyOf = () =>
      JSON.parse((mockAppFetch.mock.calls.at(-1)?.[1] as RequestInit).body as string);

    await transcribeAudio(blob, { model: "m", apiKey: "k", format: "webm", zdr: true });
    expect(bodyOf().provider).toEqual({ zdr: true });

    await transcribeAudio(blob, { model: "m", apiKey: "k", format: "webm" });
    expect(bodyOf()).not.toHaveProperty("provider");
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
    ).rejects.toThrow("Transcription failed (HTTP 401: Unauthorized; sent webm audio)");
  });
});

/** A stereo AudioBuffer stand-in: left and right channel samples. */
function pcm(left: number[], right: number[], sampleRate = 8000) {
  return {
    numberOfChannels: 2,
    sampleRate,
    length: left.length,
    getChannelData: (i: number) => new Float32Array(i === 0 ? left : right),
  };
}

describe("encodeWav", () => {
  it("writes a 16-bit mono PCM header and averages channels", () => {
    const view = new DataView(encodeWav(pcm([1, -1, 0.5], [1, -1, -0.5])));
    const ascii = (offset: number) =>
      String.fromCharCode(...Array.from({ length: 4 }, (_, i) => view.getUint8(offset + i)));
    expect(view.byteLength).toBe(44 + 3 * 2);
    expect([ascii(0), ascii(8), ascii(12), ascii(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(view.getUint32(4, true)).toBe(36 + 6);
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(8000);
    expect(view.getUint32(28, true)).toBe(16000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(6);
    expect([view.getInt16(44, true), view.getInt16(46, true), view.getInt16(48, true)]).toEqual([
      0x7fff, -0x8000, 0,
    ]);
  });
});

describe("WAV re-encoding", () => {
  const decodeAudioData = vi.fn();
  const close = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    mockAppFetch.mockReset();
    decodeAudioData.mockReset();
    vi.stubGlobal(
      "AudioContext",
      class {
        decodeAudioData = decodeAudioData;
        close = close;
      }
    );
    return () => vi.unstubAllGlobals();
  });

  it("returns null when Web Audio is unavailable", async () => {
    vi.stubGlobal("AudioContext", undefined);
    expect(await recordingToWav(new Blob(["x"]))).toBeNull();
  });

  it("sends decodable audio as wav", async () => {
    decodeAudioData.mockResolvedValue(pcm([0, 0], [0, 0]));
    mockAppFetch.mockResolvedValue(jsonResponse({ text: "hi" }));
    await transcribeAudio(new Blob(["x"], { type: "audio/mp4" }), {
      model: "m",
      apiKey: "k",
      format: "m4a",
    });
    const body = JSON.parse(mockAppFetch.mock.calls[0][1].body);
    expect(body.input_audio.format).toBe("wav");
    expect(atob(body.input_audio.data).slice(0, 4)).toBe("RIFF");
    expect(close).toHaveBeenCalled();
  });

  it("falls back to the recorded format when decoding fails", async () => {
    decodeAudioData.mockRejectedValue(new Error("EncodingError"));
    mockAppFetch.mockResolvedValue(jsonResponse({ text: "hi" }));
    await transcribeAudio(new Blob(["audio-bytes"]), { model: "m", apiKey: "k", format: "webm" });
    const body = JSON.parse(mockAppFetch.mock.calls[0][1].body);
    expect(body.input_audio).toEqual({ data: btoa("audio-bytes"), format: "webm" });
  });
});
