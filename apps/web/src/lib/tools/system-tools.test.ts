import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the module
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));

vi.mock("@/lib/storage", () => ({
  isTauri: vi.fn(() => false),
}));

import {
  SYSTEM_TOOL_DEFINITIONS,
  executeShell,
  executeClipboardRead,
  executeClipboardWrite,
  executeNotificationSend,
  executeSystemTool,
  type ShellOutput,
} from "./system-tools";
import { isTauri } from "@/lib/storage";
import { invoke } from "@tauri-apps/api/core";

const mockIsTauri = vi.mocked(isTauri);
const mockInvoke = vi.mocked(invoke);

// ============================================================================
// SYSTEM_TOOL_DEFINITIONS
// ============================================================================

describe("SYSTEM_TOOL_DEFINITIONS", () => {
  it("defines shell_execute tool", () => {
    const def = SYSTEM_TOOL_DEFINITIONS.shell_execute;
    expect(def.name).toBe("shell_execute");
    expect(def.category).toBe("system");
    expect(def.riskLevel).toBe("critical");
    expect(def.requiresNetwork).toBe(false);
    expect(def.supportsUndo).toBe(false);
    expect(def.confirmationOverride).toBe("always");
  });

  it("defines clipboard_read tool", () => {
    const def = SYSTEM_TOOL_DEFINITIONS.clipboard_read;
    expect(def.name).toBe("clipboard_read");
    expect(def.category).toBe("system");
    expect(def.riskLevel).toBe("low");
    expect(def.supportsUndo).toBe(false);
  });

  it("defines clipboard_write tool", () => {
    const def = SYSTEM_TOOL_DEFINITIONS.clipboard_write;
    expect(def.name).toBe("clipboard_write");
    expect(def.category).toBe("system");
    expect(def.riskLevel).toBe("medium");
    expect(def.supportsUndo).toBe(true);
  });

  it("defines notification_send tool", () => {
    const def = SYSTEM_TOOL_DEFINITIONS.notification_send;
    expect(def.name).toBe("notification_send");
    expect(def.category).toBe("system");
    expect(def.riskLevel).toBe("low");
    expect(def.supportsUndo).toBe(false);
  });

  it("all definitions have required fields", () => {
    for (const def of Object.values(SYSTEM_TOOL_DEFINITIONS)) {
      expect(def).toHaveProperty("name");
      expect(def).toHaveProperty("description");
      expect(def).toHaveProperty("category");
      expect(def).toHaveProperty("riskLevel");
      expect(def).toHaveProperty("parameters");
      expect(def).toHaveProperty("requiresNetwork");
      expect(def).toHaveProperty("supportsUndo");
    }
  });
});

// ============================================================================
// executeShell
// ============================================================================

describe("executeShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauri.mockReturnValue(false);
  });

  it("throws when not in Tauri mode", async () => {
    await expect(
      executeShell({ command: "echo hello" })
    ).rejects.toThrow("Shell execution is only available in the desktop app");
  });

  it("calls Tauri invoke with correct parameters", async () => {
    mockIsTauri.mockReturnValue(true);

    const shellOutput: ShellOutput = {
      stdout: "hello\n",
      stderr: "",
      exit_code: 0,
      duration_ms: 50,
    };
    mockInvoke.mockResolvedValue(shellOutput);

    const result = await executeShell({
      command: "echo hello",
      cwd: "/tmp",
      timeout_ms: 30000,
    });

    expect(mockInvoke).toHaveBeenCalledWith("execute_shell", {
      command: "echo hello",
      cwd: "/tmp",
      timeoutMs: 30000,
      sandbox: false,
    });
    expect(result).toContain("Exit code: 0");
    expect(result).toContain("Duration: 50ms");
    expect(result).toContain("stdout:");
    expect(result).toContain("hello");
  });

  it("uses default timeout of 60000ms", async () => {
    mockIsTauri.mockReturnValue(true);

    mockInvoke.mockResolvedValue({
      stdout: "",
      stderr: "",
      exit_code: 0,
      duration_ms: 10,
    });

    await executeShell({ command: "ls" });

    expect(mockInvoke).toHaveBeenCalledWith("execute_shell", {
      command: "ls",
      cwd: null,
      timeoutMs: 60000,
      sandbox: false,
    });
  });

  it("formats output with both stdout and stderr", async () => {
    mockIsTauri.mockReturnValue(true);

    mockInvoke.mockResolvedValue({
      stdout: "output line",
      stderr: "warning: something",
      exit_code: 1,
      duration_ms: 100,
    });

    const result = await executeShell({ command: "bad-command" });

    expect(result).toContain("Exit code: 1");
    expect(result).toContain("stdout:");
    expect(result).toContain("output line");
    expect(result).toContain("stderr:");
    expect(result).toContain("warning: something");
  });

  it("formats output with no stdout or stderr", async () => {
    mockIsTauri.mockReturnValue(true);

    mockInvoke.mockResolvedValue({
      stdout: "",
      stderr: "",
      exit_code: 0,
      duration_ms: 5,
    });

    const result = await executeShell({ command: "true" });
    expect(result).toContain("(no output)");
  });

  it("handles null exit code (e.g., signal killed)", async () => {
    mockIsTauri.mockReturnValue(true);

    mockInvoke.mockResolvedValue({
      stdout: "",
      stderr: "",
      exit_code: null,
      duration_ms: 1000,
    });

    const result = await executeShell({ command: "sleep 100" });
    expect(result).toContain("Exit code: N/A");
  });
});

