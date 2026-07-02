import { Loader2, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSpeechPlayback, type SpeechPlaybackStatus } from "@/lib/hooks/use-speech-playback";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings-store";

const speechTitles: Record<SpeechPlaybackStatus, string> = {
  idle: "Read aloud",
  loading: "Generating audio… (click to cancel)",
  playing: "Stop playback",
};

/**
 * Read-aloud button for an assistant message. Renders nothing unless a speech
 * model is configured and the OpenRouter key is set.
 */
export function SpeechButton({ text }: { text: string }) {
  const speechModel = useSettingsStore((s) => s.speechModel);
  const openrouterKey = useSettingsStore((s) => s.apiKeys.openrouter);
  const { status, toggle } = useSpeechPlayback(text);

  if (!speechModel || !openrouterKey.trim()) return null;

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className={cn(
        "text-muted-foreground opacity-0 transition-opacity group-hover/message:opacity-100 focus-visible:opacity-100",
        status !== "idle" && "opacity-100"
      )}
      onClick={toggle}
      title={speechTitles[status]}
      aria-label={speechTitles[status]}
    >
      {status === "loading" ? (
        <Loader2 className="animate-spin" />
      ) : status === "playing" ? (
        <Square className="fill-current" />
      ) : (
        <Volume2 />
      )}
    </Button>
  );
}
