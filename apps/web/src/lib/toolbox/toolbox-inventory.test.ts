import { describe, it, expect, beforeEach, vi } from "vitest";

const mockList = vi.fn();
const mockLoad = vi.fn();

vi.mock("@/lib/storage", () => ({
  listToolboxItems: (...a: unknown[]) => mockList(...a),
  loadToolboxItem: (...a: unknown[]) => mockLoad(...a),
}));

import { buildToolboxInventory, DEFAULT_MAX_INVENTORY_CHARS } from "./toolbox-inventory";

type Store = Partial<Record<string, Record<string, string>>>;

function setToolbox(store: Store) {
  mockList.mockImplementation((cat: string) => Promise.resolve(Object.keys(store[cat] ?? {})));
  mockLoad.mockImplementation((cat: string, name: string) => {
    const content = store[cat]?.[name];
    return Promise.resolve(
      content === undefined ? null : { name, category: cat, content, updatedAt: "" }
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setToolbox({});
});

describe("buildToolboxInventory", () => {
  it("returns empty string for an empty toolbox", async () => {
    expect(await buildToolboxInventory()).toBe("");
  });

  it("describes agents via description, falling back to model", async () => {
    setToolbox({
      agents: {
        researcher: "---\ndescription: Web research agent\n---\nprompt",
        coder: "---\nmodel: claude-sonnet-4-20250514\n---\nprompt",
      },
    });
    const out = await buildToolboxInventory();
    expect(out).toContain("## Toolbox");
    expect(out).toContain("researcher (Web research agent)");
    expect(out).toContain("coder (model: claude-sonnet-4-20250514)");
  });

  it("shows prompts as slash commands with description or template first line", async () => {
    setToolbox({
      prompts: {
        summarize: "description: Summarize text\ntemplate: 'Summarize: {{input}}'",
        translate: "template: |\n  Translate to French:\n  {{input}}",
      },
    });
    const out = await buildToolboxInventory();
    expect(out).toContain("/summarize (Summarize text)");
    expect(out).toContain("/translate (Translate to French:)");
  });

  it("describes workflows with step count and cron", async () => {
    setToolbox({
      workflows: {
        brief: 'trigger:\n  schedule: "0 8 * * *"\nsteps:\n  - prompt: a\n  - prompt: b',
        oneshot: "steps:\n  - prompt: only",
      },
    });
    const out = await buildToolboxInventory();
    expect(out).toContain("brief (2 steps, 0 8 * * *)");
    expect(out).toContain("oneshot (1 step)");
  });

  it("lists skills and memories as names only", async () => {
    setToolbox({
      skills: { "git-helper": '---\ntrigger: "git"\n---\nbody' },
      memories: { SOUL: "I am.", learned: "- a fact" },
    });
    const out = await buildToolboxInventory();
    expect(out).toContain("- skills: git-helper");
    expect(out).toContain("- memories: SOUL, learned");
    expect(out).not.toContain("I am.");
    expect(out).not.toContain("trigger");
  });

  it("degrades to the bare name on malformed content", async () => {
    setToolbox({
      workflows: { broken: "::: not yaml :::\n  - [" },
      agents: { plain: "no frontmatter here" },
    });
    const out = await buildToolboxInventory();
    expect(out).toContain("- workflows: broken");
    expect(out).toContain("- agents: plain");
  });

  it("caps category lines and reports the overflow explicitly", async () => {
    const agents: Record<string, string> = {};
    for (let i = 0; i < 50; i++) {
      agents[`agent-${i}`] = `---\ndescription: ${"x".repeat(50)}\n---\nprompt`;
    }
    setToolbox({ agents });
    const out = await buildToolboxInventory({ maxChars: 500 });
    expect(out).toContain("more)");
    const agentLine = out.split("\n").find((l) => l.startsWith("- agents:"));
    expect(agentLine).toBeDefined();
    expect(agentLine?.length ?? 0).toBeLessThan(500);
  });

  it("stays within the default cap with a busy toolbox", async () => {
    const store: Store = {};
    for (const cat of ["agents", "prompts", "workflows", "skills", "memories"]) {
      const items: Record<string, string> = {};
      for (let i = 0; i < 30; i++) items[`${cat}-item-${i}`] = "steps:\n  - prompt: x";
      store[cat] = items;
    }
    setToolbox(store);
    const out = await buildToolboxInventory();
    // Header + 5 capped lines; generous margin over the nominal cap.
    expect(out.length).toBeLessThan(DEFAULT_MAX_INVENTORY_CHARS + 200);
  });

  it("never throws when the store errors", async () => {
    mockList.mockRejectedValue(new Error("disk gone"));
    expect(await buildToolboxInventory()).toBe("");
  });
});
