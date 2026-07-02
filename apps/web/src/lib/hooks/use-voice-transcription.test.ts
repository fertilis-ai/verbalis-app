import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockTranscribeAudio = vi.fn();
const mockToastError = vi.fn();

vi.mock("@/lib/transcription", () => ({
  formatFromMimeType: () => "webm",
  transcribeAudio: (...args: unknown[]) => mockTranscribeAudio(...args),
}));

vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

vi.mock("@/stores/settings-store", () => ({
  useSettingsStore: {
    getState: () => ({
      apiKeys: { anthropic: "", openai: "", google: "", openrouter: "sk-or-key" },
      transcriptionModel: "openai/whisper-large-v3",
    }),
  },
}));

import { useVoiceTranscription } from "./use-voice-transcription";

// ---------------------------------------------------------------------------
// Browser API stubs
// ---------------------------------------------------------------------------

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported = () => true;
  /** Size of the blob emitted on stop; tests override per instance. */
  blobSize = 2000;
  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(
    public stream: unknown,
    opts?: { mimeType?: string }
  ) {
    this.mimeType = opts?.mimeType ?? "audio/webm";
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    // Real browsers fire dataavailable/stop asynchronously after stop().
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(["x".repeat(this.blobSize)]) });
      this.onstop?.();
    });
  }
}

const mockTrackStop = vi.fn();
const mockGetUserMedia = vi.fn();

vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
vi.stubGlobal("navigator", {
  ...navigator,
  mediaDevices: { getUserMedia: (...args: unknown[]) => mockGetUserMedia(...args) },
});

function fakeStream() {
  return { getTracks: () => [{ stop: mockTrackStop }] };
}

async function startRecording(toggle: () => void) {
  await act(async () => {
    toggle();
  });
}

describe("useVoiceTranscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeMediaRecorder.instances = [];
    mockGetUserMedia.mockResolvedValue(fakeStream());
    mockTranscribeAudio.mockResolvedValue("hello");
  });

  it("starts recording on toggle", async () => {
    const { result } = renderHook(() => useVoiceTranscription({ onText: vi.fn() }));
    expect(result.current.status).toBe("idle");

    await startRecording(result.current.toggle);

    expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(result.current.status).toBe("recording");
    expect(FakeMediaRecorder.instances).toHaveLength(1);
    expect(FakeMediaRecorder.instances[0].state).toBe("recording");
  });

  it("transcribes a finished segment and starts the next one", async () => {
    const onText = vi.fn();
    const { result } = renderHook(() => useVoiceTranscription({ onText }));
    await startRecording(result.current.toggle);

    // Simulate the 15s segment boundary.
    await act(async () => {
      FakeMediaRecorder.instances[0].stop();
    });

    await waitFor(() => expect(onText).toHaveBeenCalledWith("hello"));
    expect(mockTranscribeAudio).toHaveBeenCalledWith(expect.any(Blob), {
      model: "openai/whisper-large-v3",
      apiKey: "sk-or-key",
      format: "webm",
    });
    // A new recorder took over; still recording.
    expect(FakeMediaRecorder.instances).toHaveLength(2);
    expect(result.current.status).toBe("recording");
  });

  it("appends segment texts in recording order even when responses arrive out of order", async () => {
    const onText = vi.fn();
    let resolveFirst!: (text: string) => void;
    mockTranscribeAudio
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce("second");

    const { result } = renderHook(() => useVoiceTranscription({ onText }));
    await startRecording(result.current.toggle);

    await act(async () => {
      FakeMediaRecorder.instances[0].stop(); // first segment (slow response)
    });
    await act(async () => {
      FakeMediaRecorder.instances[1].stop(); // second segment (fast response)
    });
    expect(onText).not.toHaveBeenCalled();

    await act(async () => {
      resolveFirst("first");
    });
    await waitFor(() => expect(onText).toHaveBeenCalledTimes(2));
    expect(onText.mock.calls.map((c) => c[0])).toEqual(["first", "second"]);
  });

  it("stops on toggle, transcribes the final segment, and releases the microphone", async () => {
    const onText = vi.fn();
    const { result } = renderHook(() => useVoiceTranscription({ onText }));
    await startRecording(result.current.toggle);

    await act(async () => {
      result.current.toggle();
    });

    expect(mockTrackStop).toHaveBeenCalled();
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(onText).toHaveBeenCalledWith("hello");
    // No next segment after a user stop.
    expect(FakeMediaRecorder.instances).toHaveLength(1);
  });

  it("skips transcription for near-empty segments", async () => {
    const { result } = renderHook(() => useVoiceTranscription({ onText: vi.fn() }));
    await startRecording(result.current.toggle);

    FakeMediaRecorder.instances[0].blobSize = 10;
    await act(async () => {
      result.current.toggle();
    });

    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(mockTranscribeAudio).not.toHaveBeenCalled();
  });

  it("shows a starting state while waiting for the permission prompt", async () => {
    let resolveStream!: (stream: unknown) => void;
    mockGetUserMedia.mockImplementation(() => new Promise((resolve) => (resolveStream = resolve)));
    const { result } = renderHook(() => useVoiceTranscription({ onText: vi.fn() }));

    act(() => {
      result.current.toggle();
    });
    expect(result.current.status).toBe("starting");

    await act(async () => {
      resolveStream(fakeStream());
    });
    expect(result.current.status).toBe("recording");
  });

  it("shows a toast and returns to idle when microphone access is denied", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetUserMedia.mockRejectedValue(new Error("Permission denied"));
    const { result } = renderHook(() => useVoiceTranscription({ onText: vi.fn() }));

    await startRecording(result.current.toggle);

    expect(mockToastError).toHaveBeenCalledWith(
      "Microphone unavailable: Permission denied. Check system permissions."
    );
    expect(result.current.status).toBe("idle");
  });

  it("shows a toast and stays usable when mediaDevices is unavailable", async () => {
    // Restricted webviews (non-secure contexts) expose no mediaDevices at all;
    // an unguarded access would throw synchronously and lock the button.
    const originalNavigator = navigator;
    vi.stubGlobal("navigator", { ...originalNavigator, mediaDevices: undefined });
    try {
      const { result } = renderHook(() => useVoiceTranscription({ onText: vi.fn() }));

      await startRecording(result.current.toggle);
      expect(mockToastError).toHaveBeenCalledWith(
        "Microphone recording is not supported in this environment."
      );
      expect(result.current.status).toBe("idle");

      // The button must not be locked: a second toggle tries again.
      await startRecording(result.current.toggle);
      expect(mockToastError).toHaveBeenCalledTimes(2);
    } finally {
      vi.stubGlobal("navigator", originalNavigator);
    }
  });

  it("shows a toast when a segment fails to transcribe but keeps recording", async () => {
    mockTranscribeAudio.mockRejectedValue(new Error("Transcription failed (HTTP 500)"));
    const { result } = renderHook(() => useVoiceTranscription({ onText: vi.fn() }));
    await startRecording(result.current.toggle);

    await act(async () => {
      FakeMediaRecorder.instances[0].stop();
    });

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("Transcription failed (HTTP 500)")
    );
    expect(result.current.status).toBe("recording");
  });

  it("releases the microphone on unmount", async () => {
    const { result, unmount } = renderHook(() => useVoiceTranscription({ onText: vi.fn() }));
    await startRecording(result.current.toggle);

    unmount();

    expect(mockTrackStop).toHaveBeenCalled();
  });
});