// ============================================================================
// executeClipboardRead
// ============================================================================

describe("executeClipboardRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauri.mockReturnValue(false);
  });

  it("uses browser Clipboard API when not in Tauri", async () => {
    Object.assign(navigator, {
      clipboard: {
        readText: vi.fn().mockResolvedValue("clipboard content"),
      },
    });

    const result = await executeClipboardRead({});
    expect(result).toBe("clipboard content");
  });

  it("returns empty message when browser clipboard is empty", async () => {
    Object.assign(navigator, {
      clipboard: {
        readText: vi.fn().mockResolvedValue(""),
      },
    });

    const result = await executeClipboardRead({});
    expect(result).toBe("(clipboard is empty)");
  });

  it("throws when browser clipboard access is denied", async () => {
    Object.assign(navigator, {
      clipboard: {
        readText: vi.fn().mockRejectedValue(new Error("denied")),
      },
    });

    await expect(executeClipboardRead({})).rejects.toThrow(
      "Clipboard access denied"
    );
  });

  it("uses Tauri invoke in Tauri mode", async () => {
    mockIsTauri.mockReturnValue(true);
    mockInvoke.mockResolvedValue("tauri clipboard content");

    const result = await executeClipboardRead({});

    expect(mockInvoke).toHaveBeenCalledWith("read_clipboard");
    expect(result).toBe("tauri clipboard content");
  });

  it("returns empty message in Tauri when clipboard is empty", async () => {
    mockIsTauri.mockReturnValue(true);
    mockInvoke.mockResolvedValue("");

    const result = await executeClipboardRead({});
    expect(result).toBe("(clipboard is empty)");
  });
});

// ============================================================================
// executeClipboardWrite
// ============================================================================

describe("executeClipboardWrite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauri.mockReturnValue(false);
  });

  it("uses browser Clipboard API when not in Tauri", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    const result = await executeClipboardWrite({ content: "hello" });

    expect(writeText).toHaveBeenCalledWith("hello");
    expect(result).toBe("Successfully wrote 5 characters to clipboard");
  });

  it("throws when browser clipboard write is denied", async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("denied")),
      },
    });

    await expect(
      executeClipboardWrite({ content: "test" })
    ).rejects.toThrow("Clipboard access denied");
  });

  it("uses Tauri invoke in Tauri mode", async () => {
    mockIsTauri.mockReturnValue(true);
    mockInvoke.mockResolvedValue(undefined);

    const result = await executeClipboardWrite({ content: "tauri content" });

    expect(mockInvoke).toHaveBeenCalledWith("write_clipboard", {
      content: "tauri content",
    });
    expect(result).toBe("Successfully wrote 13 characters to clipboard");
  });
});

// ============================================================================
// executeNotificationSend
// ============================================================================

