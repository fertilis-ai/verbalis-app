import type { ToolCategory, RiskLevel } from "@/lib/tools/categories";

// Tool call state for UI tracking
export type ToolCallStatus =
  | "pending"
  | "pending_confirmation"
  | "executing"
  | "success"
  | "error"
  | "cancelled"
  | "timeout"
  | "stopped";

export interface ToolCallState {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: ToolCallStatus;
  result?: string;
  error?: string;
  // Enhanced tracking
  queuedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  category?: ToolCategory;
  riskLevel?: RiskLevel;
  undoAvailable?: boolean;
  // Guardrail context
  guardrailReason?: string;
  guardrailViolations?: Array<{ type: string; message: string; severity: string }>;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallState[];
  createdAt: Date;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  // File system location
  path?: string;
  folderId?: string;
  // Background conversations are hidden from the chat sidebar (e.g. scheduler runs)
  background?: boolean;
}

export interface ContextFile {
  path: string;
  name: string;
  content: string;
}
