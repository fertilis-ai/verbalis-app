import { Type, type Static } from "typebox";
import { invoke } from "@tauri-apps/api/core";
import type { ToolDefinitionV2 } from "./categories";
import { isTauri } from "@/lib/storage";
import { truncateText } from "@/lib/utils";

// ============================================================================
// Parameter Schemas
// ============================================================================

export const ShellExecuteParams = Type.Object({
  command: Type.String({ description: "Shell command to execute" }),
  cwd: Type.Optional(Type.String({ description: "Working directory (default: home directory)" })),
  timeout_ms: Type.Optional(Type.Number({ description: "Command timeout in milliseconds (default: 60000)" })),
});

export const ClipboardReadParams = Type.Object({});

export const ClipboardWriteParams = Type.Object({
  content: Type.String({ description: "Content to write to clipboard" }),
});

export const NotificationSendParams = Type.Object({
  title: Type.String({ description: "Notification title" }),
  body: Type.String({ description: "Notification body" }),
});

// ============================================================================
// Response Types
// ============================================================================

export interface ShellOutput {
  stdout: string;
  stderr: string;
  exit_code: number | null;
  duration_ms: number;
}

// ============================================================================
// Tool Implementations
// ============================================================================

export async function executeShell(
  args: Static<typeof ShellExecuteParams>
): Promise<string> {
  const { command, cwd, timeout_ms = 60000 } = args;

  if (!isTauri()) {
    throw new Error("Shell execution is only available in the desktop app");
  }

  const output = await invoke<ShellOutput>("execute_shell", {
    command,
    cwd: cwd || null,
    timeoutMs: timeout_ms,
  });

  return formatShellOutput(output);
}

export async function executeClipboardRead(
  _args: Static<typeof ClipboardReadParams>
): Promise<string> {
  if (!isTauri()) {
    // Browser fallback using Clipboard API
    try {
      const text = await navigator.clipboard.readText();
      return text || "(clipboard is empty)";
    } catch {
      throw new Error("Clipboard access denied. Please allow clipboard permissions.");
    }
  }

  const content = await invoke<string>("read_clipboard");
  return content || "(clipboard is empty)";
}

export async function executeClipboardWrite(
  args: Static<typeof ClipboardWriteParams>
): Promise<string> {
  const { content } = args;

  if (!isTauri()) {
    // Browser fallback using Clipboard API
    try {
      await navigator.clipboard.writeText(content);
      return `Successfully wrote ${content.length} characters to clipboard`;
    } catch {
      throw new Error("Clipboard access denied. Please allow clipboard permissions.");
    }
  }

  await invoke("write_clipboard", { content });
  return `Successfully wrote ${content.length} characters to clipboard`;
}

export async function executeNotificationSend(
  args: Static<typeof NotificationSendParams>
): Promise<string> {
  // Prefix and cap agent-sent notifications so they can't impersonate
  // system alerts or other apps.
  const title = `[Verbalis] ${args.title}`.slice(0, 100);
  const body = args.body.slice(0, 400);

  if (!isTauri()) {
    // Browser fallback using Notification API
    if (!("Notification" in window)) {
      throw new Error("Notifications are not supported in this browser");
    }

    if (Notification.permission === "denied") {
      throw new Error("Notification permission denied");
    }

    if (Notification.permission !== "granted") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Notification permission denied");
      }
    }

    new Notification(title, { body });
    return `Notification sent: "${title}"`;
  }

  await invoke("send_notification", { title, body });
  return `Notification sent: "${title}"`;
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatShellOutput(output: ShellOutput): string {
  const lines: string[] = [];

  lines.push(`Exit code: ${output.exit_code ?? "N/A"}`);
  lines.push(`Duration: ${output.duration_ms}ms`);

  if (output.stdout) {
    lines.push("");
    lines.push("stdout:");
    lines.push(truncateText(output.stdout, 10000));
  }

  if (output.stderr) {
    lines.push("");
    lines.push("stderr:");
    lines.push(truncateText(output.stderr, 5000));
  }

  if (!output.stdout && !output.stderr) {
    lines.push("");
    lines.push("(no output)");
  }

  return lines.join("\n");
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const SYSTEM_TOOL_DEFINITIONS: Record<string, ToolDefinitionV2> = {
  shell_execute: {
    name: "shell_execute",
    description: "Execute a shell command and return the output. Use with caution - commands are executed with user permissions.",
    category: "system",
    riskLevel: "critical",
    parameters: ShellExecuteParams,
    requiresNetwork: false, // Command itself may require network
    supportsUndo: false,
    confirmationOverride: "always",
    estimatedDurationMs: 5000,
  },
  clipboard_read: {
    name: "clipboard_read",
    description: "Read the current contents of the system clipboard",
    category: "system",
    // The clipboard often holds passwords or other sensitive copied data —
    // reading it is a quiet exfiltration channel, not a low-risk operation.
    riskLevel: "medium",
    parameters: ClipboardReadParams,
    requiresNetwork: false,
    supportsUndo: false,
    estimatedDurationMs: 50,
  },
  clipboard_write: {
    name: "clipboard_write",
    description: "Write content to the system clipboard, replacing any existing content",
    category: "system",
    riskLevel: "medium",
    parameters: ClipboardWriteParams,
    requiresNetwork: false,
    supportsUndo: true,
    estimatedDurationMs: 50,
  },
  notification_send: {
    name: "notification_send",
    description: "Send a system notification to the user",
    category: "system",
    riskLevel: "low",
    parameters: NotificationSendParams,
    requiresNetwork: false,
    supportsUndo: false,
    estimatedDurationMs: 100,
  },
};

// ============================================================================
// Execution Router
// ============================================================================

export async function executeSystemTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  switch (toolName) {
    case "shell_execute":
      return executeShell(args as Static<typeof ShellExecuteParams>);
    case "clipboard_read":
      return executeClipboardRead(args as Static<typeof ClipboardReadParams>);
    case "clipboard_write":
      return executeClipboardWrite(args as Static<typeof ClipboardWriteParams>);
    case "notification_send":
      return executeNotificationSend(args as Static<typeof NotificationSendParams>);
    default:
      throw new Error(`Unknown system tool: ${toolName}`);
  }
}
