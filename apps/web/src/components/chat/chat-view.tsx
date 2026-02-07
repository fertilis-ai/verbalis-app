import * as React from "react";
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import { useAgenticLoopStore } from "@/stores/agentic-loop-store";
import { ChatInput } from "./chat-input";
import { ChatHeader } from "./chat-header";
import { ToolCallCardV2 } from "./tool-call-card-v2";
import { MarkdownContent } from "./markdown-content";
import { GuardrailConfirmationBar } from "./guardrail-confirmation-bar";
import { useElapsedTime } from "./loop-progress-panel";
import { getUndoManager } from "@/lib/guardrails/undo-manager";

export function ChatView() {
  const {
    currentConversation,
    sendMessage,
    isStreaming,
    isGhostMode,
    confirmToolExecution,
    rejectToolExecution,
  } = useChatStore();

  const currentStatus = useAgenticLoopStore((s) => s.currentStatus);
  const pendingToolCalls = useAgenticLoopStore((s) => s.pendingToolCalls);
  const confirmAllPending = useAgenticLoopStore((s) => s.confirmAllPending);
  const rejectAllPending = useAgenticLoopStore((s) => s.rejectAllPending);

  const isLoopActive = currentStatus === "thinking" || currentStatus === "tool_executing" || currentStatus === "tool_pending";

  // Keep periodic re-renders during active loops so tool call cards update
  useElapsedTime(isLoopActive);

  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Use message count and pending count to avoid array reference issues
  const messageCount = currentConversation?.messages?.length ?? 0;
  const pendingCount = pendingToolCalls.length;

  React.useEffect(() => {
    scrollToBottom();
  }, [messageCount, pendingCount]);

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
      <div className="flex-1 overflow-auto p-4">
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
          <div className="mx-auto max-w-3xl space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-3",
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

                  {/* Tool calls */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="space-y-2 w-full">
                      {msg.toolCalls.map((toolCall) => (
                        <ToolCallCardV2
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
      <ChatInput onSend={handleSend} disabled={isStreaming || isLoopActive} />
    </div>
  );
}
