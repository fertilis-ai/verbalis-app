/**
 * Skills — `.md` files in the Toolbox "skills" category with frontmatter
 * `trigger: "keyword|pattern"`. Two things get injected into the system prompt:
 *
 *  1. A short *index* of every available skill (name + description + trigger),
 *     so the model knows what it can lean on.
 *  2. The *full body* of any skill whose trigger matches the current user
 *     message, so the relevant instructions are available this turn.
 *
 * Injected body size is bounded against the context budget.
 */

import matter from "gray-matter";
import { listToolboxItems, loadToolboxItem } from "@/lib/storage";

export interface SkillMeta {
  name: string;
  description?: string;
  trigger: string;
  body: string;
}

/** Default cap on injected matched-skill bodies (~4k tokens at chars/4). */
export const DEFAULT_MAX_SKILL_CHARS = 16_000;

/** Load and parse all skills from the canonical store. */
export async function loadSkills(): Promise<SkillMeta[]> {
  let names: string[];
  try {
    names = await listToolboxItems("skills");
  } catch {
    return [];
  }
  const skills: SkillMeta[] = [];
  for (const name of names) {
    const item = await loadToolboxItem("skills", name);
    if (!item) continue;
    try {
      const { data, content } = matter(item.content);
      const trigger = typeof data?.trigger === "string" ? data.trigger : "";
      skills.push({
        name: typeof data?.name === "string" ? data.name : name,
        description: typeof data?.description === "string" ? data.description : undefined,
        trigger,
        body: content.trim(),
      });
    } catch {
      // Skip malformed skill files rather than breaking the prompt.
    }
  }
  return skills;
}

/**
 * Does a skill's trigger match the given text? The trigger is a pipe-separated
 * list of alternatives; each is tried as a case-insensitive regex, falling back
 * to a case-insensitive substring match if it isn't a valid pattern.
 */
export function skillMatches(trigger: string, text: string): boolean {
  if (!trigger.trim() || !text.trim()) return false;
  const lower = text.toLowerCase();
  const tokens = trigger.split("|").map((t) => t.trim()).filter(Boolean);
  for (const token of tokens) {
    try {
      if (new RegExp(token, "i").test(text)) return true;
    } catch {
      // not a valid regex — fall through to substring
    }
    if (lower.includes(token.toLowerCase())) return true;
  }
  return false;
}

export interface ResolvedSkills {
  /** All skills (for the index). */
  all: SkillMeta[];
  /** Skills whose trigger matched the user message (size-bounded). */
  matched: SkillMeta[];
}

export async function resolveSkills(
  userMessage: string,
  opts: { maxChars?: number } = {}
): Promise<ResolvedSkills> {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_SKILL_CHARS;
  const all = await loadSkills();
  const matched: SkillMeta[] = [];
  let used = 0;
  for (const skill of all) {
    if (!skill.body) continue;
    if (!skillMatches(skill.trigger, userMessage)) continue;
    if (used + skill.body.length > maxChars && matched.length > 0) break;
    matched.push(skill);
    used += skill.body.length;
  }
  return { all, matched };
}

/**
 * Render the skills section appended to the system prompt. Returns "" when
 * there are no skills.
 */
export function renderSkillsForPrompt(resolved: ResolvedSkills): string {
  const { all, matched } = resolved;
  if (all.length === 0) return "";

  let out = "\n\n## Available Skills\nThese skills can guide you when relevant:";
  for (const skill of all) {
    const desc = skill.description ? ` — ${skill.description}` : "";
    const trig = skill.trigger ? ` (trigger: ${skill.trigger})` : "";
    out += `\n- ${skill.name}${desc}${trig}`;
  }

  for (const skill of matched) {
    out += `\n\n## Skill: ${skill.name}\n${skill.body}`;
  }
  return out;
}
