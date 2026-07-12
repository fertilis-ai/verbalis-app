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

import {
  saveToolboxItem,
  loadToolboxItem,
  listToolboxItems,
  deleteToolboxItem,
  type ToolboxItemData,
} from "@/lib/storage";
import { useToolboxStore } from "@/stores/toolbox-store";
import { useAgentStore } from "@/stores/agent-store";
import {
  TOOLBOX_CATEGORIES,
  validateToolboxContent,
  type ToolboxToolCategory,
} from "@/lib/toolbox/toolbox-schemas";

export {
  TOOLBOX_CATEGORIES,
  validateToolboxContent,
  type ToolboxToolCategory,
  type ValidationResult,
} from "@/lib/toolbox/toolbox-schemas";

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
