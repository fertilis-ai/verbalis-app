import { Input } from "@/components/ui/input";
import type { GuardrailsConfig } from "@/lib/guardrails/types";

interface RateLimitsEditorProps {
  rateLimits: GuardrailsConfig["rateLimits"];
  onChange: (rateLimits: GuardrailsConfig["rateLimits"]) => void;
}

export function RateLimitsEditor({ rateLimits, onChange }: RateLimitsEditorProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Rate Limits</h3>

      <div className="grid grid-cols-2 gap-4">
        {([
          { label: "Tools/min", key: "toolCallsPerMinute", fallback: 30, min: 1, max: 1000 },
          { label: "Tools/hour", key: "toolCallsPerHour", fallback: 500, min: 1, max: 10000 },
          { label: "API calls/min", key: "apiCallsPerMinute", fallback: 10, min: 1, max: 100 },
          { label: "Shell/min", key: "shellCommandsPerMinute", fallback: 5, min: 1, max: 100 },
        ] as const).map(({ label, key, fallback, min, max }) => (
          <div key={key}>
            <label className="text-xs text-muted-foreground">
              {label}
            </label>
            <Input
              type="number"
              value={rateLimits[key]}
              onChange={(e) =>
                onChange({
                  ...rateLimits,
                  [key]: parseInt(e.target.value, 10) || fallback,
                })
              }
              min={min}
              max={max}
              className="mt-1"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
