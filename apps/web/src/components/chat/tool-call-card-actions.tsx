import { CheckCircle2, Undo2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ToolCallState, ToolCallStatus } from "@/lib/tools";

interface ToolCallActionsProps {
  toolCall: ToolCallState;
  normalizedStatus: ToolCallStatus;
  onConfirm?: (toolCallId: string) => void;
  onReject?: (toolCallId: string) => void;
  onUndo?: (toolCallId: string) => void;
  isGhostMode?: boolean;
}

/** Accept/Decline while awaiting approval, and Undo after a success. */
export function ToolCallActions({
  toolCall,
  normalizedStatus,
  onConfirm,
  onReject,
  onUndo,
  isGhostMode,
}: ToolCallActionsProps) {
  return (
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
  );
}
