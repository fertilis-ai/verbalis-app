/**
 * Sliding-window trimming for the conversation history.
 *
 * When the estimated prompt exceeds the context budget, the oldest messages are
 * evicted from the front until it fits, keeping at least the most-recent N
 * messages and never dropping the in-flight (last) message.
 *
 * Tool-call integrity: in Verbalis's model a tool call and its result are bundled
 * inside a single assistant {@link Message} (the result is emitted right after
 * the assistant message during conversion), so evicting whole messages can
 * never split a tool-call / tool-result pair. After trimming we also drop any
 * leading non-user message so the window starts on a user turn (providers
 * expect the first message to be a user message).
 */

import type { Tool } from "@earendil-works/pi-ai";
import type { Message } from "@/stores/chat-store";
import {
  estimateTokensForText,
  estimateTokensForTools,
  estimateTokensForMessages,
} from "./token-estimate";

export interface TrimResult {
  messages: Message[];
  /** True when at least one message was dropped. */
  trimmed: boolean;
  /** Number of messages dropped from the front. */
  droppedCount: number;
}

export interface TrimParams {
  messages: Message[];
  systemPrompt: string;
  tools?: Tool[];
  contextWindow: number;
  maxTokens: number;
  /** Always keep at least this many of the most-recent messages. Default 4. */
  minRecentMessages?: number;
  /**
   * Fraction of the available input budget to actually target for history
   * (0–1). Lower values leave more headroom; used to retry harder after a
   * context-overflow error. Default 1.
   */
  historyBudgetFactor?: number;
}

export function trimMessagesToBudget(params: TrimParams): TrimResult {
  const {
    messages,
    systemPrompt,
    tools,
    contextWindow,
    maxTokens,
    minRecentMessages = 4,
    historyBudgetFactor = 1,
  } = params;

  const baseTokens = estimateTokensForText(systemPrompt) + estimateTokensForTools(tools);
  const available = Math.max(0, contextWindow - maxTokens);
  const historyBudget = Math.max(0, (available - baseTokens) * clamp01(historyBudgetFactor));

  if (estimateTokensForMessages(messages) <= historyBudget) {
    return { messages, trimmed: false, droppedCount: 0 };
  }

  const minKeep = Math.max(1, Math.min(minRecentMessages, messages.length));
  const result = [...messages];
  let dropped = 0;

  // Evict oldest while over budget and we still have more than minKeep.
  while (result.length > minKeep && estimateTokensForMessages(result) > historyBudget) {
    result.shift();
    dropped++;
  }

  // Normalise the window to start on a user message (without going below
  // minKeep / dropping the in-flight last message).
  while (result.length > minKeep && result[0].role !== "user") {
    result.shift();
    dropped++;
  }

  return { messages: result, trimmed: dropped > 0, droppedCount: dropped };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 1;
  return Math.max(0, Math.min(1, n));
}
