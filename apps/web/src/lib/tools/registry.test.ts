import { describe, it, expect } from "vitest";
import type { TObject } from "typebox";
import {
  getToolRegistry,
  getToolNames,
  getToolSpec,
  getToolCategory,
  getToolRiskLevel,
  toolSupportsUndo,
} from "./registry";

// ============================================================================
// getToolCategory
// ============================================================================

describe("getToolCategory", () => {
  it("returns 'file_system' for known file system tools", () => {
    expect(getToolCategory("read_file")).toBe("file_system");
    expect(getToolCategory("write_file")).toBe("file_system");
    expect(getToolCategory("delete_path")).toBe("file_system");
    expect(getToolCategory("create_directory")).toBe("file_system");
    expect(getToolCategory("read_directory")).toBe("file_system");
    expect(getToolCategory("path_exists")).toBe("file_system");
    expect(getToolCategory("list_files")).toBe("file_system");
    expect(getToolCategory("rename_path")).toBe("file_system");
  });

  it("returns 'web' for known web tools", () => {
    expect(getToolCategory("http_fetch")).toBe("web");
    expect(getToolCategory("web_search")).toBe("web");
    expect(getToolCategory("scrape_webpage")).toBe("web");
  });

  it("returns 'custom' for unknown tool names", () => {
    expect(getToolCategory("unknown_tool")).toBe("custom");
    expect(getToolCategory("")).toBe("custom");
    expect(getToolCategory("my_custom_tool")).toBe("custom");
  });
});

// ============================================================================
// getToolRiskLevel
// ============================================================================

describe("getToolRiskLevel", () => {
  it("returns correct risk levels for file system tools", () => {
    expect(getToolRiskLevel("read_file")).toBe("low");
    expect(getToolRiskLevel("write_file")).toBe("medium");
    expect(getToolRiskLevel("delete_path")).toBe("high");
    expect(getToolRiskLevel("create_directory")).toBe("medium");
    expect(getToolRiskLevel("read_directory")).toBe("low");
    expect(getToolRiskLevel("path_exists")).toBe("low");
    expect(getToolRiskLevel("list_files")).toBe("low");
    expect(getToolRiskLevel("rename_path")).toBe("medium");
  });

  it("returns correct risk levels for web tools", () => {
    expect(getToolRiskLevel("http_fetch")).toBe("medium");
    expect(getToolRiskLevel("web_search")).toBe("low");
    expect(getToolRiskLevel("scrape_webpage")).toBe("low");
  });

  it("defaults to 'high' for unknown tool names", () => {
    expect(getToolRiskLevel("unknown_tool")).toBe("high");
    expect(getToolRiskLevel("")).toBe("high");
  });
});

// ============================================================================
// toolSupportsUndo
// ============================================================================

describe("toolSupportsUndo", () => {
  it("returns true for tools that support undo", () => {
    expect(toolSupportsUndo("write_file")).toBe(true);
    expect(toolSupportsUndo("delete_path")).toBe(true);
    expect(toolSupportsUndo("create_directory")).toBe(true);
    expect(toolSupportsUndo("rename_path")).toBe(true);
  });

  it("returns false for tools that do not support undo", () => {
    expect(toolSupportsUndo("read_file")).toBe(false);
    expect(toolSupportsUndo("read_directory")).toBe(false);
    expect(toolSupportsUndo("http_fetch")).toBe(false);
    expect(toolSupportsUndo("web_search")).toBe(false);
  });

  it("defaults to false for unknown tools", () => {
    expect(toolSupportsUndo("unknown_tool")).toBe(false);
    expect(toolSupportsUndo("")).toBe(false);
  });
});

// ============================================================================
// getToolRegistry
// ============================================================================

describe("getToolRegistry", () => {
  // The guardrails decide confirmation from category and risk level, so a
  // change here changes which calls prompt the user.
  it("pins every tool's name, category, risk level and undo support, in order", () => {
    expect(
      getToolRegistry().map((t) => [t.name, t.category, t.riskLevel, t.supportsUndo])
    ).toEqual([
      ["read_file", "file_system", "low", false],
      ["write_file", "file_system", "medium", true],
      ["delete_path", "file_system", "high", true],
      ["create_directory", "file_system", "medium", true],
      ["read_directory", "file_system", "low", false],
      ["path_exists", "file_system", "low", false],
      ["list_files", "file_system", "low", false],
      ["rename_path", "file_system", "medium", true],
      ["http_fetch", "web", "medium", false],
      ["web_search", "web", "low", false],
      ["scrape_webpage", "web", "low", false],
      ["generate_image", "web", "low", false],
      ["list_toolbox_items", "file_system", "low", false],
      ["read_toolbox_item", "file_system", "low", false],
      ["write_toolbox_item", "file_system", "medium", false],
      ["edit_toolbox_item", "file_system", "medium", false],
      ["delete_toolbox_item", "file_system", "high", false],
      ["remember", "memory", "medium", false],
    ]);
  });

  it("has no duplicate tool names", () => {
    const names = getToolNames();
    expect(new Set(names).size).toBe(names.length);
  });

  it("every tool has a description, an object schema and an executor", () => {
    for (const tool of getToolRegistry()) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect((tool.parameters as TObject).type).toBe("object");
      expect(typeof tool.execute).toBe("function");
    }
  });

  it("declares path parameters that exist in each tool's schema", () => {
    for (const tool of getToolRegistry()) {
      const props = Object.keys((tool.parameters as TObject).properties);
      for (const key of tool.pathParams ?? []) {
        expect(props).toContain(key);
      }
    }
  });

  it("getToolSpec returns the registry entry, or undefined for unknown names", () => {
    expect(getToolSpec("read_file")).toBe(getToolRegistry()[0]);
    expect(getToolSpec("unknown_tool")).toBeUndefined();
  });
});
