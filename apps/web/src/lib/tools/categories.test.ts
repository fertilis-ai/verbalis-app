import { describe, it, expect } from "vitest";
import {
  compareRiskLevels,
  RISK_LEVEL_CONFIG,
  CATEGORY_CONFIG,
  type RiskLevel,
  type ToolCategory,
} from "./categories";

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
