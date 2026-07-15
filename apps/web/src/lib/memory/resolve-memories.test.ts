import { describe, it, expect, beforeEach, vi } from "vitest";

const mockList = vi.fn();
const mockLoad = vi.fn();
const mockReadFile = vi.fn();
const mockListFiles = vi.fn();

vi.mock("@/lib/storage", () => ({
  listToolboxItems: (...a: unknown[]) => mockList(...a),
  loadToolboxItem: (...a: unknown[]) => mockLoad(...a),
  readFile: (...a: unknown[]) => mockReadFile(...a),
  listFiles: (...a: unknown[]) => mockListFiles(...a),
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
  mockListFiles.mockResolvedValue([]);
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

  it("loads alwaysInclude memories from the settings directory", async () => {
    mockListFiles.mockResolvedValue(["projects", "scratch"]);
    mockReadFile.mockImplementation((path: string) => {
      if (path === "/settings/memories/projects.md") {
        return Promise.resolve("---\nalwaysInclude: true\n---\nproject facts");
      }
      if (path === "/settings/memories/scratch.md") {
        return Promise.resolve("---\nalwaysInclude: false\n---\nscratch notes");
      }
      return Promise.reject(new Error("not found"));
    });
    const result = await resolveMemories({ settingsDir: "/settings" });
    expect(mockListFiles).toHaveBeenCalledWith("/settings/memories", "md");
    expect(result.map((m) => m.name)).toEqual(["projects"]);
    expect(result[0].body).toBe("project facts");
  });

  it("app-data memory wins over a same-named settings-dir memory even when excluded", async () => {
    // Canonical "notes" exists but is not alwaysInclude → excluded, and its
    // name is claimed so the settings-dir "notes" must not sneak in.
    mockList.mockResolvedValue(["notes"]);
    mockLoad.mockResolvedValue(item("notes", "---\nalwaysInclude: false\n---\ncanonical notes"));
    mockListFiles.mockResolvedValue(["notes"]);
    mockReadFile.mockImplementation((path: string) =>
      path === "/settings/memories/notes.md"
        ? Promise.resolve("---\nalwaysInclude: true\n---\nsettings notes")
        : Promise.reject(new Error("not found"))
    );
    const result = await resolveMemories({ settingsDir: "/settings" });
    expect(result).toHaveLength(0);
  });

  it("merges settings-dir memories with canonical ones", async () => {
    mockList.mockResolvedValue(["SOUL"]);
    mockLoad.mockResolvedValue(item("SOUL", "soul body"));
    mockListFiles.mockResolvedValue(["team"]);
    mockReadFile.mockImplementation((path: string) =>
      path === "/settings/memories/team.md"
        ? Promise.resolve("---\nalwaysInclude: true\n---\nteam facts")
        : Promise.reject(new Error("not found"))
    );
    const result = await resolveMemories({ settingsDir: "/settings" });
    expect(result.map((m) => m.name)).toEqual(["SOUL", "team"]);
  });

  it("still probes settings-dir SOUL/USER when the directory listing fails", async () => {
    mockListFiles.mockRejectedValue(new Error("no such dir"));
    mockReadFile.mockImplementation((path: string) =>
      path === "/settings/memories/USER.md"
        ? Promise.resolve("external user")
        : Promise.reject(new Error("not found"))
    );
    const result = await resolveMemories({ settingsDir: "/settings" });
    expect(result).toHaveLength(1);
    expect(result[0].heading).toBe("User");
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
