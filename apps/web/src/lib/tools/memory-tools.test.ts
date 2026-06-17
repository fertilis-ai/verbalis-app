import { describe, it, expect, beforeEach, vi } from "vitest";
import matter from "gray-matter";

const mockSave = vi.fn().mockResolvedValue(undefined);
const mockLoad = vi.fn().mockResolvedValue(null);

vi.mock("@/lib/storage", () => ({
  saveToolboxItem: (...a: unknown[]) => mockSave(...a),
  loadToolboxItem: (...a: unknown[]) => mockLoad(...a),
}));

const mockReload = vi.fn().mockResolvedValue(undefined);
vi.mock("@/stores/toolbox-store", () => ({
  useToolboxStore: { getState: () => ({ loadItemsFromDisk: mockReload }) },
}));

import { executeRemember, DEFAULT_MEMORY_NAME } from "./memory-tools";

beforeEach(() => {
  vi.clearAllMocks();
  mockLoad.mockResolvedValue(null);
});

describe("executeRemember", () => {
  it("creates a new memory with alwaysInclude when none exists", async () => {
    const out = await executeRemember({ content: "user likes dark mode" });
    expect(mockSave).toHaveBeenCalledOnce();
    const saved = mockSave.mock.calls[0][0];
    expect(saved.name).toBe(DEFAULT_MEMORY_NAME);
    expect(saved.category).toBe("memories");
    const parsed = matter(saved.content);
    expect(parsed.data.alwaysInclude).toBe(true);
    expect(parsed.content).toContain("- user likes dark mode");
    expect(out).toContain("Remembered");
    expect(mockReload).toHaveBeenCalledOnce();
  });

  it("appends to existing memory preserving prior content", async () => {
    mockLoad.mockResolvedValue({
      name: "learned",
      category: "memories",
      content: "---\nalwaysInclude: true\n---\n- first fact",
      updatedAt: "",
    });
    await executeRemember({ content: "second fact" });
    const saved = mockSave.mock.calls[0][0];
    const parsed = matter(saved.content);
    expect(parsed.content).toContain("- first fact");
    expect(parsed.content).toContain("- second fact");
  });

  it("does not force alwaysInclude on well-known SOUL/USER", async () => {
    await executeRemember({ content: "x", name: "USER" });
    const saved = mockSave.mock.calls[0][0];
    expect(saved.name).toBe("USER");
    const parsed = matter(saved.content);
    expect(parsed.data.alwaysInclude).toBeUndefined();
  });

  it("rejects empty content", async () => {
    await expect(executeRemember({ content: "   " })).rejects.toThrow(/non-empty/);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("falls back to default name for unsafe names", async () => {
    await executeRemember({ content: "x", name: "../evil" });
    const saved = mockSave.mock.calls[0][0];
    expect(saved.name).toBe(DEFAULT_MEMORY_NAME);
  });
});
