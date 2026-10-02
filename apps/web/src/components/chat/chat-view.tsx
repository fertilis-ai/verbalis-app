import * as React from "react";
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import { useAgenticLoopStore } from "@/stores/agentic-loop-store";
import { ChatInput } from "./chat-input";
import { ChatHeader } from "./chat-header";
import { ToolCallCard } from "./tool-call-card";
import { MarkdownContent } from "./markdown-content";
import { GuardrailConfirmationBar } from "./guardrail-confirmation-bar";
import { SpeechButton } from "./speech-button";
import { useElapsedTime } from "@/lib/hooks/use-elapsed-time";
import { getUndoManager } from "@/lib/guardrails/undo-manager";
import { isTauri } from "@/lib/storage";

export function ChatView() {
  const {
    sendMessage,
    isStreaming,
    isGhostMode,
    confirmToolExecution,
    rejectToolExecution,
    addContextFiles,
    removeContextFile,
  } = useChatStore();
  const contextFiles = useChatStore((s) => s.contextFiles);
  const currentConversation = useChatStore((s) => s.getCurrentConversation());

  const currentStatus = useAgenticLoopStore((s) => s.currentStatus);
  const pendingToolCalls = useAgenticLoopStore((s) => s.pendingToolCalls);
  const confirmAllPending = useAgenticLoopStore((s) => s.confirmAllPending);
  const rejectAllPending = useAgenticLoopStore((s) => s.rejectAllPending);

  const isLoopActive = currentStatus === "thinking" || currentStatus === "tool_executing" || currentStatus === "tool_pending";

  // Keep periodic re-renders during active loops so tool call cards update
  useElapsedTime(isLoopActive);

  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const messageListRef = React.useRef<HTMLDivElement>(null);
  // Whether to follow new content; cleared when the user scrolls up to read.
  const stickToBottomRef = React.useRef(true);
  const lastScrollTopRef = React.useRef(0);

  const scrollToBottom = () => {
    stickToBottomRef.current = true;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      stickToBottomRef.current = true;
    } else if (el.scrollTop < lastScrollTopRef.current) {
      stickToBottomRef.current = false;
    }
    lastScrollTopRef.current = el.scrollTop;
  };

  // Use message count and pending count to avoid array reference issues
  const messageCount = currentConversation?.messages?.length ?? 0;
  const pendingCount = pendingToolCalls.length;
  const hasMessages = messageCount > 0;

  React.useEffect(() => {
    scrollToBottom();
  }, [messageCount, pendingCount]);

  // Message count alone misses content that grows in place (streamed text,
  // tool results, the final answer), so follow the list's height too.
  React.useEffect(() => {
    const el = scrollContainerRef.current;
    const list = messageListRef.current;
    if (!hasMessages || !el || !list || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, [hasMessages]);

  const handleSend = async (message: string) => {
    await sendMessage(message);
  };

  const handleUndo = async (toolCallId: string) => {
    const undoManager = getUndoManager();
    const success = await undoManager.executeUndoByToolCallId(toolCallId);
    if (!success) {
      console.error("Failed to undo tool call:", toolCallId);
    }
  };

  const handleAddFiles = isTauri()
    ? async () => {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({ multiple: true, directory: false });
        if (selected) {
          const paths = Array.isArray(selected) ? selected : [selected];
          await addContextFiles(paths);
        }
      }
    : undefined;

  const conversationId = currentConversation?.id;

  const handleAcceptAll = () => {
    if (conversationId) confirmAllPending(conversationId);
  };

  const handleDeclineAll = () => {
    if (conversationId) rejectAllPending(conversationId);
  };

  const handleAcceptOne = (toolCallId: string) => {
    if (conversationId) confirmToolExecution(toolCallId);
  };

  const handleDeclineOne = (toolCallId: string) => {
    if (conversationId) rejectToolExecution(toolCallId);
  };

  const messages = currentConversation?.messages ?? [];

  return (
    <div className="flex h-full flex-col">
      {/* Header with ghost mode toggle */}
      <ChatHeader />

      {/* Messages */}
      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Bot className={cn(
                "mx-auto h-12 w-12",
                isGhostMode ? "text-purple-400" : "text-muted-foreground"
              )} />
              <h2 className="mt-4 text-lg font-medium">
                {isGhostMode ? "Incognito Session" : "Start a conversation"}
              </h2>
              <p className={cn(
                "mt-2 text-sm",
                isGhostMode ? "text-purple-300/70" : "text-muted-foreground"
              )}>
                {isGhostMode
                  ? "Messages won't be saved to disk"
                  : "Send a message to begin chatting with your AI assistant"}
              </p>
            </div>
          </div>
        ) : (
          <div ref={messageListRef} className="mx-auto max-w-3xl space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "group/message flex gap-3",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {msg.role === "assistant" && (
                  <div className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    isGhostMode ? "bg-purple-500 text-white" : "bg-primary text-primary-foreground"
                  )}>
                    <Bot className="h-4 w-4" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] space-y-2",
                    msg.role === "user" && "flex flex-col items-end"
                  )}
                >
                  {/* Text content */}
                  {msg.content && (
                    <div
                      className={cn(
                        "rounded-lg px-4 py-2",
                        msg.role === "user"
                          ? isGhostMode
                            ? "bg-purple-600 text-white"
                            : "bg-primary text-primary-foreground"
                          : "bg-muted"
                      )}
                    >
                      {msg.role === "assistant" ? (
                        <MarkdownContent
                          content={msg.content}
                          isStreaming={isStreaming && msg === messages[messages.length - 1]}
                        />
                      ) : (
                        <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                      )}
                    </div>
                  )}

                  {/* Read aloud */}
                  {msg.role === "assistant" &&
                    msg.content &&
                    !(isStreaming && msg === messages[messages.length - 1]) && (
                      <SpeechButton text={msg.content} />
                    )}

                  {/* Tool calls */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="space-y-2 w-full">
                      {msg.toolCalls.map((toolCall) => (
                        <ToolCallCard
                          key={toolCall.id}
                          toolCall={toolCall}
                          onConfirm={confirmToolExecution}
                          onReject={rejectToolExecution}
                          onUndo={handleUndo}
                          isGhostMode={isGhostMode}
                          showTiming={true}
                          showCategory={true}
                        />
                      ))}
                    </div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Guardrail confirmation bar */}
      <GuardrailConfirmationBar
        pendingToolCalls={pendingToolCalls}
        onAcceptAll={handleAcceptAll}
        onDeclineAll={handleDeclineAll}
        onAcceptOne={handleAcceptOne}
        onDeclineOne={handleDeclineOne}
      />

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        disabled={isStreaming || isLoopActive}
        isLoopActive={isLoopActive}
        onStop={() => conversationId && useAgenticLoopStore.getState().stopLoop(conversationId)}
        contextFiles={contextFiles}
        onAddFiles={handleAddFiles}
        onRemoveFile={removeContextFile}
      />
    </div>
  );
}
