import { describe, it, expect, beforeEach, vi } from "vitest";

const mockList = vi.fn();
const mockLoad = vi.fn();
const mockReadFile = vi.fn();

vi.mock("@/lib/storage", () => ({
  listToolboxItems: (...a: unknown[]) => mockList(...a),
  loadToolboxItem: (...a: unknown[]) => mockLoad(...a),
  readFile: (...a: unknown[]) => mockReadFile(...a),
}));

import { resolveMemories, DEFAULT_MAX_MEMORY_CHARS } from "./resolve-memories";

function item(name: string, content: string) {
  return { name, category: "memories", content, updatedAt: "" };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue([]);
  mockLoad.mockResolvedValue(null);
  mockReadFile.mockRejectedValue(new Error("not found"));
});

describe("resolveMemories", () => {
  it("injects SOUL and USER, SOUL first", async () => {
    mockList.mockResolvedValue(["USER", "SOUL"]);
    mockLoad.mockImplementation((_c: string, name: string) =>
      Promise.resolve(item(name, name === "SOUL" ? "soul body" : "user body"))
    );
    const result = await resolveMemories();
    expect(result.map((m) => m.heading)).toEqual(["Soul", "User"]);
    expect(result[0].body).toBe("soul body");
  });

  it("injects non-well-known memories only when alwaysInclude is true", async () => {
    mockList.mockResolvedValue(["notes", "diary"]);
    mockLoad.mockImplementation((_c: string, name: string) =>
      Promise.resolve(
        item(
          name,
          name === "notes"
            ? "---\nalwaysInclude: true\n---\nkeep me"
            : "---\nalwaysInclude: false\n---\nskip me"
        )
      )
    );
    const result = await resolveMemories();
    expect(result.map((m) => m.name)).toEqual(["notes"]);
    expect(result[0].body).toBe("keep me");
  });

  it("falls back to legacy settingsDir for SOUL/USER when absent", async () => {
    mockList.mockResolvedValue([]);
    mockReadFile.mockImplementation((path: string) =>
      path.includes("SOUL") ? Promise.resolve("legacy soul") : Promise.reject(new Error("not found"))
    );
    const result = await resolveMemories({ settingsDir: "/legacy" });
    expect(result).toHaveLength(1);
    expect(result[0].heading).toBe("Soul");
    expect(result[0].body).toBe("legacy soul");
  });

  it("prefers canonical SOUL over legacy", async () => {
    mockList.mockResolvedValue(["SOUL"]);
    mockLoad.mockResolvedValue(item("SOUL", "canonical soul"));
    // Legacy has SOUL too, but canonical should win (legacy SOUL skipped).
    mockReadFile.mockImplementation((path: string) =>
      path.includes("SOUL") ? Promise.resolve("legacy soul") : Promise.reject(new Error("not found"))
    );
    const result = await resolveMemories({ settingsDir: "/legacy" });
    expect(result).toHaveLength(1);
    expect(result[0].body).toBe("canonical soul");
  });

  it("skips empty memories", async () => {
    mockList.mockResolvedValue(["SOUL"]);
    mockLoad.mockResolvedValue(item("SOUL", "   "));
    const result = await resolveMemories();
    expect(result).toHaveLength(0);
  });

  it("bounds total injected size", async () => {
    const big = "x".repeat(DEFAULT_MAX_MEMORY_CHARS);
    mockList.mockResolvedValue(["SOUL", "a", "b"]);
    mockLoad.mockImplementation((_c: string, name: string) => {
      if (name === "SOUL") return Promise.resolve(item("SOUL", "soul"));
      return Promise.resolve(item(name, `---\nalwaysInclude: true\n---\n${big}`));
    });
    const result = await resolveMemories({ maxChars: 1000 });
    // SOUL always included; first opt-in pushes over budget so only one of a/b fits
    expect(result[0].name).toBe("SOUL");
    expect(result.length).toBeLessThanOrEqual(2);
  });
});
