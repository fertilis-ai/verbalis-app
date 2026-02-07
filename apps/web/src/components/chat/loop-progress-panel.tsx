import * as React from "react";
import {
  Pause,
  Play,
  Square,
  Check,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { AgentLoopStatus, LoopIteration } from "@/lib/agentic/types";
import type { ToolCallState } from "@/lib/tools";

// ============================================================================
// Types
// ============================================================================

interface LoopProgressPanelProps {
  status: AgentLoopStatus;
  currentIteration: LoopIteration | null;
  iterations: LoopIteration[];
  pendingToolCalls: ToolCallState[];
  maxIterations: number;
  elapsedTime: number; // in seconds

  // Control callbacks
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  onApproveAll?: () => void;

  // Display options
  compact?: boolean;
  showHistory?: boolean;
}

// ============================================================================
// Status Configuration
// ============================================================================

const STATUS_CONFIG: Record<AgentLoopStatus, {
  icon: React.ElementType;
  label: string;
  color: string;
  bgColor: string;
  animate: boolean;
}> = {
  idle: {
    icon: AlertCircle,
    label: "Idle",
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    animate: false,
  },
  thinking: {
    icon: Loader2,
    label: "Thinking...",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    animate: true,
  },
  tool_pending: {
    icon: AlertCircle,
    label: "Awaiting Approval",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    animate: false,
  },
  tool_executing: {
    icon: Loader2,
    label: "Executing...",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    animate: true,
  },
  awaiting_user: {
    icon: AlertCircle,
    label: "Awaiting Input",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    animate: false,
  },
  paused: {
    icon: Pause,
    label: "Paused",
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    animate: false,
  },
  completed: {
    icon: Check,
    label: "Completed",
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    animate: false,
  },
  error: {
    icon: AlertCircle,
    label: "Error",
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    animate: false,
  },
  aborted: {
    icon: Square,
    label: "Stopped",
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    animate: false,
  },
};

// ============================================================================
// Component
// ============================================================================

export function LoopProgressPanel({
  status,
  currentIteration,
  iterations,
  pendingToolCalls,
  maxIterations,
  elapsedTime,
  onPause,
  onResume,
  onStop,
  onApproveAll,
  compact = false,
  showHistory = true,
}: LoopProgressPanelProps) {
  const [isHistoryExpanded, setIsHistoryExpanded] = React.useState(false);

  const statusConfig = STATUS_CONFIG[status];
  const StatusIcon = statusConfig.icon;

  const currentStep = iterations.length + (currentIteration ? 1 : 0);
  const progressPercent = Math.min(100, Math.round((currentStep / maxIterations) * 100));

  const isActive = status === "thinking" || status === "tool_executing" || status === "tool_pending";
  const isPaused = status === "paused";
  const isFinished = status === "completed" || status === "error" || status === "aborted";
  const hasPendingApprovals = pendingToolCalls.length > 0;

  // Format elapsed time
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Get current step label
  const getCurrentLabel = (): string => {
    if (currentIteration?.reasoning) {
      return currentIteration.reasoning.slice(0, 60) + (currentIteration.reasoning.length > 60 ? "..." : "");
    }
    if (status === "thinking") {
      return "Processing request...";
    }
    if (status === "tool_executing" && currentIteration?.toolCalls.length) {
      const executing = currentIteration.toolCalls.find(tc => tc.status === "executing");
      if (executing) {
        return `Executing ${executing.name.replace(/_/g, " ")}...`;
      }
    }
    if (status === "tool_pending") {
      return `${pendingToolCalls.length} tool${pendingToolCalls.length !== 1 ? "s" : ""} awaiting approval`;
    }
    return statusConfig.label;
  };

  if (compact && !isActive && !hasPendingApprovals) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-lg border transition-colors",
        statusConfig.bgColor,
        hasPendingApprovals && "border-amber-500/50"
      )}
    >
      {/* Header */}
      <div className={cn("p-3", compact && "p-2")}>
        <div className="flex items-center justify-between gap-2">
          {/* Status */}
          <div className="flex items-center gap-2">
            <div className={cn("flex items-center gap-1.5", statusConfig.color)}>
              <StatusIcon
                className={cn("h-4 w-4", statusConfig.animate && "animate-spin")}
              />
              <span className="text-sm font-medium">
                Agentic Loop - Step {currentStep}/{maxIterations}
              </span>
            </div>
          </div>

          {/* Timer */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{formatTime(elapsedTime)}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-300",
              ({
                completed: "bg-green-500",
                error: "bg-red-500",
                aborted: "bg-red-500",
              } as Record<string, string>)[status] ?? "bg-primary"
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Current activity */}
        <div className="mt-2 text-sm text-muted-foreground truncate">
          {getCurrentLabel()}
        </div>
      </div>

      {/* Step history (expandable) */}
      {showHistory && iterations.length > 0 && (
        <div className="border-t">
          <button
            className="w-full px-3 py-2 flex items-center justify-between text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
            onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
          >
            <span>History ({iterations.length} steps)</span>
            {isHistoryExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {isHistoryExpanded && (
            <div className="px-3 pb-3 space-y-1 max-h-40 overflow-auto">
              {iterations.map((iteration, index) => (
                <div
                  key={iteration.id}
                  className="flex items-center gap-2 text-xs"
                >
                  <span
                    className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center text-xs",
                      iteration.status === "completed"
                        ? "bg-green-500/20 text-green-500"
                        : "bg-red-500/20 text-red-500"
                    )}
                  >
                    {iteration.status === "completed" ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <AlertCircle className="h-3 w-3" />
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    Step {index + 1}
                  </span>
                  {iteration.toolCalls.length > 0 && (
                    <span className="text-muted-foreground/70">
                      - {iteration.toolCalls.length} tool{iteration.toolCalls.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  {iteration.error && (
                    <span className="text-red-500 truncate flex-1">
                      {iteration.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Control buttons */}
      <div className="border-t px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Pause/Resume */}
          {isActive && !isPaused && onPause && (
            <Button
              size="sm"
              variant="outline"
              onClick={onPause}
              className="gap-1.5"
            >
              <Pause className="h-3.5 w-3.5" />
              Pause
            </Button>
          )}

          {isPaused && onResume && (
            <Button
              size="sm"
              variant="outline"
              onClick={onResume}
              className="gap-1.5"
            >
              <Play className="h-3.5 w-3.5" />
              Resume
            </Button>
          )}

          {/* Stop */}
          {(isActive || isPaused) && onStop && (
            <Button
              size="sm"
              variant="outline"
              onClick={onStop}
              className="gap-1.5"
            >
              <Square className="h-3.5 w-3.5" />
              Stop
            </Button>
          )}
        </div>

        {/* Approve All */}
        {hasPendingApprovals && onApproveAll && (
          <Button
            size="sm"
            onClick={onApproveAll}
            className="gap-1.5"
          >
            <Check className="h-3.5 w-3.5" />
            Approve All ({pendingToolCalls.length})
          </Button>
        )}

        {/* Finished state */}
        {isFinished && (
          <div className="flex items-center gap-2 text-sm">
            <span className={statusConfig.color}>
              {({
                completed: "Task completed",
                error: "Task failed",
              } as Record<string, string>)[status] ?? "Task stopped"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

