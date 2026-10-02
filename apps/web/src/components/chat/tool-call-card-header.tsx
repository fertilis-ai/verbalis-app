import { ChevronDown, ChevronRight, Clock, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolCallState } from "@/lib/tools";
import { RISK_LEVEL_CONFIG } from "@/lib/tools/categories";
import { RISK_ICONS, TOOL_ICONS, type ToolCallStatusConfig } from "./tool-call-card-config";

interface ToolCallHeaderProps {
  toolCall: ToolCallState;
  status: ToolCallStatusConfig;
  isExpanded: boolean;
  onToggle: () => void;
  isGhostMode?: boolean;
  showTiming: boolean;
  showCategory: boolean;
  compact: boolean;
}

function getSummary(args: ToolCallState["arguments"]): string {
  const path =
    args.path ||
    args.old_path ||
    args.dir ||
    args.url ||
    args.command ||
    args.prompt;

  if (path && typeof path === "string") {
    // Show just the filename or last path component
    const parts = path.split("/");
    const summary = parts[parts.length - 1] || path;
    return summary.length > 40 ? `${summary.slice(0, 40)}...` : summary;
  }
  return "";
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ToolCallHeader({
  toolCall,
  status,
  isExpanded,
  onToggle,
  isGhostMode,
  showTiming,
  showCategory,
  compact,
}: ToolCallHeaderProps) {
  const Icon = TOOL_ICONS[toolCall.name] || FileText;
  const StatusIcon = status.icon;
  const riskLevel = toolCall.riskLevel || "medium";
  const RiskIcon = RISK_ICONS[riskLevel];
  const riskConfig = RISK_LEVEL_CONFIG[riskLevel];

  return (
    <div
      className={cn(
        "flex items-center gap-2 cursor-pointer select-none",
        compact ? "p-2" : "p-3"
      )}
      onClick={onToggle}
    >
      {/* Expand/collapse */}
      <button className="text-muted-foreground hover:text-foreground transition-colors">
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>

      {/* Tool icon */}
      <div
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded",
          isGhostMode ? "bg-purple-500/20" : "bg-primary/10"
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>

      {/* Tool name and summary */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">
            {toolCall.name.replace(/_/g, " ")}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            {getSummary(toolCall.arguments)}
          </span>
        </div>
      </div>

      {/* Risk badge */}
      {showCategory && (
        <div
          className={cn(
            "flex items-center gap-1 px-1.5 py-0.5 rounded text-xs",
            riskConfig.bgColor,
            riskConfig.color
          )}
        >
          <RiskIcon className="h-3 w-3" />
          <span className="hidden sm:inline">{riskLevel}</span>
        </div>
      )}

      {/* Duration */}
      {showTiming && toolCall.durationMs && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {formatDuration(toolCall.durationMs)}
        </div>
      )}

      {/* Status badge */}
      <div className={cn("flex items-center gap-1.5", status.color)}>
        <StatusIcon
          className={cn("h-4 w-4", status.animate && "animate-spin")}
        />
        {!compact && (
          <span className="text-xs font-medium">{status.label}</span>
        )}
      </div>
    </div>
  );
}
