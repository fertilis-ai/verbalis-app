/**
 * Canonical Toolbox content schemas — the single source of truth for what a
 * file in each category must look like. Three consumers share it:
 *
 *  - the agent-facing tools (toolbox-tools.ts) validate strictly: invalid
 *    content is rejected before it lands on disk;
 *  - the Toolbox editor UI validates on save but only warns, so a human is
 *    never locked out of their own files;
 *  - TOOLBOX_FORMAT_REFERENCE renders the formats into the system prompt so
 *    the model can author valid content on the first attempt.
 *
 * Validation always applies to the *resulting* content of a write or edit —
 * a pre-existing invalid file doesn't block a write that fixes it.
 */

import matter from "gray-matter";
import YAML from "yaml";
import { z } from "zod";
import { ALL_TOOLS } from "@/lib/tools/categories";
import { useAgentStore } from "@/stores/agent-store";

export const TOOLBOX_CATEGORIES = [
  "prompts",
  "memories",
  "agents",
  "skills",
  "workflows",
] as const;
export type ToolboxToolCategory = (typeof TOOLBOX_CATEGORIES)[number];

/** SOUL and USER are the agent's identity/user-model memories: always
 * injected into prompts and protected from deletion. */
export function isWellKnownMemory(name: string): boolean {
  const n = name.toLowerCase();
  return n === "soul" || n === "user";
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/** Overridable lookups for cross-reference checks (tests inject their own). */
export interface ValidationContext {
  /** Tool names an agent's `tools:` allowlist may reference. */
  validToolNames?: readonly string[];
  /** Agent names a workflow step's `agent:` may reference. */
  agentNames?: readonly string[];
}

function defaultContext(): Required<ValidationContext> {
  return {
    validToolNames: ALL_TOOLS.map((t) => t.name),
    agentNames: (useAgentStore.getState().agents ?? []).map((a) => a.name),
  };
}

// ---------------------------------------------------------------------------
// Per-category schemas
// ---------------------------------------------------------------------------

const AgentFrontmatter = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  tools: z.array(z.string()).optional(),
});

const SkillFrontmatter = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  trigger: z.string().trim().min(1, "must be a non-empty keyword|pattern string"),
});

const MemoryFrontmatter = z.object({
  description: z.string().optional(),
  alwaysInclude: z.boolean().optional(),
});

const PromptSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  template: z.string().trim().min(1, "must be a non-empty string"),
});

const WorkflowStep = z.object({
  prompt: z.string().trim().min(1, "must be a non-empty string"),
  agent: z.string().optional(),
});

const WorkflowSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  trigger: z
    .object({ schedule: z.string().trim().min(1, "must be a cron expression") })
    .optional(),
  steps: z.array(WorkflowStep).min(1, "must contain at least one step"),
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate content for its category. Errors name the offending field and,
 * where the fix is a known set (tool/agent names), list the valid values.
 */
export function validateToolboxContent(
  category: ToolboxToolCategory,
  content: string,
  ctx?: ValidationContext
): ValidationResult {
  const { validToolNames, agentNames } = { ...defaultContext(), ...ctx };

  switch (category) {
    case "memories": {
      const parsed = parseFrontmatter(content);
      if (!parsed.ok) return { ok: false, error: `Invalid memory frontmatter: ${parsed.error}` };
      return zodCheck(MemoryFrontmatter, parsed.data, "Memory frontmatter");
    }

    case "agents": {
      const parsed = parseFrontmatter(content);
      if (!parsed.ok) return { ok: false, error: `Invalid agent frontmatter: ${parsed.error}` };
      const shape = zodCheck(AgentFrontmatter, parsed.data, "Agent frontmatter");
      if (!shape.ok) return shape;
      if (!parsed.body.trim()) {
        return {
          ok: false,
          error: "Agent body must be a non-empty system prompt (the markdown after the frontmatter).",
        };
      }
      const tools = (parsed.data as { tools?: unknown }).tools;
      if (Array.isArray(tools)) {
        for (const tool of tools) {
          if (typeof tool === "string" && !validToolNames.includes(tool)) {
            return {
              ok: false,
              error: `Unknown tool "${tool}" in agent "tools" list. Valid tools: ${validToolNames.join(", ")}`,
            };
          }
        }
      }
      return { ok: true };
    }

    case "skills": {
      const parsed = parseFrontmatter(content);
      if (!parsed.ok) return { ok: false, error: `Invalid skill frontmatter: ${parsed.error}` };
      const shape = zodCheck(SkillFrontmatter, parsed.data, "Skill frontmatter");
      if (!shape.ok) return shape;
      if (!parsed.body.trim()) {
        return {
          ok: false,
          error: "Skill body must be non-empty (the instructions injected when the trigger matches).",
        };
      }
      return { ok: true };
    }

    case "prompts": {
      const parsed = parseYaml(content);
      if (!parsed.ok) return { ok: false, error: `Invalid prompt YAML: ${parsed.error}` };
      return zodCheck(PromptSchema, parsed.data, "Prompt");
    }

    case "workflows": {
      const parsed = parseYaml(content);
      if (!parsed.ok) return { ok: false, error: `Invalid workflow YAML: ${parsed.error}` };
      const shape = zodCheck(WorkflowSchema, parsed.data, "Workflow");
      if (!shape.ok) return shape;
      const steps = (parsed.data as { steps: { agent?: unknown }[] }).steps;
      for (const [i, step] of steps.entries()) {
        if (typeof step.agent === "string" && !agentNames.includes(step.agent)) {
          return {
            ok: false,
            error: `Workflow step ${i + 1} references unknown agent "${step.agent}". Existing agents: ${
              agentNames.length ? agentNames.join(", ") : "(none)"
            }`,
          };
        }
      }
      return { ok: true };
    }

    default:
      return { ok: false, error: `Unknown category: ${String(category)}` };
  }
}

