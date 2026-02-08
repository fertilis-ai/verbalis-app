import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  setLoggingEnabled,
  isLoggingEnabled,
  logAgent,
  clearLog,
  readLog,
} from "./logger";

const mockInvoke = vi.fn();
const mockIsTauri = vi.fn(() => false);

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("./storage", () => ({
  isTauri: () => mockIsTauri(),
}));

describe("logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setLoggingEnabled(false);
    mockIsTauri.mockReturnValue(false);
    mockInvoke.mockResolvedValue(undefined);
  });

  describe("setLoggingEnabled / isLoggingEnabled", () => {
    it("defaults to disabled", () => {
      expect(isLoggingEnabled()).toBe(false);
    });

    it("enables logging", () => {
      setLoggingEnabled(true);
      expect(isLoggingEnabled()).toBe(true);
    });

    it("disables logging after enabling", () => {
      setLoggingEnabled(true);
      setLoggingEnabled(false);
      expect(isLoggingEnabled()).toBe(false);
    });
  });

  describe("logAgent", () => {
    it("does nothing when logging is disabled", () => {
      mockIsTauri.mockReturnValue(true);
      logAgent("ADAPTER", "test message");
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("does nothing when not in Tauri", () => {
      setLoggingEnabled(true);
      mockIsTauri.mockReturnValue(false);
      logAgent("ADAPTER", "test message");
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("invokes append_log when logging is enabled and in Tauri", () => {
      setLoggingEnabled(true);
      mockIsTauri.mockReturnValue(true);
      logAgent("USER_INPUT", "Hello");
      expect(mockInvoke).toHaveBeenCalledWith("append_log", {
        line: expect.stringContaining("[USER_INPUT] Hello"),
      });
    });

    it("includes category in the log entry", () => {
      setLoggingEnabled(true);
      mockIsTauri.mockReturnValue(true);
      logAgent("LLM_CALL", "Request sent");
      expect(mockInvoke).toHaveBeenCalledWith("append_log", {
        line: expect.stringContaining("[LLM_CALL]"),
      });
    });

    it("includes ISO timestamp in the log entry", () => {
      setLoggingEnabled(true);
      mockIsTauri.mockReturnValue(true);
      logAgent("EVENT", "Some event");
      const logLine = mockInvoke.mock.calls[0][1].line as string;
      // Should match ISO timestamp pattern [YYYY-MM-DDTHH:MM:SS.sssZ]
      expect(logLine).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
    });

    it("includes string data in the log entry", () => {
      setLoggingEnabled(true);
      mockIsTauri.mockReturnValue(true);
      logAgent("TOOL", "Exec tool", "some data string");
      const logLine = mockInvoke.mock.calls[0][1].line as string;
      expect(logLine).toContain("Data: some data string");
    });

    it("includes JSON-serialized object data", () => {
      setLoggingEnabled(true);
      mockIsTauri.mockReturnValue(true);
      logAgent("TOOL", "Exec tool", { key: "value" });
      const logLine = mockInvoke.mock.calls[0][1].line as string;
      expect(logLine).toContain("Data:");
      expect(logLine).toContain('"key"');
      expect(logLine).toContain('"value"');
    });

    it("truncates data longer than 1000 chars", () => {
      setLoggingEnabled(true);
      mockIsTauri.mockReturnValue(true);
      const longString = "x".repeat(2000);
      logAgent("TOOL", "Big data", longString);
      const logLine = mockInvoke.mock.calls[0][1].line as string;
      expect(logLine).toContain("... (truncated)");
      // Data should be at most 1000 chars + truncation suffix
      expect(logLine.length).toBeLessThan(2200);
    });

    it("handles unserializable data gracefully", () => {
      setLoggingEnabled(true);
      mockIsTauri.mockReturnValue(true);
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      logAgent("TOOL", "Circular", circular);
      const logLine = mockInvoke.mock.calls[0][1].line as string;
      expect(logLine).toContain("[unable to serialize]");
    });

    it("does not throw when invoke rejects", () => {
      setLoggingEnabled(true);
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockRejectedValue(new Error("write failed"));
      // Should not throw
      expect(() => logAgent("ADAPTER", "fail test")).not.toThrow();
    });
  });

  describe("clearLog", () => {
    it("does nothing when not in Tauri", async () => {
      mockIsTauri.mockReturnValue(false);
      await clearLog();
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("invokes clear_log when in Tauri", async () => {
      mockIsTauri.mockReturnValue(true);
      await clearLog();
      expect(mockInvoke).toHaveBeenCalledWith("clear_log");
    });

    it("handles errors gracefully", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockRejectedValue(new Error("clear failed"));
      await expect(clearLog()).resolves.toBeUndefined();
    });
  });

  describe("readLog", () => {
    it("returns empty string when not in Tauri", async () => {
      mockIsTauri.mockReturnValue(false);
      const result = await readLog();
      expect(result).toBe("");
    });

    it("returns log contents when in Tauri", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValue("log line 1\nlog line 2");
      const result = await readLog();
      expect(result).toBe("log line 1\nlog line 2");
    });

    it("returns empty string on error", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockRejectedValue(new Error("read failed"));
      const result = await readLog();
      expect(result).toBe("");
    });
  });
});
