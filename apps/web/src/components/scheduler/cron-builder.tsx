import * as React from "react";
import { Button } from "@/components/ui/button";

interface CronBuilderProps {
  value: string;
  onChange: (cron: string) => void;
}

const PRESETS = [
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Daily at 9 AM", cron: "0 9 * * *" },
  { label: "Daily at 6 PM", cron: "0 18 * * *" },
  { label: "Weekdays at 9 AM", cron: "0 9 * * 1-5" },
  { label: "Weekdays at 6 PM", cron: "0 18 * * 1-5" },
  { label: "Every Monday at 9 AM", cron: "0 9 * * 1" },
  { label: "First of month at 9 AM", cron: "0 9 1 * *" },
];

export function CronBuilder({ value, onChange }: CronBuilderProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {PRESETS.map((preset) => (
        <Button
          key={preset.cron}
          variant={value === preset.cron ? "secondary" : "outline"}
          size="xs"
          onClick={() => onChange(preset.cron)}
        >
          {preset.label}
        </Button>
      ))}
    </div>
  );
}
