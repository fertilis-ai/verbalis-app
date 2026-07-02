import * as React from "react";
import { toast } from "sonner";
import { MAX_SPEECH_INPUT_CHARS, stripMarkdownForSpeech, synthesizeSpeech } from "@/lib/speech";
import { useSettingsStore } from "@/stores/settings-store";

export type SpeechPlaybackStatus = "idle" | "loading" | "playing";

// Only one message plays at a time: starting playback stops whichever
// instance registered here last.
let activeStop: (() => void) | null = null;

/**
 * Read-aloud playback for one message. `toggle()` cycles: idle → fetch mp3 via
 * OpenRouter and play; loading → cancel; playing → stop. The synthesized audio
 * is cached (as an object URL) so replaying the same text skips the network.
 */
export function useSpeechPlayback(text: string): {
  status: SpeechPlaybackStatus;
  toggle: () => void;
} {
  const [status, setStatus] = React.useState<SpeechPlaybackStatus>("idle");
  const textRef = React.useRef(text);
  textRef.current = text;

  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const urlRef = React.useRef<string | null>(null);
  // The text the cached URL was synthesized from; a mismatch forces a refetch.
  const urlTextRef = React.useRef<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const mountedRef = React.useRef(true);
  // Guards double-clicks that land before the "loading" re-render.
  const busyRef = React.useRef(false);

  const stop = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    if (activeStop === stop) activeStop = null;
    if (mountedRef.current) setStatus("idle");
  }, []);

  const play = React.useCallback(async () => {
    const { apiKeys, speechModel, speechVoice, availableSpeechModels } =
      useSettingsStore.getState();
    const text = textRef.current;

    try {
      if (urlTextRef.current !== text) {
        setStatus("loading");
        const abort = new AbortController();
        abortRef.current = abort;
        const input = stripMarkdownForSpeech(text).slice(0, MAX_SPEECH_INPUT_CHARS);
        const blob = await synthesizeSpeech(input, {
          model: speechModel,
          voice:
            speechVoice || availableSpeechModels.find((m) => m.id === speechModel)?.voices[0],
          apiKey: apiKeys.openrouter.trim(),
          signal: abort.signal,
        });
        abortRef.current = null;
        if (!mountedRef.current) return;
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = URL.createObjectURL(blob);
        urlTextRef.current = text;
        audioRef.current = new Audio(urlRef.current);
        audioRef.current.onended = stop;
        audioRef.current.onerror = stop;
      }
      setStatus("playing");
      await audioRef.current?.play();
    } catch (e) {
      if (!mountedRef.current) return;
      // DOMException isn't `instanceof Error` in every engine — read .name directly.
      const name = (e as { name?: string } | null)?.name;
      if (name !== "AbortError" && name !== "TimeoutError") {
        toast.error(e instanceof Error ? e.message : String(e));
      }
      setStatus("idle");
    }
  }, [stop]);

  const toggle = React.useCallback(() => {
    if (status !== "idle") {
      stop();
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    activeStop?.();
    activeStop = stop;
    void play().finally(() => {
      busyRef.current = false;
    });
  }, [status, stop, play]);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stop();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, [stop]);

  return { status, toggle };
}
