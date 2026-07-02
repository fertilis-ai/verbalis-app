import * as React from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Clock,
  Copy,
  Check,
  Undo2,
  Globe,
  Terminal,
  Brain,
  Plug,
  Shield,
  ShieldAlert,
  ShieldX,
  ShieldCheck,
  Square,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { GeneratedImage } from "./generated-image";
import { normalizeToolCallStatus, type ToolCallState } from "@/lib/tools";
import type { RiskLevel, ToolCategory } from "@/lib/tools/categories";
import { RISK_LEVEL_CONFIG, CATEGORY_CONFIG } from "@/lib/tools/categories";

// ============================================================================
// Icon Maps
// ============================================================================

const TOOL_ICONS: Record<string, React.ElementType> = {
  read_file: FileText,
  write_file: FileText,
  read_directory: Folder,
  create_directory: Folder,
  delete_path: Trash2,
  list_files: Folder,
  path_exists: FileText,
  rename_path: FileText,
  http_fetch: Globe,
  web_search: Globe,
  scrape_webpage: Globe,
  shell_execute: Terminal,
  clipboard_read: FileText,
  clipboard_write: FileText,
  notification_send: AlertCircle,
  generate_image: ImageIcon,
};

/** Extract saved image paths from a generate_image tool result. */
export function extractImagePaths(result?: string): string[] {
  if (!result) return [];
  return [...result.matchAll(/^Saved to: (.+)$/gm)].map((m) => m[1].trim());
}

const CATEGORY_ICONS: Record<ToolCategory, React.ElementType> = {
  file_system: Folder,
  web: Globe,
  system: Terminal,
  integration: Plug,
  memory: Brain,
  custom: FileText,
};

const RISK_ICONS: Record<RiskLevel, React.ElementType> = {
  low: ShieldCheck,
  medium: Shield,
  high: ShieldAlert,
  critical: ShieldX,
};

// ============================================================================
// Types
// ============================================================================

interface ToolCallCardProps {
  toolCall: ToolCallState;
  onConfirm?: (toolCallId: string) => void;
  onReject?: (toolCallId: string) => void;
  onUndo?: (toolCallId: string) => void;
  isGhostMode?: boolean;
  showTiming?: boolean;
  showCategory?: boolean;
  compact?: boolean;
}

// ============================================================================
// Status Configuration
// ============================================================================

const STATUS_CONFIG = {
  pending: {
    icon: Loader2,
    label: "Preparing...",
    color: "text-muted-foreground",
    bgColor: "bg-muted/50",
    borderColor: "border-muted",
    animate: true,
  },
  pending_confirmation: {
    icon: AlertCircle,
    label: "Awaiting approval",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    animate: false,
  },
  executing: {
    icon: Loader2,
    label: "Executing...",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    animate: true,
  },
  success: {
    icon: CheckCircle2,
    label: "Completed",
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/30",
    animate: false,
  },
  error: {
    icon: XCircle,
    label: "Failed",
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
    animate: false,
  },
  cancelled: {
    icon: XCircle,
    label: "Cancelled",
    color: "text-muted-foreground",
    bgColor: "bg-muted/50",
    borderColor: "border-muted",
    animate: false,
  },
  timeout: {
    icon: Clock,
    label: "Timed out",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
    animate: false,
  },
  stopped: {
    icon: Square,
    label: "Stopped",
    color: "text-muted-foreground",
    bgColor: "bg-muted/50",
    borderColor: "border-muted",
    animate: false,
  },
};

// ============================================================================
// Component
// ============================================================================

export function ToolCallCard({
  toolCall,
  onConfirm,
  onReject,
  onUndo,
  isGhostMode,
  showTiming = true,
  showCategory = true,
  compact = false,
}: ToolCallCardProps) {
  const normalizedStatus = normalizeToolCallStatus(toolCall.status);
  const [isExpanded, setIsExpanded] = React.useState(
    normalizedStatus === "pending_confirmation"
  );
  const [copiedField, setCopiedField] = React.useState<string | null>(null);

  const Icon = TOOL_ICONS[toolCall.name] || FileText;
  const status = STATUS_CONFIG[normalizedStatus] || STATUS_CONFIG.stopped;
  const StatusIcon = status.icon;

  const category = toolCall.category || "custom";
  const riskLevel = toolCall.riskLevel || "medium";
  const CategoryIcon = CATEGORY_ICONS[category];
  const RiskIcon = RISK_ICONS[riskLevel];
  const riskConfig = RISK_LEVEL_CONFIG[riskLevel];

  // Auto-expand when status changes to pending_confirmation
  React.useEffect(() => {
    if (normalizedStatus === "pending_confirmation") {
      setIsExpanded(true);
    }
  }, [normalizedStatus]);

  // ============================================================================
  // Helpers
  // ============================================================================

  const formatArguments = (args: Record<string, unknown>): string => {
    return JSON.stringify(args, null, 2);
  };

  const getSummary = (): string => {
    const path =
      toolCall.arguments.path ||
      toolCall.arguments.old_path ||
      toolCall.arguments.dir ||
      toolCall.arguments.url ||
      toolCall.arguments.command ||
      toolCall.arguments.prompt;

    if (path && typeof path === "string") {
      // Show just the filename or last path component
      const parts = path.split("/");
      const summary = parts[parts.length - 1] || path;
      return summary.length > 40 ? `${summary.slice(0, 40)}...` : summary;
    }
    return "";
  };

  const formatDuration = (ms: number | undefined): string => {
    if (!ms) return "";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Ignore copy errors
    }
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div
      className={cn(
        "rounded-lg border transition-colors",
        status.bgColor,
        status.borderColor,
        isGhostMode && "border-purple-500/30"
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center gap-2 cursor-pointer select-none",
          compact ? "p-2" : "p-3"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
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
              {getSummary()}
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

      {/* Generated image preview (always visible on success) */}
      {toolCall.name === "generate_image" &&
        normalizedStatus === "success" &&
        extractImagePaths(toolCall.result).map((imagePath) => (
          <div key={imagePath} className="px-3 pb-3">
            <GeneratedImage path={imagePath} />
          </div>
        ))}

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3">
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

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            {/* Confirmation buttons */}
            {normalizedStatus === "pending_confirmation" && (
              <>
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onConfirm?.(toolCall.id);
                  }}
                  className={cn(
                    "gap-1.5",
                    isGhostMode && "bg-purple-600 hover:bg-purple-700"
                  )}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReject?.(toolCall.id);
                  }}
                  className="gap-1.5"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Decline
                </Button>
              </>
            )}

            {/* Undo button */}
            {toolCall.undoAvailable && normalizedStatus === "success" && onUndo && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onUndo(toolCall.id);
                }}
                className="gap-1.5"
              >
                <Undo2 className="h-3.5 w-3.5" />
                Undo
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
