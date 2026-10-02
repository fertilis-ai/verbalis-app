import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveMemories, mockResolveSkills, mockRenderSkills, mockBuildInventory } = vi.hoisted(() => ({
  mockResolveMemories: vi.fn(),
  mockResolveSkills: vi.fn(),
  mockRenderSkills: vi.fn(),
  mockBuildInventory: vi.fn(),
}));

vi.mock("@/lib/memory/resolve-memories", () => ({ resolveMemories: mockResolveMemories }));
vi.mock("@/lib/skills/resolve-skills", () => ({
  resolveSkills: mockResolveSkills,
  renderSkillsForPrompt: mockRenderSkills,
}));
vi.mock("@/lib/toolbox/toolbox-inventory", () => ({ buildToolboxInventory: mockBuildInventory }));
vi.mock("@/lib/toolbox/toolbox-schemas", () => ({ renderToolboxFormatReference: () => "<FORMAT REFERENCE>" }));

import {
  buildSystemPrompt,
  DEFAULT_SYSTEM_PROMPT,
  loadToolboxPromptSections,
  type ToolboxPromptSections,
} from "./build-system-prompt";

const noSections: ToolboxPromptSections = { memories: [], skills: "", toolboxInventory: "" };

const build = (overrides: Partial<Parameters<typeof buildSystemPrompt>[0]> = {}) =>
  buildSystemPrompt({
    sections: noSections,
    contextFiles: [],
    allowSelfEnhancement: false,
    imageGeneration: false,
    ...overrides,
  });

const MEMORY_SECTION =
  "\n\n## Memory\nUse the `remember` tool to persist durable facts about the user or task so they are available in future sessions. Don't remember trivial or ephemeral details.";

describe("buildSystemPrompt", () => {
  it("is the default prompt plus memory guidance with nothing configured", () => {
    expect(build()).toBe(DEFAULT_SYSTEM_PROMPT + MEMORY_SECTION);
  });

  it("starts from the agent's prompt and describes the agent", () => {
    const prompt = build({ agent: { name: "writer", model: "m1", temperature: 0.2, systemPrompt: "You write." } });
    expect(prompt.startsWith("You write.\n\n## Current Agent\nName: writer\nModel: m1\nTemperature: 0.2")).toBe(true);
  });

  it("omits the model line for an agent without a model override", () => {
    const prompt = build({ agent: { name: "a", temperature: 1, systemPrompt: "p" } });
    expect(prompt).toContain("## Current Agent\nName: a\nTemperature: 1\n");
  });

  it("orders the sections: memories, skills, inventory, agent, files, working dir, memory, self-enhancement, images", () => {
    const prompt = build({
      agent: { name: "a", temperature: 1, systemPrompt: "BASE" },
      sections: {
        memories: [
          { heading: "SOUL", body: "soul body" },
          { heading: "USER", body: "user body" },
        ],
        skills: "\n\n<SKILLS>",
        toolboxInventory: "\n\n<INVENTORY>",
      },
      contextFiles: [{ name: "a.md", content: "A" }],
      workingDirectory: "/work",
      allowSelfEnhancement: true,
      imageGeneration: true,
    });
    const order = [
      "BASE",
      "## SOUL\nsoul body",
      "## USER\nuser body",
      "<SKILLS>",
      "<INVENTORY>",
      "## Current Agent",
      "## File Context",
      "## Working Directory",
      "## Memory\n",
      "## Self-Enhancement",
      "<FORMAT REFERENCE>",
      "## Image Generation",
    ].map((marker) => prompt.indexOf(marker));
    expect(order.every((pos) => pos >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("renders attached files as fenced blocks", () => {
    const prompt = build({
      contextFiles: [
        { name: "a.md", content: "A" },
        { name: "b.ts", content: "B" },
      ],
    });
    expect(prompt).toContain(
      "## File Context\nThe user has attached the following files for reference:\n\n### a.md\n```\nA\n```\n\n### b.ts\n```\nB\n```"
    );
  });

  it("names the working directory", () => {
    expect(build({ workingDirectory: "/Users/me/work" })).toContain(
      "## Working Directory\nThe user's current working directory is: /Users/me/work\n"
    );
  });

  it("adds the self-enhancement and image sections only when enabled", () => {
    const off = build();
    expect(off).not.toContain("## Self-Enhancement");
    expect(off).not.toContain("## Image Generation");
    const on = build({ allowSelfEnhancement: true, imageGeneration: true });
    expect(on).toContain("## Self-Enhancement");
    expect(on).toContain("<FORMAT REFERENCE>");
    expect(on).toContain("## Image Generation");
  });
});

describe("loadToolboxPromptSections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveMemories.mockResolvedValue([{ heading: "SOUL", body: "b" }]);
    mockResolveSkills.mockResolvedValue({ index: [] });
    mockRenderSkills.mockReturnValue("\n\n<SKILLS>");
    mockBuildInventory.mockResolvedValue("\n\n<INVENTORY>");
  });

  it("loads memories, skills for the message, and the inventory", async () => {
    const sections = await loadToolboxPromptSections({ settingsDir: "/settings", userMessage: "hello" });
    expect(sections).toEqual({
      memories: [{ heading: "SOUL", body: "b" }],
      skills: "\n\n<SKILLS>",
      toolboxInventory: "\n\n<INVENTORY>",
    });
    expect(mockResolveMemories).toHaveBeenCalledWith({ settingsDir: "/settings" });
    expect(mockResolveSkills).toHaveBeenCalledWith("hello");
  });

  it("falls back to empty skills and inventory when they fail", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockResolveSkills.mockRejectedValue(new Error("skills"));
    mockBuildInventory.mockRejectedValue(new Error("inventory"));
    const sections = await loadToolboxPromptSections({ settingsDir: "/s", userMessage: "x" });
    expect(sections.skills).toBe("");
    expect(sections.toolboxInventory).toBe("");
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("propagates a memory failure", async () => {
    mockResolveMemories.mockRejectedValue(new Error("disk"));
    await expect(loadToolboxPromptSections({ settingsDir: "/s", userMessage: "x" })).rejects.toThrow("disk");
  });
});
