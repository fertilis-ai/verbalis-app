/**
 * The `remember` tool — the narrowest slice of self-enhancement, and what
 * makes "learns over time" real. It appends a fact to a memory file in the
 * canonical app-data memories store and ensures that memory is injected into
 * future prompts (`alwaysInclude: true`), so a fact remembered mid-conversation
 * shows up in the next session.
 *
 * Unlike the broader Toolbox CRUD tools (gated behind allowSelfEnhancement),
 * `remember` is always available — it only ever appends to memory and never
 * touches agents/skills/workflows — but it is still routed through guardrails
 * as a write-risk action.
 */

import matter from "gray-matter";
import { loadToolboxItem, saveToolboxItem } from "@/lib/storage";
import { useToolboxStore } from "@/stores/toolbox-store";

/** Default memory file the agent appends learned facts to. */
export const DEFAULT_MEMORY_NAME = "learned";

function isSafeName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name.length <= 128 &&
    !name.includes("/") &&
    !name.includes("\\") &&
    !name.includes("..") &&
    !name.startsWith(".")
  );
}

export interface RememberArgs {
  content?: unknown;
  name?: unknown;
}

export async function executeRemember(args: RememberArgs): Promise<string> {
  if (typeof args.content !== "string" || args.content.trim() === "") {
    throw new Error("remember requires non-empty content.");
  }
  const name = isSafeName(args.name) ? args.name : DEFAULT_MEMORY_NAME;
  const fact = args.content.trim();

  // Load existing memory (preserve its body + frontmatter), then append.
  const existing = await loadToolboxItem("memories", name);
  let frontmatter: Record<string, unknown> = {};
  let body = "";
  if (existing) {
    try {
      const parsed = matter(existing.content);
      frontmatter = { ...(parsed.data as Record<string, unknown>) };
      body = parsed.content.trim();
    } catch {
      body = existing.content.trim();
    }
  }

  // Ensure the memory is injected into future prompts. SOUL/USER are always
  // injected regardless; for any other file we set alwaysInclude.
  if (!isWellKnown(name)) {
    frontmatter.alwaysInclude = true;
  }

  const line = `- ${fact}`;
  const newBody = body ? `${body}\n${line}` : line;
  const content = matter.stringify(`${newBody}\n`, frontmatter);

  await saveToolboxItem({
    name,
    category: "memories",
    content,
    updatedAt: new Date().toISOString(),
  });

  try {
    await useToolboxStore.getState().loadItemsFromDisk();
  } catch (e) {
    console.warn("[memory-tools] live reload failed:", e);
  }

  return `Remembered in "${name}".`;
}

function isWellKnown(name: string): boolean {
  const n = name.toLowerCase();
  return n === "soul" || n === "user";
}
