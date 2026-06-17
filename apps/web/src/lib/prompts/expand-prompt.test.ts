import { describe, it, expect, beforeEach, vi } from "vitest";

const mockLoad = vi.fn();
const mockList = vi.fn();

vi.mock("@/lib/storage", () => ({
  loadToolboxItem: (...a: unknown[]) => mockLoad(...a),
  listToolboxItems: (...a: unknown[]) => mockList(...a),
}));

import {
  parseSlashCommand,
  expandTemplate,
  expandPromptInput,
  listPromptNames,
} from "./expand-prompt";

function prompt(content: string) {
  return { name: "p", category: "prompts", content, updatedAt: "" };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoad.mockResolvedValue(null);
  mockList.mockResolvedValue([]);
});

describe("parseSlashCommand", () => {
  it("parses name and rest", () => {
    expect(parseSlashCommand("/summarize the meeting notes")).toEqual({
      name: "summarize",
      rest: "the meeting notes",
    });
  });

  it("parses a bare command", () => {
    expect(parseSlashCommand("/standup")).toEqual({ name: "standup", rest: "" });
  });

  it("returns null for non-commands", () => {
    expect(parseSlashCommand("hello world")).toBeNull();
    expect(parseSlashCommand("/")).toBeNull();
    expect(parseSlashCommand("/has spaces in name extra")).toEqual({ name: "has", rest: "spaces in name extra" });
  });
});

describe("expandTemplate", () => {
  it("substitutes all {{input}} occurrences", () => {
    expect(expandTemplate("A {{input}} B {{input}}", "X")).toBe("A X B X");
  });

  it("leaves templates without placeholder intact", () => {
    expect(expandTemplate("no placeholder", "X")).toBe("no placeholder");
  });
});

describe("expandPromptInput", () => {
  it("expands a known prompt with input substitution", async () => {
    mockLoad.mockResolvedValue(prompt("name: summarize\ntemplate: |\n  Summarize: {{input}}"));
    const out = await expandPromptInput("/summarize the notes");
    expect(out).toBe("Summarize: the notes\n");
  });

  it("returns input unchanged for unknown prompt", async () => {
    mockLoad.mockResolvedValue(null);
    expect(await expandPromptInput("/unknown hi")).toBe("/unknown hi");
  });

  it("returns input unchanged for non-command", async () => {
    expect(await expandPromptInput("just a message")).toBe("just a message");
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it("returns input unchanged when template is missing", async () => {
    mockLoad.mockResolvedValue(prompt("name: x\ndescription: y"));
    expect(await expandPromptInput("/x hi")).toBe("/x hi");
  });

  it("returns input unchanged on malformed yaml", async () => {
    mockLoad.mockResolvedValue(prompt("::: not : yaml :::\n - ["));
    expect(await expandPromptInput("/x hi")).toBe("/x hi");
  });
});

describe("listPromptNames", () => {
  it("returns names", async () => {
    mockList.mockResolvedValue(["a", "b"]);
    expect(await listPromptNames()).toEqual(["a", "b"]);
  });

  it("returns [] on failure", async () => {
    mockList.mockRejectedValue(new Error("nope"));
    expect(await listPromptNames()).toEqual([]);
  });
});
