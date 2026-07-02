import * as React from "react";
import { toast } from "sonner";
import { formatFromMimeType, transcribeAudio } from "@/lib/transcription";
import { useSettingsStore } from "@/stores/settings-store";

/**
 * OpenRouter's transcription API returns the full text in one response (no
 * streaming) and times out on long audio, so recording is split into segments:
 * each segment is a fresh MediaRecorder on the same stream (so every blob is a
 * standalone decodable file) and is transcribed as soon as it ends, giving a
 * live transcript while the user keeps talking.
 */
const SEGMENT_MS = 15_000;
/** Segments smaller than this are silence/headers only — not worth an API call. */
const MIN_BLOB_BYTES = 1_000;
const MIME_TYPE_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

export type VoiceTranscriptionStatus = "idle" | "starting" | "recording" | "transcribing";

export interface UseVoiceTranscriptionOptions {
  /** Called with each transcribed segment's text, in recording order. */
  onText: (text: string) => void;
}

export function useVoiceTranscription({ onText }: UseVoiceTranscriptionOptions): {
  status: VoiceTranscriptionStatus;
  /** Idle → start recording; recording → stop (the final segment still transcribes). */
  toggle: () => void;
} {
  const [status, setStatus] = React.useState<VoiceTranscriptionStatus>("idle");
  const onTextRef = React.useRef(onText);
  onTextRef.current = onText;

  const streamRef = React.useRef<MediaStream | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const segmentTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Serializes segment transcriptions so text is appended in recording order.
  const queueRef = React.useRef<Promise<void>>(Promise.resolve());
  // True while a recording session is live: each finished segment chains the next.
  const activeRef = React.useRef(false);
  // Guards onText/setStatus after unmount; queued transcriptions may outlive us.
  const mountedRef = React.useRef(true);
  const startingRef = React.useRef(false);

  const transcribeSegment = React.useCallback((blob: Blob) => {
    if (!mountedRef.current || blob.size < MIN_BLOB_BYTES) return;
    queueRef.current = queueRef.current.then(async () => {
      const { apiKeys, transcriptionModel } = useSettingsStore.getState();
      try {
        const text = await transcribeAudio(blob, {
          model: transcriptionModel,
          apiKey: apiKeys.openrouter.trim(),
          format: formatFromMimeType(blob.type),
        });
        if (text && mountedRef.current) onTextRef.current(text);
      } catch (e) {
        if (mountedRef.current) toast.error(e instanceof Error ? e.message : String(e));
      }
    });
  }, []);

  /** Record one segment; when it ends, queue its transcription and chain the next. */
  const recordSegment = React.useCallback(() => {
    const stream = streamRef.current;
    if (!stream || !activeRef.current) return;

    const mimeType = MIME_TYPE_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      transcribeSegment(new Blob(chunks, { type: recorder.mimeType }));
      if (activeRef.current) {
        recordSegment();
      } else {
        // Session over (user stop or unmount): the final segment is now in the
        // queue — once it drains, leave the "transcribing" state.
        queueRef.current = queueRef.current.then(() => {
          if (mountedRef.current) setStatus("idle");
        });
      }
    };
    recorder.start();
    segmentTimerRef.current = setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, SEGMENT_MS);
  }, [transcribeSegment]);

  /**
   * End the session: the active recorder's final blob still flows into the
   * transcription queue via onstop, but no next segment starts.
   */
  const stopSession = React.useCallback(() => {
    activeRef.current = false;
    if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current);
    segmentTimerRef.current = null;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    recorderRef.current = null;
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
  }, []);

  const toggle = React.useCallback(() => {
    if (startingRef.current || status === "transcribing") return;

    if (status === "recording") {
      // stopSession flushes the final blob through recorder.onstop, which
      // queues its transcription and schedules the return to "idle".
      setStatus("transcribing");
      stopSession();
      return;
    }

    const start = async () => {
      // getUserMedia can be entirely absent (non-secure context, restricted
      // webview) — accessing it unguarded throws synchronously.
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        toast.error("Microphone recording is not supported in this environment.");
        setStatus("idle");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!mountedRef.current) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        activeRef.current = true;
        setStatus("recording");
        recordSegment();
      } catch (e) {
        console.error("[voice-transcription] Microphone access failed:", e);
        const detail = e instanceof Error ? e.message || e.name : String(e);
        toast.error(`Microphone unavailable: ${detail}. Check system permissions.`);
        setStatus("idle");
      }
    };

    startingRef.current = true;
    setStatus("starting");
    void start().finally(() => {
      startingRef.current = false;
    });
  }, [status, stopSession, recordSegment]);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopSession();
    };
  }, [stopSession]);

  return { status, toggle };
}
