import type * as React from "react";
import { ShieldAlert, ShieldCheck, Shield, ShieldX, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ToolCallState } from "@/lib/tools";
import type { RiskLevel } from "@/lib/tools/categories";
import { compareRiskLevels, RISK_LEVEL_CONFIG } from "@/lib/tools/categories";

// ============================================================================
// Types
// ============================================================================

interface GuardrailConfirmationBarProps {
  pendingToolCalls: ToolCallState[];
  onAcceptAll: () => void;
  onDeclineAll: () => void;
  onAcceptOne: (toolCallId: string) => void;
  onDeclineOne: (toolCallId: string) => void;
}

// ============================================================================
// Risk Icon Map
// ============================================================================

const RISK_ICONS: Record<RiskLevel, React.ElementType> = {
  low: ShieldCheck,
  medium: Shield,
  high: ShieldAlert,
  critical: ShieldX,
};

// ============================================================================
// Component
// ============================================================================

export function GuardrailConfirmationBar({
  pendingToolCalls,
  onAcceptAll,
  onDeclineAll,
  onAcceptOne,
  onDeclineOne,
}: GuardrailConfirmationBarProps) {
  if (pendingToolCalls.length === 0) return null;

  const isSingle = pendingToolCalls.length === 1;
  const singleTool = isSingle ? pendingToolCalls[0] : null;

  // Determine highest risk level among pending tools
  const highestRisk = pendingToolCalls.reduce<RiskLevel>((max, tc) => {
    const level = tc.riskLevel || "medium";
    return compareRiskLevels(level, max) > 0 ? level : max;
  }, "low");

  const riskConfig = RISK_LEVEL_CONFIG[highestRisk];
  const RiskIcon = RISK_ICONS[highestRisk];

  const summaryText = isSingle
    ? `"${singleTool!.name.replace(/_/g, " ")}" requires approval`
    : `${pendingToolCalls.length} tools require approval`;

  const reasonText = isSingle
    ? singleTool!.guardrailReason
    : `Highest risk: ${riskConfig.label}`;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-2">
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border px-4 py-2.5",
          "bg-amber-500/10 border-amber-500/30"
        )}
      >
        {/* Shield icon */}
        <RiskIcon className={cn("h-5 w-5 shrink-0", riskConfig.color)} />

        {/* Summary text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{summaryText}</p>
          {reasonText && (
            <p className="text-xs text-muted-foreground truncate">{reasonText}</p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="destructive"
            onClick={isSingle ? () => onDeclineOne(singleTool!.id) : onDeclineAll}
            className="gap-1.5"
          >
            <XCircle className="h-3.5 w-3.5" />
            {isSingle ? "Decline" : "Decline All"}
          </Button>
          <Button
            size="sm"
            onClick={isSingle ? () => onAcceptOne(singleTool!.id) : onAcceptAll}
            className="gap-1.5"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {isSingle ? "Accept" : "Accept All"}
          </Button>
        </div>
      </div>
    </div>
  );
}
