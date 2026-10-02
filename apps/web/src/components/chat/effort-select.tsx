import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EFFORT_LABELS, type EffortLevel } from "@/lib/reasoning";

interface EffortSelectProps {
  effort: EffortLevel;
  effortLevels: EffortLevel[];
  disabled?: boolean;
  onChange: (effort: EffortLevel) => void;
}

/** The reasoning-effort dropdown, shown only for models that support it. */
export function EffortSelect({ effort, effortLevels, disabled, onChange }: EffortSelectProps) {
  const [effortMenuOpen, setEffortMenuOpen] = React.useState(false);

  return (
    <DropdownMenu open={effortMenuOpen} onOpenChange={setEffortMenuOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            disabled={disabled}
            title="Reasoning effort"
          />
        }
      >
        <span>{EFFORT_LABELS[effort]}</span>
        <ChevronDown className="ml-1 h-3 w-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto">
        <DropdownMenuRadioGroup
          value={effort}
          onValueChange={(v) => {
            onChange(v as EffortLevel);
            setEffortMenuOpen(false);
          }}
        >
          {effortLevels.map((level) => (
            <DropdownMenuRadioItem
              key={level}
              value={level}
              className="whitespace-nowrap"
            >
              {EFFORT_LABELS[level]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
