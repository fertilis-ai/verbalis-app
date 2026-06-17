import { describe, it, expect } from "vitest";
import {
  getToolCategory,
  getToolRiskLevel,
  getToolSupportsUndo,
  compareRiskLevels,
  RISK_LEVEL_CONFIG,
  CATEGORY_CONFIG,
  FILE_SYSTEM_TOOLS,
  TOOLBOX_TOOLS,
  WEB_TOOLS,
  SYSTEM_TOOLS,
  ALL_TOOLS,
  type RiskLevel,
  type ToolCategory,
} from "./categories";

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

  it("returns 'system' for known system tools", () => {
    expect(getToolCategory("shell_execute")).toBe("system");
    expect(getToolCategory("clipboard_read")).toBe("system");
    expect(getToolCategory("clipboard_write")).toBe("system");
    expect(getToolCategory("notification_send")).toBe("system");
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

  it("returns correct risk levels for system tools", () => {
    expect(getToolRiskLevel("shell_execute")).toBe("critical");
    expect(getToolRiskLevel("clipboard_read")).toBe("medium");
    expect(getToolRiskLevel("clipboard_write")).toBe("medium");
    expect(getToolRiskLevel("notification_send")).toBe("low");
  });

  it("defaults to 'high' for unknown tool names", () => {
    expect(getToolRiskLevel("unknown_tool")).toBe("high");
    expect(getToolRiskLevel("")).toBe("high");
  });
});

// ============================================================================
// getToolSupportsUndo
// ============================================================================

describe("getToolSupportsUndo", () => {
  it("returns true for tools that support undo", () => {
    expect(getToolSupportsUndo("write_file")).toBe(true);
    expect(getToolSupportsUndo("delete_path")).toBe(true);
    expect(getToolSupportsUndo("create_directory")).toBe(true);
    expect(getToolSupportsUndo("rename_path")).toBe(true);
    expect(getToolSupportsUndo("clipboard_write")).toBe(true);
  });

  it("returns false for tools that do not support undo", () => {
    expect(getToolSupportsUndo("read_file")).toBe(false);
    expect(getToolSupportsUndo("read_directory")).toBe(false);
    expect(getToolSupportsUndo("http_fetch")).toBe(false);
    expect(getToolSupportsUndo("web_search")).toBe(false);
    expect(getToolSupportsUndo("shell_execute")).toBe(false);
    expect(getToolSupportsUndo("clipboard_read")).toBe(false);
    expect(getToolSupportsUndo("notification_send")).toBe(false);
  });

  it("defaults to false for unknown tools", () => {
    expect(getToolSupportsUndo("unknown_tool")).toBe(false);
    expect(getToolSupportsUndo("")).toBe(false);
  });
});

// ============================================================================
// compareRiskLevels
// ============================================================================

describe("compareRiskLevels", () => {
  it("returns 0 for equal risk levels", () => {
    const levels: RiskLevel[] = ["low", "medium", "high", "critical"];
    for (const level of levels) {
      expect(compareRiskLevels(level, level)).toBe(0);
    }
  });

  it("returns negative when first is lower risk than second", () => {
    expect(compareRiskLevels("low", "medium")).toBeLessThan(0);
    expect(compareRiskLevels("low", "high")).toBeLessThan(0);
    expect(compareRiskLevels("low", "critical")).toBeLessThan(0);
    expect(compareRiskLevels("medium", "high")).toBeLessThan(0);
    expect(compareRiskLevels("medium", "critical")).toBeLessThan(0);
    expect(compareRiskLevels("high", "critical")).toBeLessThan(0);
  });

  it("returns positive when first is higher risk than second", () => {
    expect(compareRiskLevels("critical", "low")).toBeGreaterThan(0);
    expect(compareRiskLevels("high", "low")).toBeGreaterThan(0);
    expect(compareRiskLevels("medium", "low")).toBeGreaterThan(0);
    expect(compareRiskLevels("critical", "medium")).toBeGreaterThan(0);
    expect(compareRiskLevels("critical", "high")).toBeGreaterThan(0);
    expect(compareRiskLevels("high", "medium")).toBeGreaterThan(0);
  });

  it("can be used to sort risk levels ascending", () => {
    const levels: RiskLevel[] = ["critical", "low", "high", "medium"];
    const sorted = [...levels].sort(compareRiskLevels);
    expect(sorted).toEqual(["low", "medium", "high", "critical"]);
  });
});

