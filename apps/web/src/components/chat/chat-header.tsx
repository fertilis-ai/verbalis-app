import * as React from "react";
import { Ghost } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";

export function ChatHeader() {
  const {
    currentConversation,
    isGhostMode,
    startGhostSession,
    exitGhostSession,
  } = useChatStore();

  const handleGhostToggle = () => {
    if (isGhostMode) {
      exitGhostSession();
    } else {
      startGhostSession();
    }
  };

  const title = isGhostMode
    ? "Incognito Session"
    : (currentConversation?.title ?? "New Chat");

  return (
    <div
      className={cn(
        "flex h-10 items-center justify-between border-b border-border px-2",
        isGhostMode && "bg-purple-500/5"
      )}
    >
      <span
        className={cn(
          "text-sm font-medium",
          isGhostMode && "text-purple-300"
        )}
      >
        {title}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleGhostToggle}
        title={isGhostMode ? "Exit incognito mode" : "Enter incognito mode"}
        className={cn(
          isGhostMode && "text-purple-400 bg-purple-500/20 hover:bg-purple-500/30"
        )}
      >
        <Ghost className={cn("h-4 w-4", isGhostMode && "fill-purple-400")} />
      </Button>
    </div>
  );
}
