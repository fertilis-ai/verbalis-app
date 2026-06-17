import { describe, it, expect, beforeEach, vi } from "vitest";

const mockList = vi.fn();
const mockLoad = vi.fn();

vi.mock("@/lib/storage", () => ({
  listToolboxItems: (...a: unknown[]) => mockList(...a),
  loadToolboxItem: (...a: unknown[]) => mockLoad(...a),
}));

import {
  loadSkills,
  skillMatches,
  resolveSkills,
  renderSkillsForPrompt,
} from "./resolve-skills";

function skillFile(name: string, trigger: string, body: string, description?: string) {
  const fm = [`name: ${name}`, `trigger: "${trigger}"`];
  if (description) fm.push(`description: ${description}`);
  return {
    name,
    category: "skills",
    content: `---\n${fm.join("\n")}\n---\n${body}`,
    updatedAt: "",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue([]);
  mockLoad.mockResolvedValue(null);
});

describe("skillMatches", () => {
  it("matches keyword alternatives case-insensitively", () => {
    expect(skillMatches("weather|forecast", "What's the WEATHER today?")).toBe(true);
    expect(skillMatches("weather|forecast", "show me the forecast")).toBe(true);
    expect(skillMatches("weather|forecast", "tell me a joke")).toBe(false);
  });

  it("matches regex patterns", () => {
    expect(skillMatches("\\bbug\\b", "there is a bug here")).toBe(true);
    expect(skillMatches("\\bbug\\b", "debugger")).toBe(false);
  });

  it("returns false for empty inputs", () => {
    expect(skillMatches("", "hello")).toBe(false);
    expect(skillMatches("x", "")).toBe(false);
  });
});

describe("loadSkills", () => {
  it("parses frontmatter and body", async () => {
    mockList.mockResolvedValue(["s1"]);
    mockLoad.mockResolvedValue(skillFile("Email", "email|compose", "Write emails well.", "Email helper"));
    const skills = await loadSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: "Email",
      description: "Email helper",
      trigger: "email|compose",
      body: "Write emails well.",
    });
  });

  it("returns [] when listing fails", async () => {
    mockList.mockRejectedValue(new Error("nope"));
    expect(await loadSkills()).toEqual([]);
  });
});

describe("resolveSkills", () => {
  it("returns all skills and only triggered bodies", async () => {
    mockList.mockResolvedValue(["a", "b"]);
    mockLoad.mockImplementation((_c: string, name: string) =>
      Promise.resolve(
        name === "a"
          ? skillFile("A", "weather", "weather body")
          : skillFile("B", "email", "email body")
      )
    );
    const resolved = await resolveSkills("what is the weather");
    expect(resolved.all).toHaveLength(2);
    expect(resolved.matched.map((s) => s.name)).toEqual(["A"]);
  });

  it("bounds matched body size", async () => {
    const big = "x".repeat(20_000);
    mockList.mockResolvedValue(["a", "b"]);
    mockLoad.mockImplementation((_c: string, name: string) =>
      Promise.resolve(skillFile(name, "go", big))
    );
    const resolved = await resolveSkills("go", { maxChars: 1000 });
    expect(resolved.matched.length).toBe(1);
  });
});

describe("renderSkillsForPrompt", () => {
  it("renders an index and matched bodies", () => {
    const out = renderSkillsForPrompt({
      all: [
        { name: "A", description: "does a", trigger: "a", body: "abody" },
        { name: "B", trigger: "b", body: "bbody" },
      ],
      matched: [{ name: "A", description: "does a", trigger: "a", body: "abody" }],
    });
    expect(out).toContain("## Available Skills");
    expect(out).toContain("- A — does a (trigger: a)");
    expect(out).toContain("- B (trigger: b)");
    expect(out).toContain("## Skill: A\nabody");
    expect(out).not.toContain("## Skill: B");
  });

  it("returns empty string when no skills", () => {
    expect(renderSkillsForPrompt({ all: [], matched: [] })).toBe("");
  });
});