describe("executeNotificationSend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauri.mockReturnValue(false);
  });

  it("uses Tauri invoke in Tauri mode", async () => {
    mockIsTauri.mockReturnValue(true);
    mockInvoke.mockResolvedValue(undefined);

    const result = await executeNotificationSend({
      title: "Hello",
      body: "World",
    });

    expect(mockInvoke).toHaveBeenCalledWith("send_notification", {
      title: "Hello",
      body: "World",
    });
    expect(result).toBe('Notification sent: "Hello"');
  });

  it("throws when Notification API is not supported in browser", async () => {
    // Remove Notification from window
    const origNotification = window.Notification;
    // @ts-expect-error - testing missing API
    delete window.Notification;

    await expect(
      executeNotificationSend({ title: "Test", body: "Body" })
    ).rejects.toThrow("Notifications are not supported in this browser");

    window.Notification = origNotification;
  });

  it("throws when notification permission is denied", async () => {
    Object.defineProperty(window, "Notification", {
      value: class MockNotification {
        static permission = "denied";
        static requestPermission = vi.fn();
        constructor(
          public title: string,
          public options?: NotificationOptions
        ) {}
      },
      writable: true,
      configurable: true,
    });

    await expect(
      executeNotificationSend({ title: "Test", body: "Body" })
    ).rejects.toThrow("Notification permission denied");
  });

  it("requests permission and sends when granted", async () => {
    const constructorSpy = vi.fn();
    Object.defineProperty(window, "Notification", {
      value: class MockNotification {
        static permission = "default";
        static requestPermission = vi.fn().mockResolvedValue("granted");
        constructor(
          public title: string,
          public options?: NotificationOptions
        ) {
          constructorSpy(title, options);
        }
      },
      writable: true,
      configurable: true,
    });

    const result = await executeNotificationSend({
      title: "Alert",
      body: "Something happened",
    });

    expect(Notification.requestPermission).toHaveBeenCalled();
    expect(constructorSpy).toHaveBeenCalledWith("Alert", {
      body: "Something happened",
    });
    expect(result).toBe('Notification sent: "Alert"');
  });

  it("throws when permission request is rejected", async () => {
    Object.defineProperty(window, "Notification", {
      value: class MockNotification {
        static permission = "default";
        static requestPermission = vi.fn().mockResolvedValue("denied");
        constructor(
          public title: string,
          public options?: NotificationOptions
        ) {}
      },
      writable: true,
      configurable: true,
    });

    await expect(
      executeNotificationSend({ title: "Test", body: "Body" })
    ).rejects.toThrow("Notification permission denied");
  });

  it("sends notification when permission already granted in browser", async () => {
    const constructorSpy = vi.fn();
    Object.defineProperty(window, "Notification", {
      value: class MockNotification {
        static permission = "granted";
        static requestPermission = vi.fn();
        constructor(
          public title: string,
          public options?: NotificationOptions
        ) {
          constructorSpy(title, options);
        }
      },
      writable: true,
      configurable: true,
    });

    const result = await executeNotificationSend({
      title: "Info",
      body: "Details here",
    });

    expect(constructorSpy).toHaveBeenCalledWith("Info", {
      body: "Details here",
    });
    expect(result).toBe('Notification sent: "Info"');
  });
});

// ============================================================================
// executeSystemTool router
// ============================================================================

describe("executeSystemTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauri.mockReturnValue(true);
  });

  it("routes shell_execute correctly", async () => {
    mockInvoke.mockResolvedValue({
      stdout: "test",
      stderr: "",
      exit_code: 0,
      duration_ms: 10,
    });

    const result = await executeSystemTool("shell_execute", {
      command: "echo test",
    });
    expect(result).toContain("Exit code: 0");
  });

  it("routes clipboard_read correctly", async () => {
    mockInvoke.mockResolvedValue("clipboard data");

    const result = await executeSystemTool("clipboard_read", {});
    expect(result).toBe("clipboard data");
  });

  it("routes clipboard_write correctly", async () => {
    mockInvoke.mockResolvedValue(undefined);

    const result = await executeSystemTool("clipboard_write", {
      content: "data",
    });
    expect(result).toContain("Successfully wrote 4 characters");
  });

  it("routes notification_send correctly", async () => {
    mockInvoke.mockResolvedValue(undefined);

    const result = await executeSystemTool("notification_send", {
      title: "Hi",
      body: "There",
    });
    expect(result).toContain('Notification sent: "Hi"');
  });

  it("throws for unknown tool names", async () => {
    await expect(
      executeSystemTool("unknown_tool", {})
    ).rejects.toThrow("Unknown system tool: unknown_tool");
  });
});
