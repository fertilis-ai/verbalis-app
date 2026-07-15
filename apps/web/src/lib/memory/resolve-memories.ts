/**
 * Memory resolution — assembles the memory text injected into the system
 * prompt each turn.
 *
 * Canonical store is the app-data memories dir (the same files the Toolbox
 * "memories" category edits). SOUL and USER are well-known entries that are
 * always injected; any other memory may opt in via `alwaysInclude: true` in
 * its frontmatter. The user's Settings Directory (`<settingsDir>/memories/`)
 * is a second source under the same rules — app-data files win on name
 * clashes.
 *
 * Total injected size is bounded so memory can't blow the context budget;
 * SOUL/USER are prioritised, then alwaysInclude memories in name order.
 */

import matter from "gray-matter";
import { listFiles, listToolboxItems, loadToolboxItem, readFile } from "@/lib/storage";

export interface ResolvedMemory {
  name: string;
  heading: string;
  body: string;
}

/** Default cap on injected memory text (~6k tokens at chars/4). */
export const DEFAULT_MAX_MEMORY_CHARS = 24_000;

const WELL_KNOWN: Record<string, string> = {
  soul: "Soul",
  user: "User",
};

function headingFor(name: string): string {
  return WELL_KNOWN[name.toLowerCase()] ?? name;
}

function isWellKnown(name: string): boolean {
  return name.toLowerCase() in WELL_KNOWN;
}

/** Parse a memory file's frontmatter + body; tolerant of plain markdown. */
function parseMemory(content: string): { alwaysInclude: boolean; body: string } {
  try {
    const { data, content: body } = matter(content);
    return {
      alwaysInclude: data?.alwaysInclude === true,
      body: body.trim(),
    };
  } catch {
    return { alwaysInclude: false, body: content.trim() };
  }
}

/**
 * Resolve the memories to inject. Returns them in injection order with each
 * body already trimmed; callers render `## {heading}\n{body}`.
 */
export async function resolveMemories(opts: {
  settingsDir?: string;
  maxChars?: number;
} = {}): Promise<ResolvedMemory[]> {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_MEMORY_CHARS;

  // 1. Load all memories from the canonical app-data store.
  const names = await safeList();
  const wellKnown: ResolvedMemory[] = [];
  const optIn: ResolvedMemory[] = [];
  const seen = new Set<string>();

  for (const name of names) {
    const item = await loadToolboxItem("memories", name);
    if (!item) continue;
    const { alwaysInclude, body } = parseMemory(item.content);
    if (!body) continue;
    if (isWellKnown(name)) {
      wellKnown.push({ name, heading: headingFor(name), body });
    } else if (alwaysInclude) {
      optIn.push({ name, heading: headingFor(name), body });
    }
    // Every canonical name is claimed, included or not, so a settings-dir
    // file can never override an app-data memory of the same name.
    seen.add(name.toLowerCase());
  }

  // 2. Merge memories from the Settings Directory under the same rules
  //    (SOUL/USER always, others via alwaysInclude). SOUL/USER are probed
  //    directly as well so they survive even when the listing fails.
  if (opts.settingsDir) {
    const dir = `${opts.settingsDir}/memories`;
    const names = new Set([...(await safeListExternal(dir)), "SOUL", "USER"]);
    for (const name of names) {
      if (seen.has(name.toLowerCase())) continue;
      const content = await safeReadExternal(`${dir}/${name}.md`);
      if (!content) continue;
      const { alwaysInclude, body } = parseMemory(content);
      if (!body) continue;
      if (isWellKnown(name)) {
        wellKnown.push({ name, heading: headingFor(name), body });
      } else if (alwaysInclude) {
        optIn.push({ name, heading: headingFor(name), body });
      }
      seen.add(name.toLowerCase());
    }
  }

  // 3. Order: SOUL first, USER next, then other well-known, then opt-in by name.
  wellKnown.sort((a, b) => rank(a.name) - rank(b.name));
  optIn.sort((a, b) => a.name.localeCompare(b.name));

  // 4. Bound total size, prioritising well-known entries.
  const result: ResolvedMemory[] = [];
  let used = 0;
  for (const mem of [...wellKnown, ...optIn]) {
    if (used + mem.body.length > maxChars && result.length > 0) break;
    result.push(mem);
    used += mem.body.length;
  }
  return result;
}

function rank(name: string): number {
  const n = name.toLowerCase();
  if (n === "soul") return 0;
  if (n === "user") return 1;
  return 2;
}

async function safeList(): Promise<string[]> {
  try {
    return await listToolboxItems("memories");
  } catch {
    return [];
  }
}

async function safeListExternal(dir: string): Promise<string[]> {
  try {
    return await listFiles(dir, "md");
  } catch {
    return [];
  }
}

async function safeReadExternal(path: string): Promise<string | null> {
  try {
    const content = await readFile(path);
    return content.trim() || null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/not found|no such file|os error 2/i.test(message)) {
      console.warn(`[memory] Failed to read memory ${path}:`, error);
    }
    return null;
  }
}
