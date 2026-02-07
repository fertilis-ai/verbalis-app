import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatStore } from "@/stores/chat-store";
import { useSettingsStore } from "@/stores/settings-store";
import { MODEL_OPTIONS } from "@/lib/models";

export function ModelSelector() {
  const { model, setModel } = useChatStore();
  const { localLLM } = useSettingsStore();
  const selectedModel = MODEL_OPTIONS.find((m) => m.id === model) ?? MODEL_OPTIONS[0];
  const localProviderLabel = localLLM.provider === "lmstudio" ? "LM Studio" : "Ollama";
  const localModelLabel = localLLM.model.trim() || `${localProviderLabel} (default)`;
  const selectedLocalLabel = localLLM.enabled ? localModelLabel : "Local LLM (disabled)";
  const selectedModelLabel =
    model === "local" ? selectedLocalLabel : (selectedModel?.name ?? model);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <span>{selectedModelLabel}</span>
        <ChevronDown className="ml-1 h-3 w-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={model} onValueChange={setModel}>
          {MODEL_OPTIONS.map((m) => (
            <DropdownMenuRadioItem key={m.id} value={m.id}>
              <span>{m.name}</span>
              <span className="ml-2 text-muted-foreground">({m.provider})</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={model} onValueChange={setModel}>
          <DropdownMenuRadioItem value="local" disabled={!localLLM.enabled}>
            <span>{localLLM.enabled ? localModelLabel : "Local LLM (disabled)"}</span>
            <span className="ml-2 text-muted-foreground">({localProviderLabel})</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
