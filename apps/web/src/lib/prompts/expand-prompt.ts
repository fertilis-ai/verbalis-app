/**
 * Prompt expansion — saved prompts live in the Toolbox "prompts" category as
 * YAML with `name` / `description` / `template` (the template may contain
 * `{{input}}`). Typing `/<prompt-name> some text` in the chat input expands the
 * template, substituting `{{input}}` with "some text", before the message is
 * sent. Expansion happens entirely client-side — no agent-loop change.
 */

import YAML from "yaml";
import { loadToolboxItem, listToolboxItems } from "@/lib/storage";

export interface SlashCommand {
  name: string;
  rest: string;
}

/** Parse a leading `/<name> <rest>` command, or null if the input isn't one. */
export function parseSlashCommand(input: string): SlashCommand | null {
  const match = input.match(/^\/([A-Za-z0-9_-]+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  return { name: match[1], rest: (match[2] ?? "").trim() };
}

/** Substitute every `{{input}}` placeholder with the provided text. */
export function expandTemplate(template: string, input: string): string {
  return template.split("{{input}}").join(input);
}

/**
 * Expand a chat input if it's a `/<prompt-name>` command for a known prompt.
 * Returns the original input unchanged when it isn't a command, names an
 * unknown prompt, or the prompt is malformed — so nothing is ever lost.
 */
export async function expandPromptInput(input: string): Promise<string> {
  const parsed = parseSlashCommand(input.trim());
  if (!parsed) return input;

  let item: Awaited<ReturnType<typeof loadToolboxItem>>;
  try {
    item = await loadToolboxItem("prompts", parsed.name);
  } catch {
    return input;
  }
  if (!item) return input;

  try {
    const data = YAML.parse(item.content) as unknown;
    const template = (data as Record<string, unknown> | null)?.template;
    if (typeof template !== "string") return input;
    return expandTemplate(template, parsed.rest);
  } catch {
    return input;
  }
}

/** List available prompt names (for autocomplete / discovery). */
export async function listPromptNames(): Promise<string[]> {
  try {
    return await listToolboxItems("prompts");
  } catch {
    return [];
  }
}
