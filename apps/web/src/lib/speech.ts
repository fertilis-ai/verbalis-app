import { readErrorBody } from "@/lib/http";
import { openRouterFetch } from "@/lib/openrouter";

// Long answers synthesize slowly; give upstream providers plenty of headroom.
const SPEECH_TIMEOUT_MS = 120_000;
// OpenAI-compatible speech endpoints cap input at 4096 characters.
export const MAX_SPEECH_INPUT_CHARS = 4096;

/**
 * Reduce assistant markdown to plain prose so TTS doesn't read syntax aloud.
 * Deliberately dumb regexes — code blocks are dropped entirely (reading code
 * aloud is noise), everything else keeps its text content.
 */
export function stripMarkdownForSpeech(markdown: string): string {
  return (
    markdown
      .replace(/^```.*$[\s\S]*?^```[ \t]*$/gm, "") // fenced code blocks
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images → alt text
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → link text
      .replace(/`([^`]+)`/g, "$1") // inline code → content
      .replace(/^#{1,6}[ \t]+/gm, "") // heading markers
      .replace(/^[ \t]{0,3}>[ \t]?/gm, "") // blockquote markers
      .replace(/^[ \t]*(?:[-*+]|\d+\.)[ \t]+/gm, "") // list markers
      .replace(/^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm, "") // horizontal rules
      .replace(/(\*\*|__|\*|_)(\S(?:.*?\S)?)\1/g, "$2") // bold/italic markers
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** Synthesize speech for `text` via OpenRouter's TTS API; resolves to an mp3 blob. */
export async function synthesizeSpeech(
  text: string,
  opts: { model: string; voice?: string; apiKey: string; signal?: AbortSignal; zdr?: boolean }
): Promise<Blob> {
  const signals = [AbortSignal.timeout(SPEECH_TIMEOUT_MS)];
  if (opts.signal) signals.push(opts.signal);
  const resp = await openRouterFetch("/audio/speech", {
    apiKey: opts.apiKey,
    zdr: opts.zdr,
    body: {
      model: opts.model,
      input: text,
      response_format: "mp3",
      // Omit `voice` entirely when unset so the provider default applies.
      ...(opts.voice ? { voice: opts.voice } : {}),
    },
    signal: AbortSignal.any(signals),
  });
  if (!resp.ok) throw new Error(`Speech synthesis failed (${await readErrorBody(resp)})`);
  return new Blob([await resp.arrayBuffer()], { type: "audio/mpeg" });
}
