import * as React from "react";
import { Check, Copy, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { KeyedDiffLine } from "@/lib/toolbox/use-toolbox-diff";
import type { ToolCallState, ToolCallStatus } from "@/lib/tools";
import { CATEGORY_CONFIG, RISK_LEVEL_CONFIG } from "@/lib/tools/categories";
import { CATEGORY_ICONS, DIFF_LINE_PREFIX, DIFF_LINE_STYLES } from "./tool-call-card-config";

interface ToolCallDetailsProps {
  toolCall: ToolCallState;
  normalizedStatus: ToolCallStatus;
  toolboxDiff: KeyedDiffLine[] | null;
  showTiming: boolean;
  showCategory: boolean;
}

function formatArguments(args: Record<string, unknown>): string {
  return JSON.stringify(args, null, 2);
}

/** Category, guardrail reason, Toolbox diff, arguments, result and timing. */
export function ToolCallDetails({
  toolCall,
  normalizedStatus,
  toolboxDiff,
  showTiming,
  showCategory,
}: ToolCallDetailsProps) {
  const [copiedField, setCopiedField] = React.useState<string | null>(null);

  const category = toolCall.category || "custom";
  const riskConfig = RISK_LEVEL_CONFIG[toolCall.riskLevel || "medium"];
  const CategoryIcon = CATEGORY_ICONS[category];

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Ignore copy errors
    }
  };

  return (
    <>
      {/* Category info */}
      {showCategory && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CategoryIcon className="h-3.5 w-3.5" />
          <span>{CATEGORY_CONFIG[category].label}</span>
          <span className="text-muted-foreground/50">|</span>
          <span className={riskConfig.color}>{riskConfig.label}</span>
        </div>
      )}

      {/* Guardrail reason */}
      {toolCall.guardrailReason && (
        <div
          className={cn(
            "flex items-start gap-2 rounded border p-2",
            normalizedStatus === "pending_confirmation"
              ? "border-amber-500/30 bg-amber-500/10"
              : "border-red-500/30 bg-red-500/10"
          )}
        >
          <ShieldAlert
            className={cn(
              "h-4 w-4 shrink-0 mt-0.5",
              normalizedStatus === "pending_confirmation" ? "text-amber-500" : "text-red-500"
            )}
          />
          <div className="space-y-1">
            <p
              className={cn(
                "text-xs font-medium",
                normalizedStatus === "pending_confirmation"
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-red-600 dark:text-red-400"
              )}
            >
              {toolCall.guardrailReason}
            </p>
            {toolCall.guardrailViolations && toolCall.guardrailViolations.length > 0 && (
              <ul
                className={cn(
                  "text-xs space-y-0.5",
                  normalizedStatus === "pending_confirmation"
                    ? "text-amber-600/80 dark:text-amber-400/80"
                    : "text-red-600/80 dark:text-red-400/80"
                )}
              >
                {toolCall.guardrailViolations.map((v, i) => (
                  <li key={i} className="flex items-center gap-1">
                    <span className="font-mono text-[10px] uppercase">{v.severity}</span>
                    <span>{v.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Toolbox change preview (confirmation only) */}
      {toolboxDiff && (
        <div className="rounded bg-background/50 p-2">
          <span className="text-xs font-medium text-muted-foreground">Changes</span>
          <pre className="mt-1 text-xs font-mono max-h-48 overflow-auto">
            {toolboxDiff.map((line) => (
              <div
                key={line.key}
                className={cn("whitespace-pre-wrap break-all px-1", DIFF_LINE_STYLES[line.type])}
              >
                {DIFF_LINE_PREFIX[line.type]}
                {line.text}
              </div>
            ))}
          </pre>
        </div>
      )}

      {/* Arguments */}
      <div className="rounded bg-background/50 p-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-muted-foreground">
            Arguments
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              copyToClipboard(formatArguments(toolCall.arguments), "args");
            }}
          >
            {copiedField === "args" ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        </div>
        <pre className="text-xs whitespace-pre-wrap break-all font-mono max-h-32 overflow-auto">
          {formatArguments(toolCall.arguments)}
        </pre>
      </div>

      {/* Result or error */}
      {(toolCall.result || toolCall.error) && (
        <div
          className={cn(
            "rounded p-2",
            toolCall.error ? "bg-red-500/10" : "bg-background/50"
          )}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">
              {toolCall.error ? "Error" : "Result"}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(e) => {
                e.stopPropagation();
                copyToClipboard(toolCall.error || toolCall.result || "", "result");
              }}
            >
              {copiedField === "result" ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </div>
          <pre className="text-xs whitespace-pre-wrap break-all font-mono max-h-48 overflow-auto">
            {toolCall.error || toolCall.result}
          </pre>
        </div>
      )}

      {/* Timing details */}
      {showTiming && (toolCall.queuedAt || toolCall.startedAt || toolCall.completedAt) && (
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          {toolCall.queuedAt && (
            <span>Queued: {new Date(toolCall.queuedAt).toLocaleTimeString()}</span>
          )}
          {toolCall.startedAt && (
            <span>Started: {new Date(toolCall.startedAt).toLocaleTimeString()}</span>
          )}
          {toolCall.completedAt && (
            <span>Completed: {new Date(toolCall.completedAt).toLocaleTimeString()}</span>
          )}
        </div>
      )}
    </>
  );
}
