import * as React from "react";
import { cn } from "@/lib/utils";
import { GeneratedImage } from "./generated-image";
import { useToolboxDiff } from "@/lib/toolbox/use-toolbox-diff";
import { normalizeToolCallStatus, type ToolCallState } from "@/lib/tools";
import { STATUS_CONFIG } from "./tool-call-card-config";
import { ToolCallHeader } from "./tool-call-card-header";
import { ToolCallDetails } from "./tool-call-card-details";
import { ToolCallActions } from "./tool-call-card-actions";

/** Extract saved image paths from a generate_image tool result. */
export function extractImagePaths(result?: string): string[] {
  if (!result) return [];
  return [...result.matchAll(/^Saved to: (.+)$/gm)].map((m) => m[1].trim());
}

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

  const status = STATUS_CONFIG[normalizedStatus] || STATUS_CONFIG.stopped;

  // Auto-expand when status changes to pending_confirmation
  React.useEffect(() => {
    if (normalizedStatus === "pending_confirmation") {
      setIsExpanded(true);
    }
  }, [normalizedStatus]);

  const toolboxDiff = useToolboxDiff(
    toolCall,
    normalizedStatus === "pending_confirmation" &&
      (toolCall.name === "edit_toolbox_item" || toolCall.name === "write_toolbox_item")
  );

  return (
    <div
      className={cn(
        "rounded-lg border transition-colors",
        status.bgColor,
        status.borderColor,
        isGhostMode && "border-purple-500/30"
      )}
    >
      <ToolCallHeader
        toolCall={toolCall}
        status={status}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded(!isExpanded)}
        isGhostMode={isGhostMode}
        showTiming={showTiming}
        showCategory={showCategory}
        compact={compact}
      />

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
          <ToolCallDetails
            toolCall={toolCall}
            normalizedStatus={normalizedStatus}
            toolboxDiff={toolboxDiff}
            showTiming={showTiming}
            showCategory={showCategory}
          />
          <ToolCallActions
            toolCall={toolCall}
            normalizedStatus={normalizedStatus}
            onConfirm={onConfirm}
            onReject={onReject}
            onUndo={onUndo}
            isGhostMode={isGhostMode}
          />
        </div>
      )}
    </div>
  );
}
