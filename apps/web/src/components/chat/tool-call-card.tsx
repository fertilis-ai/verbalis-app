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
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ToolCallState } from "@/lib/tools";

// Icon map for different tool types
const TOOL_ICONS: Record<string, React.ElementType> = {
  read_file: FileText,
  write_file: FileText,
  read_directory: Folder,
  create_directory: Folder,
  delete_path: Trash2,
  list_files: Folder,
  path_exists: FileText,
  rename_path: FileText,
};

interface ToolCallCardProps {
  toolCall: ToolCallState;
  onConfirm?: (toolCallId: string) => void;
  onReject?: (toolCallId: string) => void;
  isGhostMode?: boolean;
}

export function ToolCallCard({
  toolCall,
  onConfirm,
  onReject,
  isGhostMode,
}: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  const Icon = TOOL_ICONS[toolCall.name] || FileText;

  const statusConfig: Record<string, {
    icon: typeof Loader2;
    label: string;
    color: string;
    bgColor: string;
    animate: boolean;
  }> = {
    pending: {
      icon: Loader2,
      label: "Preparing...",
      color: "text-muted-foreground",
      bgColor: "bg-muted/50",
      animate: true,
    },
    pending_confirmation: {
      icon: AlertCircle,
      label: "Awaiting confirmation",
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
      animate: false,
    },
    executing: {
      icon: Loader2,
      label: "Executing...",
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      animate: true,
    },
    success: {
      icon: CheckCircle2,
      label: "Completed",
      color: "text-green-500",
      bgColor: "bg-green-500/10",
      animate: false,
    },
    error: {
      icon: XCircle,
      label: "Failed",
      color: "text-red-500",
      bgColor: "bg-red-500/10",
      animate: false,
    },
    cancelled: {
      icon: XCircle,
      label: "Cancelled",
      color: "text-muted-foreground",
      bgColor: "bg-muted/50",
      animate: false,
    },
    timeout: {
      icon: Loader2,
      label: "Timed out",
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
      animate: false,
    },
  };

  const status = statusConfig[toolCall.status] || statusConfig.pending;
  const StatusIcon = status.icon;

  // Format arguments for display
  const formatArguments = (args: Record<string, unknown>): string => {
    const entries = Object.entries(args);
    if (entries.length === 0) return "No arguments";

    return entries
      .map(([key, value]) => {
        const displayValue =
          typeof value === "string" && value.length > 100
            ? `${value.slice(0, 100)}...`
            : JSON.stringify(value);
        return `${key}: ${displayValue}`;
      })
      .join("\n");
  };

  // Get a short summary for the collapsed view
  const getSummary = (): string => {
    const path =
      toolCall.arguments.path ||
      toolCall.arguments.old_path ||
      toolCall.arguments.dir;
    if (path && typeof path === "string") {
      // Show just the filename or last path component
      const parts = path.split("/");
      return parts[parts.length - 1] || path;
    }
    return toolCall.name.replace(/_/g, " ");
  };

  return (
    <div
      className={cn(
        "rounded-lg border transition-colors",
        status.bgColor,
        isGhostMode && "border-purple-500/30"
      )}
    >
      {/* Header - always visible */}
      <div
        className="flex items-center gap-2 p-3 cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Expand/collapse indicator */}
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

        {/* Status badge */}
        <div className={cn("flex items-center gap-1.5", status.color)}>
          <StatusIcon
            className={cn("h-4 w-4", status.animate && "animate-spin")}
          />
          <span className="text-xs font-medium">{status.label}</span>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Arguments */}
          <div className="rounded bg-background/50 p-2">
            <div className="text-xs font-medium text-muted-foreground mb-1">
              Arguments
            </div>
            <pre className="text-xs whitespace-pre-wrap break-all font-mono">
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
              <div className="text-xs font-medium text-muted-foreground mb-1">
                {toolCall.error ? "Error" : "Result"}
              </div>
              <pre className="text-xs whitespace-pre-wrap break-all font-mono max-h-48 overflow-auto">
                {toolCall.error || toolCall.result}
              </pre>
            </div>
          )}

          {/* Confirmation buttons */}
          {toolCall.status === "pending_confirmation" && (
            <div className="flex items-center gap-2 pt-1">
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
                <Play className="h-3.5 w-3.5" />
                Execute
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onReject?.(toolCall.id);
                }}
              >
                Skip
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