// ============================================================================
// Config objects
// ============================================================================

describe("RISK_LEVEL_CONFIG", () => {
  it("has entries for all risk levels", () => {
    const expectedLevels: RiskLevel[] = ["low", "medium", "high", "critical"];
    expect(Object.keys(RISK_LEVEL_CONFIG)).toEqual(expectedLevels);
  });

  it("each entry has required fields", () => {
    for (const config of Object.values(RISK_LEVEL_CONFIG)) {
      expect(config).toHaveProperty("label");
      expect(config).toHaveProperty("color");
      expect(config).toHaveProperty("bgColor");
      expect(config).toHaveProperty("borderColor");
      expect(config).toHaveProperty("icon");
      expect(typeof config.label).toBe("string");
      expect(typeof config.icon).toBe("string");
    }
  });
});

describe("CATEGORY_CONFIG", () => {
  it("has entries for all tool categories", () => {
    const expectedCategories: ToolCategory[] = [
      "file_system",
      "web",
      "system",
      "integration",
      "memory",
      "custom",
    ];
    expect(Object.keys(CATEGORY_CONFIG).sort()).toEqual(expectedCategories.sort());
  });

  it("each entry has required fields", () => {
    for (const config of Object.values(CATEGORY_CONFIG)) {
      expect(config).toHaveProperty("label");
      expect(config).toHaveProperty("icon");
      expect(config).toHaveProperty("description");
      expect(typeof config.label).toBe("string");
      expect(typeof config.icon).toBe("string");
      expect(typeof config.description).toBe("string");
    }
  });
});

// ============================================================================
// Tool inventory arrays
// ============================================================================

describe("ALL_TOOLS", () => {
  it("contains all file system, web, and system tools", () => {
    const allNames = ALL_TOOLS.map(t => t.name);
    for (const tool of FILE_SYSTEM_TOOLS) {
      expect(allNames).toContain(tool.name);
    }
    for (const tool of WEB_TOOLS) {
      expect(allNames).toContain(tool.name);
    }
    for (const tool of SYSTEM_TOOLS) {
      expect(allNames).toContain(tool.name);
    }
  });

  it("has the expected total count", () => {
    expect(ALL_TOOLS.length).toBe(
      FILE_SYSTEM_TOOLS.length + TOOLBOX_TOOLS.length + WEB_TOOLS.length + SYSTEM_TOOLS.length
    );
  });

  it("has no duplicate tool names", () => {
    const names = ALL_TOOLS.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every tool has required inventory fields", () => {
    for (const tool of ALL_TOOLS) {
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.category).toBe("string");
      expect(typeof tool.riskLevel).toBe("string");
      expect(typeof tool.supportsUndo).toBe("boolean");
      expect(typeof tool.description).toBe("string");
    }
  });
});

describe("FILE_SYSTEM_TOOLS", () => {
  it("all have category 'file_system'", () => {
    for (const tool of FILE_SYSTEM_TOOLS) {
      expect(tool.category).toBe("file_system");
    }
  });
});

describe("WEB_TOOLS", () => {
  it("all have category 'web'", () => {
    for (const tool of WEB_TOOLS) {
      expect(tool.category).toBe("web");
    }
  });
});

describe("SYSTEM_TOOLS", () => {
  it("all have category 'system'", () => {
    for (const tool of SYSTEM_TOOLS) {
      expect(tool.category).toBe("system");
    }
  });
});
