import { describe, it, expect, beforeEach, vi } from "vitest";

const mockSave = vi.fn().mockResolvedValue(undefined);
const mockDelete = vi.fn().mockResolvedValue(undefined);
const mockList = vi.fn().mockResolvedValue([]);
const mockLoad = vi.fn().mockResolvedValue(null);

vi.mock("@/lib/storage", () => ({
  saveToolboxItem: (...a: unknown[]) => mockSave(...a),
  deleteToolboxItem: (...a: unknown[]) => mockDelete(...a),
  listToolboxItems: (...a: unknown[]) => mockList(...a),
  loadToolboxItem: (...a: unknown[]) => mockLoad(...a),
}));

const mockToolboxReload = vi.fn().mockResolvedValue(undefined);
const mockAgentReload = vi.fn().mockResolvedValue(undefined);

vi.mock("@/stores/toolbox-store", () => ({
  useToolboxStore: { getState: () => ({ loadItemsFromDisk: mockToolboxReload }) },
}));
vi.mock("@/stores/agent-store", () => ({
  useAgentStore: { getState: () => ({ loadAgentsFromDisk: mockAgentReload }) },
}));

import {
  validateToolboxContent,
  executeToolboxTool,
} from "./toolbox-tools";

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue([]);
  mockLoad.mockResolvedValue(null);
});

describe("validateToolboxContent", () => {
  it("accepts free-form memories", () => {
    expect(validateToolboxContent("memories", "# Anything").ok).toBe(true);
  });

  it("requires a trigger for skills", () => {
    expect(validateToolboxContent("skills", "---\nname: x\n---\nbody").ok).toBe(false);
    expect(validateToolboxContent("skills", "---\nname: x\ntrigger: \"foo\"\n---\nbody").ok).toBe(true);
  });

  it("requires a template for prompts", () => {
    expect(validateToolboxContent("prompts", "name: x\ndescription: y").ok).toBe(false);
    expect(validateToolboxContent("prompts", "name: x\ntemplate: hello {{input}}").ok).toBe(true);
  });

  it("requires a steps array for workflows", () => {
    expect(validateToolboxContent("workflows", "name: x").ok).toBe(false);
    expect(
      validateToolboxContent("workflows", "name: x\nsteps:\n  - prompt: do it").ok
    ).toBe(true);
  });

  it("rejects workflow steps missing prompt", () => {
    expect(
      validateToolboxContent("workflows", "steps:\n  - agent: a").ok
    ).toBe(false);
  });

  it("rejects invalid yaml", () => {
    expect(validateToolboxContent("prompts", "::: not yaml :::\n  - [").ok).toBe(false);
  });

  it("accepts agents with valid frontmatter", () => {
    expect(validateToolboxContent("agents", "---\nname: a\nmodel: m\n---\nprompt").ok).toBe(true);
  });
});

describe("executeToolboxTool", () => {
  it("list_toolbox_items lists all categories by default", async () => {
    mockList.mockImplementation((cat: string) => Promise.resolve([`${cat}-item`]));
    const out = await executeToolboxTool("list_toolbox_items", {});
    expect(out).toContain("prompts: prompts-item");
    expect(out).toContain("workflows: workflows-item");
  });

  it("read_toolbox_item returns content", async () => {
    mockLoad.mockResolvedValue({ name: "x", category: "memories", content: "hello", updatedAt: "" });
    const out = await executeToolboxTool("read_toolbox_item", { category: "memories", name: "x" });
    expect(out).toBe("hello");
  });

  it("read_toolbox_item throws when missing", async () => {
    mockLoad.mockResolvedValue(null);
    await expect(
      executeToolboxTool("read_toolbox_item", { category: "memories", name: "x" })
    ).rejects.toThrow(/No memories item/);
  });

  it("write_toolbox_item validates then saves and reloads", async () => {
    const out = await executeToolboxTool("write_toolbox_item", {
      category: "memories",
      name: "note",
      content: "remember this",
    });
    expect(mockSave).toHaveBeenCalledOnce();
    expect(mockToolboxReload).toHaveBeenCalledOnce();
    expect(out).toContain("Saved");
  });

  it("write_toolbox_item reloads agents when category is agents", async () => {
    await executeToolboxTool("write_toolbox_item", {
      category: "agents",
      name: "bot",
      content: "---\nname: bot\n---\nprompt",
    });
    expect(mockAgentReload).toHaveBeenCalledOnce();
  });

  it("write_toolbox_item rejects invalid content without saving", async () => {
    await expect(
      executeToolboxTool("write_toolbox_item", {
        category: "skills",
        name: "s",
        content: "---\nname: s\n---\nno trigger",
      })
    ).rejects.toThrow(/Validation failed/);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("rejects unsafe names (path traversal)", async () => {
    await expect(
      executeToolboxTool("write_toolbox_item", {
        category: "memories",
        name: "../evil",
        content: "x",
      })
    ).rejects.toThrow(/unsafe/i);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("delete_toolbox_item deletes existing and reloads", async () => {
    mockLoad.mockResolvedValue({ name: "x", category: "memories", content: "c", updatedAt: "" });
    const out = await executeToolboxTool("delete_toolbox_item", { category: "memories", name: "x" });
    expect(mockDelete).toHaveBeenCalledOnce();
    expect(mockToolboxReload).toHaveBeenCalledOnce();
    expect(out).toContain("Deleted");
  });

  it("delete_toolbox_item throws when missing", async () => {
    mockLoad.mockResolvedValue(null);
    await expect(
      executeToolboxTool("delete_toolbox_item", { category: "memories", name: "x" })
    ).rejects.toThrow(/No memories item/);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("rejects invalid category", async () => {
    await expect(
      executeToolboxTool("read_toolbox_item", { category: "bogus", name: "x" })
    ).rejects.toThrow(/Invalid category/);
  });
});
