/**
 * Self-enhancement tools — let the agent author and revise its own Toolbox
 * files (prompts, memories, agents, skills, workflows).
 *
 * These wrap the generic toolbox storage helpers rather than touching the
 * filesystem directly, so web/localStorage parity and the app-data sandbox are
 * preserved. Every write/delete is validated against the category schema
 * before it lands, routed through guardrails for confirmation (see
 * categories.ts risk levels), and triggers a live reload of the in-memory
 * stores so a self-authored item is usable in the same session.
 *
 * The tools are only offered to the model when `allowSelfEnhancement` is on
 * (see getToolsForContext); this module is the execution backend.
 */

import matter from "gray-matter";
import YAML from "yaml";
import {
  saveToolboxItem,
  loadToolboxItem,
  listToolboxItems,
  deleteToolboxItem,
  type ToolboxItemData,
} from "@/lib/storage";
import { useToolboxStore } from "@/stores/toolbox-store";
import { useAgentStore } from "@/stores/agent-store";

export const TOOLBOX_CATEGORIES = [
  "prompts",
  "memories",
  "agents",
  "skills",
  "workflows",
] as const;
export type ToolboxToolCategory = (typeof TOOLBOX_CATEGORIES)[number];

export const TOOLBOX_TOOL_NAMES = [
  "list_toolbox_items",
  "read_toolbox_item",
  "write_toolbox_item",
  "delete_toolbox_item",
] as const;

function isValidCategory(value: unknown): value is ToolboxToolCategory {
  return typeof value === "string" && (TOOLBOX_CATEGORIES as readonly string[]).includes(value);
}

/** A filename slug safe to use under the app-data dir (no path traversal). */
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

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * Validate that content is well-formed for its category so the agent can't
 * corrupt a file the runtime later parses.
 */
export function validateToolboxContent(
  category: ToolboxToolCategory,
  content: string
): ValidationResult {
  switch (category) {
    case "memories":
      // Free-form markdown; nothing to validate beyond being a string.
      return { ok: true };

    case "agents": {
      try {
        const { data } = matter(content);
        if (!data || typeof data !== "object") {
          return { ok: false, error: "Agent frontmatter must be a YAML object." };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: `Invalid agent frontmatter: ${errMsg(e)}` };
      }
    }

    case "skills": {
      try {
        const { data } = matter(content);
        if (!data || typeof data !== "object") {
          return { ok: false, error: "Skill frontmatter must be a YAML object." };
        }
        if (typeof data.trigger !== "string" || data.trigger.trim() === "") {
          return {
            ok: false,
            error: 'Skill frontmatter must include a non-empty "trigger" (keyword|pattern).',
          };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: `Invalid skill frontmatter: ${errMsg(e)}` };
      }
    }

    case "prompts": {
      try {
        const data = YAML.parse(content) as unknown;
        if (!data || typeof data !== "object") {
          return { ok: false, error: "Prompt must be a YAML object." };
        }
        const template = (data as Record<string, unknown>).template;
        if (typeof template !== "string" || template.trim() === "") {
          return { ok: false, error: 'Prompt must include a non-empty "template" string.' };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: `Invalid prompt YAML: ${errMsg(e)}` };
      }
    }

    case "workflows": {
      try {
        const data = YAML.parse(content) as unknown;
        if (!data || typeof data !== "object") {
          return { ok: false, error: "Workflow must be a YAML object." };
        }
        const steps = (data as Record<string, unknown>).steps;
        if (!Array.isArray(steps) || steps.length === 0) {
          return { ok: false, error: 'Workflow must include a non-empty "steps" array.' };
        }
        for (const [i, step] of steps.entries()) {
          if (!step || typeof step !== "object" || typeof (step as Record<string, unknown>).prompt !== "string") {
            return { ok: false, error: `Workflow step ${i} must have a "prompt" string.` };
          }
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: `Invalid workflow YAML: ${errMsg(e)}` };
      }
    }

    default:
      return { ok: false, error: `Unknown category: ${category}` };
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Refresh in-memory stores after a write/delete so changes are live. */
async function reloadStores(category: ToolboxToolCategory): Promise<void> {
  try {
    await useToolboxStore.getState().loadItemsFromDisk();
    if (category === "agents") {
      await useAgentStore.getState().loadAgentsFromDisk();
    }
  } catch (e) {
    console.warn("[toolbox-tools] live reload failed:", e);
  }
}

export interface ToolboxToolArgs {
  category?: unknown;
  name?: unknown;
  content?: unknown;
}

/**
 * Execute one of the self-enhancement tools. Returns a human/agent-readable
 * result string, or throws on validation/IO failure (the adapter converts the
 * throw into an error tool result).
 */
export async function executeToolboxTool(
  toolName: string,
  args: ToolboxToolArgs
): Promise<string> {
  switch (toolName) {
    case "list_toolbox_items": {
      if (args.category !== undefined && !isValidCategory(args.category)) {
        throw new Error(`Invalid category. Expected one of: ${TOOLBOX_CATEGORIES.join(", ")}`);
      }
      const categories: ToolboxToolCategory[] = args.category
        ? [args.category as ToolboxToolCategory]
        : [...TOOLBOX_CATEGORIES];
      const lines: string[] = [];
      for (const cat of categories) {
        const names = await listToolboxItems(cat);
        lines.push(`${cat}: ${names.length ? names.join(", ") : "(none)"}`);
      }
      return lines.join("\n");
    }

    case "read_toolbox_item": {
      if (!isValidCategory(args.category)) {
        throw new Error(`Invalid category. Expected one of: ${TOOLBOX_CATEGORIES.join(", ")}`);
      }
      if (!isSafeName(args.name)) {
        throw new Error("Invalid or unsafe item name.");
      }
      const item = await loadToolboxItem(args.category, args.name);
      if (!item) {
        throw new Error(`No ${args.category} item named "${args.name}".`);
      }
      return item.content;
    }

    case "write_toolbox_item": {
      if (!isValidCategory(args.category)) {
        throw new Error(`Invalid category. Expected one of: ${TOOLBOX_CATEGORIES.join(", ")}`);
      }
      if (!isSafeName(args.name)) {
        throw new Error("Invalid or unsafe item name.");
      }
      if (typeof args.content !== "string") {
        throw new Error("content must be a string.");
      }
      const validation = validateToolboxContent(args.category, args.content);
      if (!validation.ok) {
        throw new Error(`Validation failed: ${validation.error}`);
      }
      const item: ToolboxItemData = {
        name: args.name,
        category: args.category,
        content: args.content,
        updatedAt: new Date().toISOString(),
      };
      await saveToolboxItem(item);
      await reloadStores(args.category);
      return `Saved ${args.category} item "${args.name}".`;
    }

    case "delete_toolbox_item": {
      if (!isValidCategory(args.category)) {
        throw new Error(`Invalid category. Expected one of: ${TOOLBOX_CATEGORIES.join(", ")}`);
      }
      if (!isSafeName(args.name)) {
        throw new Error("Invalid or unsafe item name.");
      }
      const existing = await loadToolboxItem(args.category, args.name);
      if (!existing) {
        throw new Error(`No ${args.category} item named "${args.name}" to delete.`);
      }
      await deleteToolboxItem(args.category, args.name);
      await reloadStores(args.category);
      return `Deleted ${args.category} item "${args.name}".`;
    }

    default:
      throw new Error(`Unknown toolbox tool: ${toolName}`);
  }
}
