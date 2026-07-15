import { describe, it, expect, vi } from "vitest";

vi.mock("@/stores/agent-store", () => ({
  useAgentStore: {
    getState: () => ({ agents: [{ name: "default" }] }),
  },
}));

import { validateToolboxContent, TOOLBOX_CATEGORIES } from "./toolbox-schemas";
import {
  DEFAULT_TOOLBOX_ITEMS,
  TOOLBOX_DEFAULTS_VERSION,
} from "./toolbox-defaults";
import { ALL_TOOLS } from "@/lib/tools/categories";

// Agents available once the defaults are seeded: the seeded ones plus the
// "default" agent that initAppDataDir creates on both platforms.
const seededAgentNames = DEFAULT_TOOLBOX_ITEMS.filter(
  (i) => i.category === "agents"
).map((i) => i.name);
const ctx = {
  validToolNames: ALL_TOOLS.map((t) => t.name),
  agentNames: [...seededAgentNames, "default"],
};

describe("DEFAULT_TOOLBOX_ITEMS", () => {
  it("has a positive integer version", () => {
    expect(Number.isInteger(TOOLBOX_DEFAULTS_VERSION)).toBe(true);
    expect(TOOLBOX_DEFAULTS_VERSION).toBeGreaterThan(0);
  });

  it("covers every toolbox category", () => {
    const covered = new Set(DEFAULT_TOOLBOX_ITEMS.map((i) => i.category));
    for (const category of TOOLBOX_CATEGORIES) {
      expect(covered.has(category)).toBe(true);
    }
  });

  it("has unique names within each category", () => {
    const keys = DEFAULT_TOOLBOX_ITEMS.map((i) => `${i.category}/${i.name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses slash-command-safe names (prompts expand as /<name>)", () => {
    for (const item of DEFAULT_TOOLBOX_ITEMS) {
      expect(item.name).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it.each(DEFAULT_TOOLBOX_ITEMS.map((i) => [`${i.category}/${i.name}`, i]))(
    "%s validates against its category schema",
    (_key, item) => {
      const result = validateToolboxContent(item.category, item.content, ctx);
      expect(result).toEqual({ ok: true });
    }
  );

  it("does not seed a 'default' agent (initAppDataDir owns it)", () => {
    expect(seededAgentNames).not.toContain("default");
  });

  it("workflows reference only seeded or built-in agents", () => {
    // Covered by schema validation via ctx, but assert directly so a rename of
    // a seeded agent fails loudly here too.
    const workflows = DEFAULT_TOOLBOX_ITEMS.filter((i) => i.category === "workflows");
    for (const wf of workflows) {
      const referenced = [...wf.content.matchAll(/^\s*-\s*agent:\s*(\S+)/gm)].map(
        (m) => m[1]
      );
      for (const name of referenced) {
        expect(ctx.agentNames).toContain(name);
      }
    }
  });

  it("workflows have no cron trigger by default (no surprise auto-runs)", () => {
    const workflows = DEFAULT_TOOLBOX_ITEMS.filter((i) => i.category === "workflows");
    for (const wf of workflows) {
      expect(wf.content).not.toMatch(/^trigger:/m);
    }
  });
});
