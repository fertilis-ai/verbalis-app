import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockSynthesizeSpeech = vi.fn();
const mockToastError = vi.fn();

vi.mock("@/lib/speech", () => ({
  MAX_SPEECH_INPUT_CHARS: 4096,
  stripMarkdownForSpeech: (md: string) => md,
  synthesizeSpeech: (...args: unknown[]) => mockSynthesizeSpeech(...args),
}));

vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

vi.mock("@/stores/settings-store", () => ({
  useSettingsStore: {
    getState: () => ({
      apiKeys: { anthropic: "", openai: "", google: "", openrouter: "sk-or-key" },
      speechModel: "x-ai/grok-voice-tts-1.0",
      speechVoice: "eve",
      availableSpeechModels: [
        { id: "x-ai/grok-voice-tts-1.0", name: "Grok Voice TTS", voices: ["eve", "ara"] },
      ],
    }),
  },
}));

import { useSpeechPlayback } from "./use-speech-playback";

// ---------------------------------------------------------------------------
// Browser API stubs
// ---------------------------------------------------------------------------

class FakeAudio {
  static instances: FakeAudio[] = [];
  currentTime = 0;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();

  constructor(public src: string) {
    FakeAudio.instances.push(this);
  }
}

const mockCreateObjectURL = vi.fn(() => "blob:mock");
const mockRevokeObjectURL = vi.fn();

vi.stubGlobal("Audio", FakeAudio);
vi.stubGlobal("URL", { ...URL, createObjectURL: mockCreateObjectURL, revokeObjectURL: mockRevokeObjectURL });

const mp3Blob = { type: "audio/mpeg" };

async function toggleAndSettle(toggle: () => void) {
  await act(async () => {
    toggle();
  });
}

describe("useSpeechPlayback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeAudio.instances = [];
    mockSynthesizeSpeech.mockResolvedValue(mp3Blob);
  });

  it("fetches audio and plays on toggle from idle", async () => {
    const { result } = renderHook(() => useSpeechPlayback("Hello world"));
    expect(result.current.status).toBe("idle");

    await toggleAndSettle(result.current.toggle);

    await waitFor(() => expect(result.current.status).toBe("playing"));
    expect(mockSynthesizeSpeech).toHaveBeenCalledWith("Hello world", {
      model: "x-ai/grok-voice-tts-1.0",
      voice: "eve",
      apiKey: "sk-or-key",
      signal: expect.any(AbortSignal),
    });
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].src).toBe("blob:mock");
    expect(FakeAudio.instances[0].play).toHaveBeenCalled();
  });

  it("stops playback on toggle while playing", async () => {
    const { result } = renderHook(() => useSpeechPlayback("Hello"));
    await toggleAndSettle(result.current.toggle);
    await waitFor(() => expect(result.current.status).toBe("playing"));

    await toggleAndSettle(result.current.toggle);

    expect(result.current.status).toBe("idle");
    expect(FakeAudio.instances[0].pause).toHaveBeenCalled();
    expect(FakeAudio.instances[0].currentTime).toBe(0);
  });

  it("aborts the fetch on toggle while loading, without a toast", async () => {
    mockSynthesizeSpeech.mockImplementation(
      (_text: string, opts: { signal: AbortSignal }) =>
        new Promise((_, reject) => {
          opts.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          );
        })
    );
    const { result } = renderHook(() => useSpeechPlayback("Hello"));

    await toggleAndSettle(result.current.toggle);
    expect(result.current.status).toBe("loading");

    await toggleAndSettle(result.current.toggle);

    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("returns to idle when the audio ends", async () => {
    const { result } = renderHook(() => useSpeechPlayback("Hello"));
    await toggleAndSettle(result.current.toggle);
    await waitFor(() => expect(result.current.status).toBe("playing"));

    act(() => FakeAudio.instances[0].onended?.());

    expect(result.current.status).toBe("idle");
  });

  it("replays cached audio without refetching", async () => {
    const { result } = renderHook(() => useSpeechPlayback("Hello"));
    await toggleAndSettle(result.current.toggle);
    await waitFor(() => expect(result.current.status).toBe("playing"));
    act(() => FakeAudio.instances[0].onended?.());

    await toggleAndSettle(result.current.toggle);

    await waitFor(() => expect(result.current.status).toBe("playing"));
    expect(mockSynthesizeSpeech).toHaveBeenCalledTimes(1);
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].play).toHaveBeenCalledTimes(2);
  });

  it("refetches when the text changes", async () => {
    const { result, rerender } = renderHook(({ text }) => useSpeechPlayback(text), {
      initialProps: { text: "First" },
    });
    await toggleAndSettle(result.current.toggle);
    await waitFor(() => expect(result.current.status).toBe("playing"));
    act(() => FakeAudio.instances[0].onended?.());

    rerender({ text: "Second" });
    await toggleAndSettle(result.current.toggle);

    await waitFor(() => expect(mockSynthesizeSpeech).toHaveBeenCalledTimes(2));
    expect(mockSynthesizeSpeech).toHaveBeenLastCalledWith("Second", expect.anything());
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });

  it("starting one message stops another that is playing", async () => {
    const first = renderHook(() => useSpeechPlayback("First"));
    const second = renderHook(() => useSpeechPlayback("Second"));

    await toggleAndSettle(first.result.current.toggle);
    await waitFor(() => expect(first.result.current.status).toBe("playing"));

    await toggleAndSettle(second.result.current.toggle);

    await waitFor(() => expect(second.result.current.status).toBe("playing"));
    expect(first.result.current.status).toBe("idle");
    expect(FakeAudio.instances[0].pause).toHaveBeenCalled();
  });

  it("shows a toast and returns to idle on synthesis failure", async () => {
    mockSynthesizeSpeech.mockRejectedValue(new Error("HTTP 402: Insufficient credits"));
    const { result } = renderHook(() => useSpeechPlayback("Hello"));

    await toggleAndSettle(result.current.toggle);

    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(mockToastError).toHaveBeenCalledWith("HTTP 402: Insufficient credits");
  });

  it("stops audio and revokes the object URL on unmount", async () => {
    const { result, unmount } = renderHook(() => useSpeechPlayback("Hello"));
    await toggleAndSettle(result.current.toggle);
    await waitFor(() => expect(result.current.status).toBe("playing"));

    unmount();

    expect(FakeAudio.instances[0].pause).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });
});
