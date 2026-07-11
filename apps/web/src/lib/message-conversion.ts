import type {
  Message as PiMessage,
  AssistantMessage as PiAssistantMessage,
  ToolResultMessage as PiToolResultMessage,
  Api,
  Usage,
} from "@earendil-works/pi-ai";
import type { Message } from "@/stores/chat-store";

export function buildEmptyUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

/**
 * Convert Verbalis Message[] to pi-ai PiMessage[] for LLM context.
 * Handles user and assistant messages including tool calls and tool results.
 */
export function messagesToPiMessages(
  messages: Message[],
  api: Api,
  provider: string,
  model: string
): PiMessage[] {
  const result: PiMessage[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      result.push({
        role: "user",
        content: message.content,
        timestamp: message.createdAt.getTime(),
      });
      continue;
    }

    // Build assistant message content array
    const content: PiAssistantMessage["content"] = [];

    const trimmed = message.content.trim();
    if (trimmed) {
      content.push({ type: "text", text: trimmed });
    }

    // Include tool calls if any
    if (message.toolCalls) {
      for (const tc of message.toolCalls) {
        if (tc.status === "success" || tc.status === "error") {
          content.push({
            type: "toolCall",
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments as Record<string, unknown>,
          });
        }
      }
    }

    // Skip empty assistant messages
    if (content.length === 0) continue;

    const assistantMessage: PiAssistantMessage = {
      role: "assistant",
      content,
      api,
      provider,
      model,
      usage: buildEmptyUsage(),
      stopReason: message.toolCalls?.some(tc => tc.status === "success" || tc.status === "error")
        ? "toolUse"
        : "stop",
      timestamp: message.createdAt.getTime(),
    };
    result.push(assistantMessage);

    // Add tool result messages for completed tool calls
    if (message.toolCalls) {
      for (const tc of message.toolCalls) {
        if (tc.status === "success" || tc.status === "error") {
          const toolResultMessage: PiToolResultMessage = {
            role: "toolResult",
            toolCallId: tc.id,
            toolName: tc.name,
            content: [{ type: "text", text: tc.result || tc.error || "" }],
            isError: tc.status === "error",
            timestamp: message.createdAt.getTime(),
          };
          result.push(toolResultMessage);
        }
      }
    }
  }

  return result;
}
