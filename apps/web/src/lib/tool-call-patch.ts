import { normalizeToolCallStatus, type ToolCallState, type ToolCallStatus } from "@/lib/tools";
import type { Conversation } from "@/lib/types/chat";

/** True for a tool call that has not reached a final state yet. */
export function isToolCallInFlight(status: ToolCallStatus): boolean {
  return status === "pending" || status === "pending_confirmation" || status === "executing";
}

/** Merge incoming tool calls with existing ones, skipping duplicates by ID. */
export function mergeToolCalls(existing: ToolCallState[], incoming: ToolCallState[]): ToolCallState[] {
  const existingIds = new Set(existing.map((tc) => tc.id));
  return [...existing, ...incoming.filter((tc) => !existingIds.has(tc.id))];
}

/**
 * Apply `patch` to every tool call in the conversation. `patch` returns the
 * same object to leave a call alone; the conversation is returned unchanged
 * when no call changed.
 */
function patchToolCalls(c: Conversation, patch: (tc: ToolCallState) => ToolCallState): Conversation {
  let changed = false;
  const messages = c.messages.map((m) => {
    if (!m.toolCalls) return m;
    let messageChanged = false;
    const toolCalls = m.toolCalls.map((tc) => {
      const next = patch(tc);
      if (next !== tc) messageChanged = true;
      return next;
    });
    if (!messageChanged) return m;
    changed = true;
    return { ...m, toolCalls };
  });
  return changed ? { ...c, messages, updatedAt: new Date() } : c;
}

/**
 * Merge a tool call's latest state into the conversation. Fields the event
 * carries win; fields it omits keep their stored value. A call not yet in any
 * message is appended to the last assistant message.
 */
export function upsertToolCall(c: Conversation, toolCall: ToolCallState): Conversation {
  let found = false;
  const messages = c.messages.map((m) => {
    if (!m.toolCalls) return m;
    const tcIndex = m.toolCalls.findIndex((tc) => tc.id === toolCall.id);
    if (tcIndex === -1) return m;
    found = true;
    const updatedToolCalls = [...m.toolCalls];
    updatedToolCalls[tcIndex] = {
      ...updatedToolCalls[tcIndex],
      ...toolCall,
      status: normalizeToolCallStatus(toolCall.status),
    };
    return { ...m, toolCalls: updatedToolCalls };
  });
  if (!found) {
    const lastIdx = messages.length - 1;
    if (lastIdx >= 0 && messages[lastIdx].role === "assistant") {
      messages[lastIdx] = {
        ...messages[lastIdx],
        toolCalls: [...(messages[lastIdx].toolCalls ?? []), toolCall],
      };
    }
  }
  return { ...c, messages, updatedAt: new Date() };
}

/** Mark every in-flight tool call as stopped (the loop that owned it has ended). */
export function stopInFlightToolCalls(c: Conversation): Conversation {
  return patchToolCalls(c, (tc) => (isToolCallInFlight(tc.status) ? { ...tc, status: "stopped" } : tc));
}

/** Mark one tool call as cancelled with `reason`. */
export function rejectToolCall(c: Conversation, toolCallId: string, reason: string): Conversation {
  return patchToolCalls(c, (tc) =>
    tc.id === toolCallId
      ? { ...tc, status: "cancelled", error: reason, completedAt: tc.completedAt ?? new Date() }
      : tc
  );
}

/**
 * Normalize a tool call read from disk. A call that was still in flight when
 * the chat was saved can never finish, so it becomes an error.
 */
export function restoreToolCall<T extends { status: string; error?: string }>(
  tc: T
): Omit<T, "status"> & { status: ToolCallStatus } {
  const status = normalizeToolCallStatus(tc.status);
  if (!isToolCallInFlight(status)) return { ...tc, status };
  return { ...tc, status: "error", error: tc.error || "Interrupted — app closed during execution" };
}
