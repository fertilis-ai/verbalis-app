/**
 * Protocol Parser Utility
 *
 * Parses tool call protocol markers from AI model streaming responses.
 * Some local LLM models embed tool calls in text output using a custom protocol
 * instead of the standard OpenAI tool_calls format.
 *
 * Protocol formats:
 * - <|channel|>commentary to=tool_name format<|message|>{"arg":"value"...}
 * - <|channel|>commentary to=tool_name <|constrain|>format<|message|>{"arg":"value"...}
 */

export interface ParsedToolCall {
  name: string;
  arguments: Record<string, unknown>;
  rawMatch: string;
}

export interface ParseResult {
  /** Clean text with protocol blocks removed */
  cleanText: string;
  /** Extracted tool calls */
  toolCalls: ParsedToolCall[];
  /** Whether the text ends with an incomplete protocol block (still streaming) */
  hasIncompleteBlock: boolean;
}

// Regex to match complete protocol blocks
// Format: <|channel|>commentary to=TOOL_NAME format<|message|>JSON
const COMPLETE_BLOCK_REGEX =
  /<\|channel\|>commentary\s+to=(\S+)\s+\w*<\|message\|>(\{[\s\S]*?\})/g;

// Regex for blocks with <|constrain|>
// Format: <|channel|>commentary to=TOOL_NAME <|constrain|>format<|message|>JSON
const COMPLETE_BLOCK_WITH_CONSTRAIN_REGEX =
  /<\|channel\|>commentary\s+to=(\S+)\s*<\|constrain\|>\w*<\|message\|>(\{[\s\S]*?\})/g;

// Check if text ends with an incomplete block (for streaming)
const INCOMPLETE_BLOCK_PATTERNS = [
  /<\|channel\|>[^]*$/,  // Started but not complete
  /<\|[^|>]*$/,          // Incomplete marker at end
];

/**
 * Parse protocol markers from text and extract tool calls.
 */
export function parseProtocolMarkers(text: string): ParseResult {
  const toolCalls: ParsedToolCall[] = [];
  let cleanText = text;

  // First try to match blocks with <|constrain|>
  let match: RegExpExecArray | null;
  const constrainRegex = new RegExp(COMPLETE_BLOCK_WITH_CONSTRAIN_REGEX.source, 'g');
  while ((match = constrainRegex.exec(text)) !== null) {
    const [fullMatch, toolName, jsonStr] = match;
    try {
      const args = JSON.parse(jsonStr);
      toolCalls.push({
        name: toolName,
        arguments: args,
        rawMatch: fullMatch,
      });
    } catch {
      // JSON parse failed, skip this match
    }
  }

  // Then try to match blocks without <|constrain|>
  const simpleRegex = new RegExp(COMPLETE_BLOCK_REGEX.source, 'g');
  while ((match = simpleRegex.exec(text)) !== null) {
    const [fullMatch, toolName, jsonStr] = match;
    // Check if this was already matched by the constrain regex
    const alreadyMatched = toolCalls.some(tc => tc.rawMatch === fullMatch || text.indexOf(tc.rawMatch) === text.indexOf(fullMatch));
    if (alreadyMatched) continue;

    try {
      const args = JSON.parse(jsonStr);
      toolCalls.push({
        name: toolName,
        arguments: args,
        rawMatch: fullMatch,
      });
    } catch {
      // JSON parse failed, skip this match
    }
  }

  // Remove all matched blocks from the text
  for (const tc of toolCalls) {
    cleanText = cleanText.replace(tc.rawMatch, '');
  }

  // Also remove any standalone JSON payloads that look like tool args
  // (in case the model outputs JSON without the full protocol)
  cleanText = cleanText.replace(/^\s*\{"(?:patch|path|content|query|url|command)":[^}]*\}\s*$/gm, '');

  // Check for incomplete blocks at end (streaming)
  let hasIncompleteBlock = false;
  for (const pattern of INCOMPLETE_BLOCK_PATTERNS) {
    if (pattern.test(cleanText)) {
      hasIncompleteBlock = true;
      // Remove the incomplete part
      cleanText = cleanText.replace(pattern, '');
      break;
    }
  }

  // Clean up whitespace
  cleanText = cleanText.replace(/\n{3,}/g, '\n\n').trim();

  return {
    cleanText,
    toolCalls,
    hasIncompleteBlock,
  };
}

/**
 * Simple function to strip protocol markers without parsing.
 * Use this when you just want clean display text.
 */
export function stripProtocolMarkers(text: string): string {
  return parseProtocolMarkers(text).cleanText;
}
