/**
 * Token estimation and context-budget accounting.
 *
 * We don't ship a real tokenizer (pi-ai doesn't expose one), so this uses the
 * standard chars/4 heuristic. It deliberately errs on the high side — a small
 * per-message overhead is added for role/formatting framing — so the budget
 * check trips *before* the provider rejects an over-long prompt rather than
 * after. When real usage figures are available from a prior response, prefer
 * those via {@link reconcileWithUsage}.
 */

import type { Tool, Usage } from "@earendil-works/pi-ai";
import type { Message } from "@/stores/chat-store";

/** Average characters per token for English-ish text. */
const CHARS_PER_TOKEN = 4;
/** Framing overhead charged per message (role markers, delimiters). */
const PER_MESSAGE_OVERHEAD = 4;

export function estimateTokensForText(text: string | undefined | null): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate the tokens a single Verbalis message contributes once converted to
 * pi-ai messages. Only finished tool calls (success/error) are sent to the
 * model, so only those count toward the estimate — matching
 * {@link messagesToPiMessages}.
 */
export function estimateTokensForMessage(message: Message): number {
  let tokens = PER_MESSAGE_OVERHEAD + estimateTokensForText(message.content);
  if (message.toolCalls) {
    for (const tc of message.toolCalls) {
      if (tc.status === "success" || tc.status === "error") {
        // assistant toolCall block
        tokens += estimateTokensForText(tc.name);
        tokens += estimateTokensForText(JSON.stringify(tc.arguments ?? {}));
        // toolResult message
        tokens += PER_MESSAGE_OVERHEAD;
        tokens += estimateTokensForText(tc.result ?? tc.error ?? "");
      }
    }
  }
  return tokens;
}

export function estimateTokensForMessages(messages: Message[]): number {
  let total = 0;
  for (const m of messages) total += estimateTokensForMessage(m);
  return total;
}

/** Estimate the tokens consumed by serialized tool schemas. */
export function estimateTokensForTools(tools: Tool[] | undefined): number {
  if (!tools || tools.length === 0) return 0;
  return estimateTokensForText(JSON.stringify(tools));
}

export interface ContextBudget {
  /** Total context window of the model. */
  contextWindow: number;
  /** Tokens reserved for the model's response (model.maxTokens). */
  reservedForResponse: number;
  /** Estimated tokens for system prompt. */
  systemTokens: number;
  /** Estimated tokens for tool schemas. */
  toolTokens: number;
  /** Estimated tokens for conversation history. */
  historyTokens: number;
  /** systemTokens + toolTokens + historyTokens. */
  used: number;
  /** Tokens available for input = contextWindow - reservedForResponse. */
  available: number;
  /** available - used. Negative means over budget. */
  remaining: number;
  /** Whether the estimated prompt fits within the budget. */
  withinBudget: boolean;
}

/**
 * Compute the input-side context budget for a request: how many tokens the
 * system prompt, tool schemas, and history are estimated to consume vs. how
 * many are available before the model's response reservation.
 */
export function computeContextBudget(params: {
  systemPrompt: string;
  tools?: Tool[];
  messages: Message[];
  contextWindow: number;
  maxTokens: number;
}): ContextBudget {
  const { systemPrompt, tools, messages, contextWindow, maxTokens } = params;
  const systemTokens = estimateTokensForText(systemPrompt);
  const toolTokens = estimateTokensForTools(tools);
  const historyTokens = estimateTokensForMessages(messages);
  const used = systemTokens + toolTokens + historyTokens;
  const available = Math.max(0, contextWindow - maxTokens);
  const remaining = available - used;
  return {
    contextWindow,
    reservedForResponse: maxTokens,
    systemTokens,
    toolTokens,
    historyTokens,
    used,
    available,
    remaining,
    withinBudget: remaining >= 0,
  };
}

/**
 * Given a real {@link Usage} report from a prior response, return the ratio
 * between actual and estimated input tokens so callers can calibrate future
 * estimates. Returns null when the usage figures aren't usable.
 */
export function reconcileWithUsage(estimatedInput: number, usage: Usage | undefined): number | null {
  if (!usage || estimatedInput <= 0) return null;
  const actual = usage.input + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
  if (actual <= 0) return null;
  return actual / estimatedInput;
}
