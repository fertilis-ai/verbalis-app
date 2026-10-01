import { getAppDataDir, saveChatToFolder, type ChatData } from "@/lib/storage";
import { dirname } from "@/lib/path-resolution";
import { stripProtocolMarkers } from "@/lib/protocol-parser";
import { restoreToolCall } from "@/lib/tool-call-patch";
import type { Conversation, Message } from "@/stores/chat-store";

/** Serialize a Conversation's messages to ChatData message format for disk persistence. */
export function serializeMessages(messages: Message[]): ChatData["messages"] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    ...(m.toolCalls?.length ? {
      toolCalls: m.toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
        status: tc.status,
        result: tc.result,
        error: tc.error,
        durationMs: tc.durationMs,
      })),
    } : {}),
  }));
}

/**
 * Read messages back from disk: protocol markers are stripped and tool calls
 * that were in flight when the chat was saved become errors.
 */
export function deserializeMessages(messages: ChatData["messages"]): Message[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: stripProtocolMarkers(m.content),
    createdAt: new Date(m.createdAt),
    ...(m.toolCalls?.length ? { toolCalls: m.toolCalls.map(restoreToolCall) } : {}),
  }));
}

/** Build a ChatData object from a Conversation for disk persistence. */
export function conversationToChatData(conv: Conversation, model: string, agentId: string | null): ChatData {
  return {
    id: conv.id,
    title: conv.title,
    model,
    agentId,
    messages: serializeMessages(conv.messages),
    createdAt: conv.createdAt.toISOString(),
    updatedAt: conv.updatedAt.toISOString(),
  };
}

/**
 * The folder argument `saveChatToFolder` expects for a chat stored in `dir`:
 * `undefined` for the root chats directory, otherwise the directory itself.
 */
export async function chatFolderArg(dir: string): Promise<string | undefined> {
  return dir === `${await getAppDataDir()}/chats` ? undefined : dir;
}

/** Save a conversation back to the folder its `path` points into. No-op without a path. */
export async function saveConversation(conv: Conversation, model: string, agentId: string | null): Promise<void> {
  if (!conv.path) return;
  await saveChatToFolder(conversationToChatData(conv, model, agentId), await chatFolderArg(dirname(conv.path)));
}
