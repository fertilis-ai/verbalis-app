/**
 * Toolbox awareness — renders a compact inventory of every Toolbox category
 * (agents, prompts, skills, workflows, memories) for the system prompt, so
 * the agent knows what exists without a `list_toolbox_items` round-trip.
 *
 * One line per category, items as `name (descriptor)` with descriptors pulled
 * from frontmatter. Deliberately shallow: memory *bodies* are injected by
 * resolve-memories and matched skill bodies by resolve-skills, so memories and
 * skills appear here as names only. Total size is capped; overflow is made
 * explicit with "+N more" rather than silently dropped. Never throws — a
 * malformed item degrades to its bare name.
 */

import matter from "gray-matter";
import YAML from "yaml";
import { listToolboxItems, loadToolboxItem } from "@/lib/storage";
import type { ToolboxToolCategory } from "@/lib/toolbox/toolbox-schemas";

/** Default cap on the rendered inventory (~375 tokens at chars/4). */
export const DEFAULT_MAX_INVENTORY_CHARS = 1_500;

const MAX_DESCRIPTOR_CHARS = 60;

/** Categories in render order. Skills/memories render as names only. */
const RENDER_ORDER: ToolboxToolCategory[] = [
  "agents",
  "prompts",
  "workflows",
  "skills",
  "memories",
];

/**
 * Build the inventory section appended to the system prompt. Returns "" when
 * the whole Toolbox is empty.
 */
export async function buildToolboxInventory(
  opts: { maxChars?: number } = {}
): Promise<string> {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_INVENTORY_CHARS;

  const lines: string[] = [];
  for (const category of RENDER_ORDER) {
    const names = await safeList(category);
    if (names.length === 0) continue;

    const entries: string[] = [];
    for (const name of names) {
      entries.push(await renderEntry(category, name));
    }
    lines.push(renderCategoryLine(category, entries, maxChars));
  }

  if (lines.length === 0) return "";

  return (
    "\n\n## Toolbox\nYour Toolbox contains the items below. Use `read_toolbox_item` for any item's full content.\n" +
    lines.join("\n")
  );
}

/** One category line, shrunk to fit the per-line share of the budget. */
function renderCategoryLine(
  category: ToolboxToolCategory,
  entries: string[],
  maxChars: number
): string {
  // Each category gets an equal share of the total budget.
  const lineBudget = Math.floor(maxChars / RENDER_ORDER.length);
  const prefix = `- ${category}: `;
  let included = entries.length;
  let line = prefix + entries.join(", ");
  while (included > 1 && line.length > lineBudget) {
    included--;
    line = `${prefix}${entries.slice(0, included).join(", ")} (+${entries.length - included} more)`;
  }
  return line;
}

async function renderEntry(category: ToolboxToolCategory, name: string): Promise<string> {
  // Names-only categories: bodies/details are injected elsewhere in the prompt.
  if (category === "memories" || category === "skills") return name;

  const item = await safeLoad(category, name);
  if (!item) return name;

  const descriptor = describe(category, item);
  if (!descriptor) return displayName(category, name);
  return `${displayName(category, name)} (${ellipsize(descriptor, MAX_DESCRIPTOR_CHARS)})`;
}

/** Single-line truncation (truncateText appends a multi-line note). */
function ellipsize(text: string, maxLength: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length <= maxLength ? oneLine : `${oneLine.slice(0, maxLength - 1)}…`;
}

/** Prompts are invoked as slash commands, so show them that way. */
function displayName(category: ToolboxToolCategory, name: string): string {
  return category === "prompts" ? `/${name}` : name;
}

function describe(category: ToolboxToolCategory, content: string): string {
  try {
    switch (category) {
      case "agents": {
        const { data } = matter(content);
        if (typeof data?.description === "string" && data.description.trim()) {
          return data.description.trim();
        }
        return typeof data?.model === "string" ? `model: ${data.model}` : "";
      }
      case "prompts": {
        const data = YAML.parse(content) as Record<string, unknown> | null;
        if (typeof data?.description === "string" && data.description.trim()) {
          return data.description.trim();
        }
        const template = typeof data?.template === "string" ? data.template : "";
        return template.trim().split("\n")[0] ?? "";
      }
      case "workflows": {
        const data = YAML.parse(content) as Record<string, unknown> | null;
        const steps = Array.isArray(data?.steps) ? data.steps.length : 0;
        const trigger = data?.trigger as Record<string, unknown> | undefined;
        const cron = typeof trigger?.schedule === "string" ? trigger.schedule : "";
        const parts = [`${steps} step${steps === 1 ? "" : "s"}`];
        if (cron) parts.push(cron);
        if (typeof data?.description === "string" && data.description.trim()) {
          parts.push(data.description.trim());
        }
        return parts.join(", ");
      }
      default:
        return "";
    }
  } catch {
    // Malformed content: fall back to the bare name.
    return "";
  }
}

async function safeList(category: ToolboxToolCategory): Promise<string[]> {
  try {
    return await listToolboxItems(category);
  } catch {
    return [];
  }
}

async function safeLoad(category: ToolboxToolCategory, name: string): Promise<string | null> {
  try {
    const item = await loadToolboxItem(category, name);
    return item?.content ?? null;
  } catch {
    return null;
  }
}
