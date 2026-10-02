import * as React from "react";
import { Send, Square, Plus, X, Mic, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getActiveModels } from "@/lib/models";
import { getEffortCapability, resolveEffortFor } from "@/lib/reasoning";
import { useChatStore, type ContextFile } from "@/stores/chat-store";
import { useSettingsStore } from "@/stores/settings-store";
import { expandPromptInput } from "@/lib/prompts/expand-prompt";
import { useVoiceTranscription } from "@/lib/hooks/use-voice-transcription";
import { ModelQuickSelect } from "./model-quick-select";
import { EffortSelect } from "./effort-select";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  isLoopActive?: boolean;
  onStop?: () => void;
  contextFiles?: ContextFile[];
  onAddFiles?: () => void;
  onRemoveFile?: (path: string) => void;
}

export function ChatInput({ onSend, disabled, isLoopActive, onStop, contextFiles = [], onAddFiles, onRemoveFile }: ChatInputProps) {
  const { model, setModel } = useChatStore();
  const contextWindowTrimmed = useChatStore((s) => s.contextWindowTrimmed);
  const { localLLM, selectedModels, transcriptionModel, apiKeys, modelEffort, setModelEffort } =
    useSettingsStore();
  const activeModels = getActiveModels(selectedModels);
  const [input, setInput] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Reasoning effort is contextual: only models known to be reasoning models get
  // a picker, and only with the levels that model actually supports.
  // Local models are never reasoning models (see buildLocalModel in chat-store).
  // Matched on the exact id — `ModelQuickSelect` falls back to the first active
  // model for display, but effort keys off what the request will actually send.
  const effortModel = activeModels.find((m) => m.id === model);
  const effortCapability = effortModel ? getEffortCapability(effortModel) : null;
  const effortLevels = effortCapability?.levels ?? [];
  const effort = effortCapability
    ? resolveEffortFor(effortCapability, modelEffort?.[model])
    : "off";

  const adjustHeight = React.useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

  React.useEffect(() => {
    adjustHeight();
  }, [input, adjustHeight]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    // Clear the input immediately for responsiveness, then expand any saved
    // `/<prompt-name>` command before sending (no-op for ordinary messages).
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    void expandPromptInput(trimmed).then((expanded) => onSend(expanded));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const hasContent = input.trim().length > 0;

  const voiceEnabled = Boolean(transcriptionModel && apiKeys.openrouter.trim());
  const { status: voiceStatus, toggle: toggleVoice } = useVoiceTranscription({
    onText: (text) =>
      setInput((prev) => (prev && !prev.endsWith(" ") ? `${prev} ${text}` : prev + text)),
  });
  const voiceTitles: Record<string, string> = {
    idle: "Record voice message",
    starting: "Starting microphone...",
    recording: "Stop recording",
    transcribing: "Transcribing...",
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4">
      <div className="rounded-2xl border border-border bg-muted/30">
        {/* Textarea area */}
        <div className="px-4 pt-3 pb-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={disabled}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            rows={1}
            className={cn(
              "w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground",
              "min-h-[24px] max-h-[200px]",
              disabled && "cursor-not-allowed opacity-50"
            )}
          />
        </div>

        {/* Context file chips */}
        {contextFiles.length > 0 && (
          <div className="flex flex-wrap gap-1 px-4 pb-1">
            {contextFiles.map((f) => (
              <span
                key={f.path}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
              >
                {f.name}
                {onRemoveFile && (
                  <button
                    type="button"
                    onClick={() => onRemoveFile(f.path)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between border-t border-border/50 px-2 py-1">
          {/* Left: Plus button + Model selector */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg"
              disabled={disabled || !onAddFiles}
              onClick={onAddFiles}
            >
              <Plus className="h-4 w-4" />
            </Button>

            <ModelQuickSelect
              model={model}
              activeModels={activeModels}
              localLLM={localLLM}
              disabled={disabled}
              setModel={setModel}
            />

            {/* Reasoning effort — only for models that support it */}
            {effortLevels.length > 0 && (
              <EffortSelect
                effort={effort}
                effortLevels={effortLevels}
                disabled={disabled}
                onChange={(level) => setModelEffort(model, level)}
              />
            )}

            {/* Sliding-window indicator */}
            {contextWindowTrimmed && (
              <span
                className="text-xs text-amber-600 dark:text-amber-400"
                title="Older messages were dropped to fit the context window"
              >
                trimmed
              </span>
            )}
          </div>

          {/* Right: Mic + Send / Stop buttons */}
          <div className="flex items-center gap-1">
            {voiceEnabled && (
              <Button
                variant={voiceStatus === "recording" ? "default" : "ghost"}
                size="icon"
                className="h-7 w-7 rounded-lg"
                onClick={toggleVoice}
                disabled={disabled || voiceStatus === "starting" || voiceStatus === "transcribing"}
                title={voiceTitles[voiceStatus]}
              >
                {voiceStatus === "recording" ? (
                  <Square className="h-3.5 w-3.5 fill-current animate-pulse" />
                ) : voiceStatus === "starting" || voiceStatus === "transcribing" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>
            )}
            {isLoopActive ? (
              <Button
                variant="destructive"
                size="icon"
                className="h-7 w-7 rounded-lg"
                onClick={onStop}
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                variant={hasContent ? "default" : "ghost"}
                size="icon"
                className="h-7 w-7 rounded-lg"
                onClick={handleSubmit}
                disabled={!hasContent || disabled}
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
