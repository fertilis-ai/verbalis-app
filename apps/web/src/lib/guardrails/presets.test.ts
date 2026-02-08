import { describe, it, expect } from "vitest";
import {
  NORMAL_MODE_CONFIG,
  ADVANCED_MODE_CONFIG,
  YOLO_MODE_CONFIG,
  getPresetConfig,
  detectPreset,
  PRESET_LABELS,
} from "./presets";
import { DEFAULT_GUARDRAILS_CONFIG } from "./types";
import type { GuardrailsConfig } from "./types";

describe("preset configs", () => {
  describe("NORMAL_MODE_CONFIG", () => {
    it("should be identical to DEFAULT_GUARDRAILS_CONFIG", () => {
      expect(NORMAL_MODE_CONFIG).toBe(DEFAULT_GUARDRAILS_CONFIG);
    });

    it("should have guardrails enabled", () => {
      expect(NORMAL_MODE_CONFIG.enabled).toBe(true);
    });

    it("should require confirmation for medium+ risk in file_system", () => {
      const fs = NORMAL_MODE_CONFIG.categoryConfirmation.file_system;
      expect(fs.low).toBe(false);
      expect(fs.medium).toBe(true);
      expect(fs.high).toBe(true);
      expect(fs.critical).toBe(true);
    });

    it("should have sandbox enabled", () => {
      expect(NORMAL_MODE_CONFIG.sandbox.enabled).toBe(true);
    });
  });

  describe("ADVANCED_MODE_CONFIG", () => {
    it("should have guardrails enabled", () => {
      expect(ADVANCED_MODE_CONFIG.enabled).toBe(true);
    });

    it("should only require confirmation for high+ risk in file_system", () => {
      const fs = ADVANCED_MODE_CONFIG.categoryConfirmation.file_system;
      expect(fs.low).toBe(false);
      expect(fs.medium).toBe(false);
      expect(fs.high).toBe(true);
      expect(fs.critical).toBe(true);
    });

    it("should only confirm critical for memory category", () => {
      const mem = ADVANCED_MODE_CONFIG.categoryConfirmation.memory;
      expect(mem.low).toBe(false);
      expect(mem.medium).toBe(false);
      expect(mem.high).toBe(false);
      expect(mem.critical).toBe(true);
    });

    it("should have sandbox disabled", () => {
      expect(ADVANCED_MODE_CONFIG.sandbox.enabled).toBe(false);
    });

    it("should have relaxed rate limits", () => {
      expect(ADVANCED_MODE_CONFIG.rateLimits.toolCallsPerMinute).toBe(60);
      expect(ADVANCED_MODE_CONFIG.rateLimits.toolCallsPerHour).toBe(1000);
      expect(ADVANCED_MODE_CONFIG.rateLimits.apiCallsPerMinute).toBe(30);
      expect(ADVANCED_MODE_CONFIG.rateLimits.shellCommandsPerMinute).toBe(15);
    });

    it("should keep shell command default policy as deny", () => {
      expect(ADVANCED_MODE_CONFIG.shellCommands.defaultPolicy).toBe("deny");
    });
  });

  describe("YOLO_MODE_CONFIG", () => {
    it("should have guardrails disabled", () => {
      expect(YOLO_MODE_CONFIG.enabled).toBe(false);
    });

    it("should not require confirmation for any risk level in any category", () => {
      for (const matrix of Object.values(YOLO_MODE_CONFIG.categoryConfirmation)) {
        expect(matrix.low).toBe(false);
        expect(matrix.medium).toBe(false);
        expect(matrix.high).toBe(false);
        expect(matrix.critical).toBe(false);
      }
    });

    it("should have sandbox disabled", () => {
      expect(YOLO_MODE_CONFIG.sandbox.enabled).toBe(false);
    });

    it("should have empty path and domain blocklists", () => {
      expect(YOLO_MODE_CONFIG.paths.blocklist).toHaveLength(0);
      expect(YOLO_MODE_CONFIG.domains.blocklist).toHaveLength(0);
    });

    it("should have wildcard shell allowlist", () => {
      expect(YOLO_MODE_CONFIG.shellCommands.allowlist).toContain("*");
    });

    it("should still block the most dangerous shell commands", () => {
      expect(YOLO_MODE_CONFIG.shellCommands.blocklist).toContain(":(){ :|:& };:");
      expect(YOLO_MODE_CONFIG.shellCommands.blocklist).toContain("rm -rf /");
    });

    it("should have very high rate limits", () => {
      expect(YOLO_MODE_CONFIG.rateLimits.toolCallsPerMinute).toBe(999999);
      expect(YOLO_MODE_CONFIG.rateLimits.toolCallsPerHour).toBe(999999);
    });
  });
});

