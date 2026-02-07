import * as React from "react";
import { Send, Square, Plus, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import { useSettingsStore } from "@/stores/settings-store";

const MODELS = [
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", shortName: "Claude 4", provider: "anthropic" },
  { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", shortName: "Claude 3.5", provider: "anthropic" },
  { id: "gpt-4o", name: "GPT-4o", shortName: "GPT-4o", provider: "openai" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", shortName: "GPT-4o Mini", provider: "openai" },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", shortName: "Gemini 1.5", provider: "google" },
] as const;

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  isLoopActive?: boolean;
  onStop?: () => void;
}

export function ChatInput({ onSend, disabled, isLoopActive, onStop }: ChatInputProps) {
  const { model, setModel } = useChatStore();
  const { localLLM } = useSettingsStore();
  const [input, setInput] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const selectedModel = MODELS.find((m) => m.id === model) ?? MODELS[0];
  const localProviderLabel = localLLM.provider === "lmstudio" ? "LM Studio" : "Ollama";
  const localModelLabel = localLLM.model.trim() || `${localProviderLabel} (default)`;
  const selectedLocalLabel = localLLM.enabled ? localModelLabel : "Local LLM (disabled)";
  const selectedModelLabel =
    model === "local" ? selectedLocalLabel : (selectedModel?.shortName ?? model);

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
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput("");
    // Reset height after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const hasContent = input.trim().length > 0;

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

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between border-t border-border/50 px-2 py-1">
          {/* Left: Plus button + Model selector */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg"
              disabled={disabled}
            >
              <Plus className="h-4 w-4" />
            </Button>

            {/* Compact Model Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    disabled={disabled}
                  />
                }
              >
                <span>{selectedModelLabel}</span>
                <ChevronDown className="ml-1 h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[200px]">
                <DropdownMenuRadioGroup value={model} onValueChange={setModel}>
                  {MODELS.map((m) => (
                    <DropdownMenuRadioItem key={m.id} value={m.id} className="whitespace-nowrap">
                      <span>{m.name}</span>
                      <span className="ml-2 text-muted-foreground">({m.provider})</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={model} onValueChange={setModel}>
                  <DropdownMenuRadioItem
                    value="local"
                    disabled={!localLLM.enabled}
                    className="whitespace-nowrap"
                  >
                    <span>{localLLM.enabled ? localModelLabel : "Local LLM (disabled)"}</span>
                    <span className="ml-2 text-muted-foreground">({localProviderLabel})</span>
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Right: Send / Stop button */}
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
  );
}
