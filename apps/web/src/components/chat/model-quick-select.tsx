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
import { getProviderLabel, type ProviderModel } from "@/lib/models";
import type { LocalLlmProvider } from "@/lib/types/settings";

interface ModelQuickSelectProps {
  model: string;
  activeModels: ProviderModel[];
  localLLM: { enabled: boolean; provider: LocalLlmProvider; model: string };
  disabled?: boolean;
  setModel: (model: string) => void;
}

/** The compact model dropdown in the chat input toolbar. */
export function ModelQuickSelect({
  model,
  activeModels,
  localLLM,
  disabled,
  setModel,
}: ModelQuickSelectProps) {
  const [modelMenuOpen, setModelMenuOpen] = React.useState(false);

  const selectedModel = activeModels.find((m) => m.id === model) ?? activeModels[0];
  const localProviderLabel = getProviderLabel(localLLM.provider);
  const localModelLabel = localLLM.model.trim() || `${localProviderLabel} (default)`;
  const selectedLocalLabel = localLLM.enabled ? localModelLabel : "Local LLM (disabled)";
  const selectedModelLabel =
    model === "local" ? selectedLocalLabel : (selectedModel?.name ?? model) || "No model";

  return (
    <DropdownMenu open={modelMenuOpen} onOpenChange={setModelMenuOpen}>
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
      <DropdownMenuContent align="start" className="w-auto">
        {activeModels.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground whitespace-nowrap">
            No models selected — add some in Settings → Models.
          </div>
        )}
        <DropdownMenuRadioGroup value={model} onValueChange={(v) => { setModel(v); setModelMenuOpen(false); }}>
          {activeModels.map((m) => (
            <DropdownMenuRadioItem key={m.id} value={m.id} className="whitespace-nowrap">
              <span>{m.name}</span>
              <span className="ml-2 text-muted-foreground">({getProviderLabel(m.provider)})</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={model} onValueChange={(v) => { setModel(v); setModelMenuOpen(false); }}>
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
  );
}