describe("getPresetConfig", () => {
  it("should return NORMAL_MODE_CONFIG for 'normal'", () => {
    expect(getPresetConfig("normal")).toBe(NORMAL_MODE_CONFIG);
  });

  it("should return ADVANCED_MODE_CONFIG for 'advanced'", () => {
    expect(getPresetConfig("advanced")).toBe(ADVANCED_MODE_CONFIG);
  });

  it("should return YOLO_MODE_CONFIG for 'yolo'", () => {
    expect(getPresetConfig("yolo")).toBe(YOLO_MODE_CONFIG);
  });

  it("should return NORMAL_MODE_CONFIG for unknown preset (default fallback)", () => {
    // Using type assertion to test default case
    expect(getPresetConfig("nonexistent" as "normal")).toBe(NORMAL_MODE_CONFIG);
  });
});

describe("detectPreset", () => {
  it("should detect normal mode from NORMAL_MODE_CONFIG", () => {
    expect(detectPreset(NORMAL_MODE_CONFIG)).toBe("normal");
  });

  it("should detect advanced mode from ADVANCED_MODE_CONFIG", () => {
    expect(detectPreset(ADVANCED_MODE_CONFIG)).toBe("advanced");
  });

  it("should detect yolo mode from YOLO_MODE_CONFIG", () => {
    expect(detectPreset(YOLO_MODE_CONFIG)).toBe("yolo");
  });

  it("should detect yolo for any config with enabled=false", () => {
    const config: GuardrailsConfig = {
      ...NORMAL_MODE_CONFIG,
      enabled: false,
    };
    expect(detectPreset(config)).toBe("yolo");
  });

  it("should return 'custom' for a modified config that doesn't match any preset", () => {
    const config: GuardrailsConfig = {
      ...DEFAULT_GUARDRAILS_CONFIG,
      categoryConfirmation: {
        ...DEFAULT_GUARDRAILS_CONFIG.categoryConfirmation,
        file_system: { low: true, medium: false, high: true, critical: false },
      },
    };
    expect(detectPreset(config)).toBe("custom");
  });

  it("should return 'custom' for advanced-like confirmation but low rate limits", () => {
    const config: GuardrailsConfig = {
      ...ADVANCED_MODE_CONFIG,
      rateLimits: {
        toolCallsPerMinute: 10, // below 60 threshold
        toolCallsPerHour: 100,
        apiCallsPerMinute: 5,
        shellCommandsPerMinute: 2,
      },
    };
    expect(detectPreset(config)).toBe("custom");
  });

  it("should return 'custom' for normal-like confirmation but disabled sandbox", () => {
    const config: GuardrailsConfig = {
      ...NORMAL_MODE_CONFIG,
      sandbox: { ...NORMAL_MODE_CONFIG.sandbox, enabled: false },
    };
    expect(detectPreset(config)).toBe("custom");
  });

  it("should return 'custom' for normal-like confirmation but high rate limits", () => {
    const config: GuardrailsConfig = {
      ...NORMAL_MODE_CONFIG,
      rateLimits: {
        toolCallsPerMinute: 100, // above 30 threshold
        toolCallsPerHour: 500,
        apiCallsPerMinute: 10,
        shellCommandsPerMinute: 5,
      },
    };
    expect(detectPreset(config)).toBe("custom");
  });
});

describe("PRESET_LABELS", () => {
  it("should have labels for all three presets", () => {
    expect(PRESET_LABELS.normal).toBeDefined();
    expect(PRESET_LABELS.advanced).toBeDefined();
    expect(PRESET_LABELS.yolo).toBeDefined();
  });

  it("should have label, description, and color for each preset", () => {
    for (const preset of Object.values(PRESET_LABELS)) {
      expect(preset.label).toBeTruthy();
      expect(preset.description).toBeTruthy();
      expect(preset.color).toBeTruthy();
    }
  });

  it("should use appropriate color schemes", () => {
    expect(PRESET_LABELS.normal.color).toContain("green");
    expect(PRESET_LABELS.advanced.color).toContain("yellow");
    expect(PRESET_LABELS.yolo.color).toContain("red");
  });
});
