import { describe, it, expect } from "vitest";
import { normalizePath, resolvePath } from "./path-resolution";

describe("normalizePath", () => {
  it("collapses repeated slashes", () => {
    expect(normalizePath("//tmp//foo//bar")).toBe("/tmp/foo/bar");
  });

  it("strips trailing slash", () => {
    expect(normalizePath("/tmp/foo/")).toBe("/tmp/foo");
  });

  it("preserves root slash", () => {
    expect(normalizePath("/")).toBe("/");
  });

  it("strips leading ./", () => {
    expect(normalizePath("./foo/bar")).toBe("foo/bar");
  });

  it("trims whitespace", () => {
    expect(normalizePath("  /tmp/foo  ")).toBe("/tmp/foo");
  });

  it("handles empty string", () => {
    expect(normalizePath("")).toBe("");
  });
});

describe("resolvePath", () => {
  const wd = "/Users/martin/Projects";
  const settingsDir = "/Users/martin/.verbalis";
  const homeDir = "/Users/martin";

  describe("empty / whitespace paths", () => {
    it("returns WD for empty string", () => {
      const result = resolvePath("", wd, settingsDir, homeDir);
      expect(result.resolvedPath).toBe(wd);
      expect(result.resolution).toBe("empty");
    });

    it("returns WD for whitespace-only", () => {
      const result = resolvePath("   ", wd, settingsDir, homeDir);
      expect(result.resolvedPath).toBe(wd);
      expect(result.resolution).toBe("empty");
    });

    it("falls back to homeDir when WD is empty", () => {
      const result = resolvePath("", "", settingsDir, homeDir);
      expect(result.resolvedPath).toBe(homeDir);
      expect(result.resolution).toBe("empty");
    });
  });

  describe("absolute paths", () => {
    it("returns normalized absolute path", () => {
      const result = resolvePath("/tmp/foo", wd, settingsDir, homeDir);
      expect(result.resolvedPath).toBe("/tmp/foo");
      expect(result.resolution).toBe("absolute");
    });

    it("normalizes double slashes in absolute paths", () => {
      const result = resolvePath("//tmp//foo", wd, settingsDir, homeDir);
      expect(result.resolvedPath).toBe("/tmp/foo");
      expect(result.resolution).toBe("absolute");
    });

    it("strips trailing slash from absolute paths", () => {
      const result = resolvePath("/tmp/foo/", wd, settingsDir, homeDir);
      expect(result.resolvedPath).toBe("/tmp/foo");
      expect(result.resolution).toBe("absolute");
    });
  });

  describe("tilde paths", () => {
    it("passes through ~/path unchanged", () => {
      const result = resolvePath("~/Documents", wd, settingsDir, homeDir);
      expect(result.resolvedPath).toBe("~/Documents");
      expect(result.resolution).toBe("tilde");
    });

    it("passes through bare ~ unchanged", () => {
      const result = resolvePath("~", wd, settingsDir, homeDir);
      expect(result.resolvedPath).toBe("~");
      expect(result.resolution).toBe("tilde");
    });
  });

  describe("settings-category prefixes", () => {
    const prefixes = [
      "agents",
      "prompts",
      "memories",
      "skills",
      "workflows",
      "chats",
      "tasks",
      "scheduler",
    ];

    for (const prefix of prefixes) {
      it(`routes "${prefix}/foo.md" to settingsDir`, () => {
        const result = resolvePath(`${prefix}/foo.md`, wd, settingsDir, homeDir);
        expect(result.resolvedPath).toBe(`${settingsDir}/${prefix}/foo.md`);
        expect(result.resolution).toBe("settings_prefix");
      });
    }

    it("routes bare prefix name to settingsDir", () => {
      const result = resolvePath("agents", wd, settingsDir, homeDir);
      expect(result.resolvedPath).toBe(`${settingsDir}/agents`);
      expect(result.resolution).toBe("settings_prefix");
    });

    it("routes nested prefix path to settingsDir", () => {
      const result = resolvePath("agents/sub/deep.md", wd, settingsDir, homeDir);
      expect(result.resolvedPath).toBe(`${settingsDir}/agents/sub/deep.md`);
      expect(result.resolution).toBe("settings_prefix");
    });
  });

  describe("relative paths", () => {
    it("prepends WD to relative path", () => {
      const result = resolvePath("test.txt", wd, settingsDir, homeDir);
      expect(result.resolvedPath).toBe(`${wd}/test.txt`);
      expect(result.resolution).toBe("relative");
    });

    it("prepends WD to nested relative path", () => {
      const result = resolvePath("src/main.rs", wd, settingsDir, homeDir);
      expect(result.resolvedPath).toBe(`${wd}/src/main.rs`);
      expect(result.resolution).toBe("relative");
    });

    it("strips leading ./ before prepending WD", () => {
      const result = resolvePath("./readme.md", wd, settingsDir, homeDir);
      expect(result.resolvedPath).toBe(`${wd}/readme.md`);
      expect(result.resolution).toBe("relative");
    });

    it("falls back to homeDir when WD is empty", () => {
      const result = resolvePath("test.txt", "", settingsDir, homeDir);
      expect(result.resolvedPath).toBe(`${homeDir}/test.txt`);
      expect(result.resolution).toBe("relative");
    });
  });

  describe("originalPath tracking", () => {
    it("preserves original path in result", () => {
      const result = resolvePath("  ./test.txt  ", wd, settingsDir, homeDir);
      expect(result.originalPath).toBe("  ./test.txt  ");
      expect(result.resolvedPath).toBe(`${wd}/test.txt`);
    });
  });
});