type ParsedDoc =
  | { ok: true; data: Record<string, unknown>; body: string }
  | { ok: false; error: string };

function parseFrontmatter(content: string): ParsedDoc {
  try {
    const { data, content: body } = matter(content);
    if (data !== null && typeof data !== "object") {
      return { ok: false, error: "frontmatter must be a YAML object" };
    }
    return { ok: true, data: (data ?? {}) as Record<string, unknown>, body };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

function parseYaml(content: string): ParsedDoc {
  try {
    const data = YAML.parse(content) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { ok: false, error: "must be a YAML object" };
    }
    return { ok: true, data: data as Record<string, unknown>, body: "" };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

function zodCheck(schema: z.ZodType, data: unknown, label: string): ValidationResult {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true };
  const issue = result.error.issues[0];
  const path = issue?.path?.length ? `"${issue.path.join(".")}"` : "";
  return { ok: false, error: `${label} ${path ? `field ${path} ` : ""}invalid: ${issue?.message ?? "unknown error"}` };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ---------------------------------------------------------------------------
// Authoring reference (rendered into the system prompt when writes are on)
// ---------------------------------------------------------------------------

export const TOOLBOX_FORMAT_REFERENCE: Record<ToolboxToolCategory, string> = {
  agents: `Markdown with YAML frontmatter; the body is the agent's system prompt (required).
---
name: researcher                  # optional (defaults to filename)
description: Web research agent   # optional
model: claude-sonnet-4-20250514   # optional
temperature: 0.7                  # optional, 0-2
tools: [web_search, read_file]    # optional allowlist of existing tool names; omit = all tools
---
You are a research assistant...`,

  skills: `Markdown with YAML frontmatter; the body (required) is injected when the trigger matches the user's message.
---
name: git-helper        # optional
description: Git tips   # optional, shown in the skills index
trigger: "git|commit"   # required: pipe-separated keywords/regexes
---
When helping with git...`,

  prompts: `A YAML document. Invoked as /<name> in chat; {{input}} is replaced by the text after the command.
name: summarize          # optional
description: Summarize   # optional
template: |              # required
  Summarize the following:
  {{input}}`,

  workflows: `A YAML document. Steps run in order in one background conversation.
name: morning-brief      # optional
description: Daily news  # optional
trigger:                 # optional: cron schedule makes it run automatically
  schedule: "0 8 * * *"
steps:                   # required: each step needs a prompt
  - agent: Researcher    # optional: must be an existing agent name
    prompt: Find today's AI news
  - prompt: "Summarize for a busy reader: {{previous}}"
# {{previous}} = prior step's output, {{input}} = workflow input`,

  memories: `Markdown, optionally with YAML frontmatter.
---
alwaysInclude: true      # optional: inject into every conversation (SOUL and USER always are)
---
- a durable fact worth keeping`,
};

/** Render all category formats as one prompt-ready block. */
export function renderToolboxFormatReference(): string {
  return TOOLBOX_CATEGORIES.map(
    (cat) => `### ${cat}\n${TOOLBOX_FORMAT_REFERENCE[cat]}`
  ).join("\n\n");
}
