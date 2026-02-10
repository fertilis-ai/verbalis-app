import { createHighlighter, type Highlighter, bundledLanguages } from "shiki";
import { CODE_HIGHLIGHT_THEMES } from "@/lib/code-theme";

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: CODE_HIGHLIGHT_THEMES.list,
      langs: [],
    });
  }
  return highlighterPromise;
}

const loadingLanguages = new Map<string, Promise<void>>();

export function isBundledLanguage(lang: string): boolean {
  return lang in bundledLanguages;
}

async function ensureLanguage(h: Highlighter, lang: string): Promise<void> {
  if (h.getLoadedLanguages().includes(lang)) return;
  if (!isBundledLanguage(lang)) return;

  const existing = loadingLanguages.get(lang);
  if (existing) {
    await existing;
    return;
  }

  const promise = h.loadLanguage(lang as keyof typeof bundledLanguages).then(() => {
    loadingLanguages.delete(lang);
  });
  loadingLanguages.set(lang, promise);
  await promise;
}

export async function highlightCode(
  code: string,
  lang: string,
): Promise<string | null> {
  if (lang === "plaintext" || !isBundledLanguage(lang)) return null;

  const h = await getHighlighter();
  await ensureLanguage(h, lang);

  return h.codeToHtml(code, {
    lang,
    themes: {
      dark: CODE_HIGHLIGHT_THEMES.dark,
      light: CODE_HIGHLIGHT_THEMES.light,
    },
  });
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
