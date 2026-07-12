import { describe, it, expect, vi } from "vitest";

vi.mock("@/stores/agent-store", () => ({
  useAgentStore: {
    getState: () => ({ agents: [{ name: "Researcher" }, { name: "default" }] }),
  },
}));

import {
  validateToolboxContent,
  isWellKnownMemory,
  renderToolboxFormatReference,
  TOOLBOX_FORMAT_REFERENCE,
  TOOLBOX_CATEGORIES,
  type ValidationContext,
} from "./toolbox-schemas";

const ctx: ValidationContext = {
  validToolNames: ["read_file", "web_search"],
  agentNames: ["Researcher"],
};

describe("validateToolboxContent — agents", () => {
  it("accepts a full valid agent", () => {
    const content = `---
name: bot
description: helper
model: claude-sonnet-4-20250514
temperature: 0.7
tools: [read_file, web_search]
---
You are a helper.`;
    expect(validateToolboxContent("agents", content, ctx)).toEqual({ ok: true });
  });

  it("accepts an agent without frontmatter (all defaults)", () => {
    expect(validateToolboxContent("agents", "Just a system prompt.", ctx).ok).toBe(true);
  });

  it("rejects an unknown tool with the valid names listed", () => {
    const content = "---\ntools: [teleport]\n---\nprompt";
    const result = validateToolboxContent("agents", content, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Unknown tool "teleport"');
    expect(result.error).toContain("read_file, web_search");
  });

  it("rejects temperature out of range and non-numeric", () => {
    expect(validateToolboxContent("agents", "---\ntemperature: 3\n---\np", ctx).ok).toBe(false);
    const result = validateToolboxContent("agents", "---\ntemperature: warm\n---\np", ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("temperature");
  });

  it("rejects an empty body (system prompt required)", () => {
    const result = validateToolboxContent("agents", "---\nname: bot\n---\n", ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/body.*system prompt/i);
  });
});

describe("validateToolboxContent — skills", () => {
  it("requires a non-empty trigger", () => {
    const result = validateToolboxContent("skills", "---\nname: s\n---\nbody", ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("trigger");
  });

  it("requires a non-empty body", () => {
    const result = validateToolboxContent("skills", '---\ntrigger: "git"\n---\n', ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/body/i);
  });

  it("accepts a valid skill", () => {
    expect(
      validateToolboxContent("skills", '---\ntrigger: "git|commit"\n---\nUse git well.', ctx).ok
    ).toBe(true);
  });
});

describe("validateToolboxContent — prompts", () => {
  it("requires a non-empty template", () => {
    const result = validateToolboxContent("prompts", "name: x\ndescription: y", ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("template");
  });

  it("rejects non-object YAML", () => {
    expect(validateToolboxContent("prompts", "- just\n- a list", ctx).ok).toBe(false);
  });

  it("accepts a valid prompt", () => {
    expect(
      validateToolboxContent("prompts", "template: |\n  Summarize {{input}}", ctx).ok
    ).toBe(true);
  });
});

describe("validateToolboxContent — workflows", () => {
  it("requires a non-empty steps array", () => {
    expect(validateToolboxContent("workflows", "name: w", ctx).ok).toBe(false);
    expect(validateToolboxContent("workflows", "steps: []", ctx).ok).toBe(false);
  });

  it("requires each step to have a prompt", () => {
    const result = validateToolboxContent("workflows", "steps:\n  - agent: Researcher", ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("prompt");
  });

  it("rejects an unknown agent reference with existing agents listed", () => {
    const content = "steps:\n  - agent: Ghost\n    prompt: do it";
    const result = validateToolboxContent("workflows", content, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('step 1 references unknown agent "Ghost"');
    expect(result.error).toContain("Researcher");
  });

  it("accepts a valid workflow with trigger and known agent", () => {
    const content = `trigger:
  schedule: "0 8 * * *"
steps:
  - agent: Researcher
    prompt: Find news
  - prompt: "Summarize: {{previous}}"`;
    expect(validateToolboxContent("workflows", content, ctx)).toEqual({ ok: true });
  });

  it("rejects an empty trigger schedule", () => {
    const content = 'trigger:\n  schedule: ""\nsteps:\n  - prompt: go';
    const result = validateToolboxContent("workflows", content, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("schedule");
  });

  it("uses the agent store for agent names by default", () => {
    const content = "steps:\n  - agent: Researcher\n    prompt: go";
    expect(validateToolboxContent("workflows", content).ok).toBe(true);
    const bad = validateToolboxContent("workflows", "steps:\n  - agent: Ghost\n    prompt: go");
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain("default");
  });
});

describe("validateToolboxContent — memories", () => {
  it("accepts free-form markdown", () => {
    expect(validateToolboxContent("memories", "# Anything", ctx).ok).toBe(true);
  });

  it("accepts valid frontmatter", () => {
    expect(
      validateToolboxContent("memories", "---\nalwaysInclude: true\n---\n- fact", ctx).ok
    ).toBe(true);
  });

  it("rejects a non-boolean alwaysInclude", () => {
    const result = validateToolboxContent("memories", '---\nalwaysInclude: "yes"\n---\n- fact', ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("alwaysInclude");
  });
});

describe("isWellKnownMemory", () => {
  it("matches SOUL and USER case-insensitively", () => {
    expect(isWellKnownMemory("SOUL")).toBe(true);
    expect(isWellKnownMemory("soul")).toBe(true);
    expect(isWellKnownMemory("User")).toBe(true);
    expect(isWellKnownMemory("learned")).toBe(false);
  });
});

describe("format reference", () => {
  it("covers every category", () => {
    for (const cat of TOOLBOX_CATEGORIES) {
      expect(TOOLBOX_FORMAT_REFERENCE[cat].length).toBeGreaterThan(0);
    }
  });

  it("renders one block with per-category headings", () => {
    const out = renderToolboxFormatReference();
    for (const cat of TOOLBOX_CATEGORIES) {
      expect(out).toContain(`### ${cat}`);
    }
    expect(out).toContain("trigger:");
    expect(out).toContain("{{previous}}");
  });
});
