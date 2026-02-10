import { v4 as uuid } from "uuid";
import { invoke } from "@tauri-apps/api/core";
import type {
  UndoOperation,
  UndoOperationType,
  FileWriteUndoData,
  FileDeleteUndoData,
  DirectoryCreateUndoData,
  ClipboardWriteUndoData,
} from "./types";
import { isTauri, getAppDataDir } from "@/lib/storage";
import { createSingleton } from "@/lib/utils";

// ============================================================================
// Undo Manager
// ============================================================================

const UNDO_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

class UndoManager {
  private operations: Map<string, UndoOperation> = new Map();
  private toolCallToOperation: Map<string, string> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Periodically clean up expired operations
    if (typeof window !== "undefined") {
      this.cleanupTimer = setInterval(() => this.cleanupExpired(), 5 * 60 * 1000); // Every 5 minutes
    }
  }

  // ============================================================================
  // Registration
  // ============================================================================

  /**
   * Register an undo operation before executing a tool
   */
  async registerUndo(
    toolCallId: string,
    operationType: UndoOperationType,
    undoData: unknown
  ): Promise<string> {
    const id = uuid();
    const now = new Date();

    const operation: UndoOperation = {
      id,
      toolCallId,
      operationType,
      undoData,
      status: "available",
      createdAt: now,
      expiresAt: new Date(now.getTime() + UNDO_EXPIRY_MS),
    };

    this.operations.set(id, operation);
    this.toolCallToOperation.set(toolCallId, id);

    return id;
  }

  // ============================================================================
  // File Operations
  // ============================================================================

  /**
   * Prepare undo data for a file write operation
   */
  async prepareFileWriteUndo(path: string): Promise<FileWriteUndoData> {
    if (!this.requireTauri()) {
      return { path, originalContent: null };
    }

    try {
      // Check if file exists and get its content
      const exists = await invoke<boolean>("path_exists", { path });

      if (exists) {
        const content = await invoke<string>("read_file", { path });
        return { path, originalContent: content };
      }

      return { path, originalContent: null };
    } catch {
      return { path, originalContent: null };
    }
  }

  /**
   * Prepare undo data for a file delete operation (move to trash)
   */
  async prepareFileDeleteUndo(path: string): Promise<FileDeleteUndoData | null> {
    if (!this.requireTauri()) {
      return null;
    }

    try {
      const exists = await invoke<boolean>("path_exists", { path });
      if (!exists) {
        return null;
      }

      // Determine if it's a directory
      const isDirectory = await this.isDirectory(path);

      // Create trash directory
      const appDir = await getAppDataDir();
      const trashDir = `${appDir}/trash`;
      await invoke("create_directory", { path: trashDir });

      // Generate unique trash path
      const timestamp = Date.now();
      const filename = path.split("/").pop() || "unknown";
      const trashPath = `${trashDir}/${timestamp}_${filename}`;

      // Move to trash
      await invoke("rename_path", { oldPath: path, newPath: trashPath });

      return {
        originalPath: path,
        trashPath,
        wasDirectory: isDirectory,
      };
    } catch (error) {
      console.error("[UndoManager] Failed to prepare file delete undo:", error);
      return null;
    }
  }

  /**
   * Prepare undo data for a directory create operation
   */
  async prepareDirectoryCreateUndo(path: string): Promise<DirectoryCreateUndoData | null> {
    if (!this.requireTauri()) {
      return null;
    }

    try {
      // Check if directory already exists
      const exists = await invoke<boolean>("path_exists", { path });

      if (exists) {
        // Directory already exists, can't undo
        return null;
      }

      return { path, wasEmpty: true };
    } catch {
      return null;
    }
  }

  /**
   * Prepare undo data for clipboard write
   */
  async prepareClipboardWriteUndo(): Promise<ClipboardWriteUndoData | null> {
    if (!this.requireTauri()) {
      return null;
    }

    try {
      const previousContent = await invoke<string>("read_clipboard");
      return { previousContent };
    } catch {
      return { previousContent: "" };
    }
  }

  // ============================================================================
  // Undo Execution
  // ============================================================================

  /**
   * Execute an undo operation
   */
  async executeUndo(operationId: string): Promise<boolean> {
    const operation = this.operations.get(operationId);
    if (!operation) {
      console.error("[UndoManager] Operation not found:", operationId);
      return false;
    }

    if (operation.status !== "available") {
      console.error("[UndoManager] Operation not available:", operation.status);
      return false;
    }

    if (new Date() > operation.expiresAt) {
      operation.status = "expired";
      return false;
    }

    if (!this.requireTauri()) {
      console.error("[UndoManager] Undo only available in Tauri");
      return false;
    }

    try {
      switch (operation.operationType) {
        case "file_write":
          await this.undoFileWrite(operation.undoData as FileWriteUndoData);
          break;

        case "file_delete":
          await this.undoFileDelete(operation.undoData as FileDeleteUndoData);
          break;

        case "directory_create":
          await this.undoDirectoryCreate(operation.undoData as DirectoryCreateUndoData);
          break;

        case "clipboard_write":
          await this.undoClipboardWrite(operation.undoData as ClipboardWriteUndoData);
          break;

        default:
          console.error("[UndoManager] Unknown operation type:", operation.operationType);
          return false;
      }

      operation.status = "executed";
      return true;
    } catch (error) {
      console.error("[UndoManager] Failed to execute undo:", error);
      operation.status = "failed";
      return false;
    }
  }

  /**
   * Execute undo by tool call ID
   */
  async executeUndoByToolCallId(toolCallId: string): Promise<boolean> {
    const operationId = this.toolCallToOperation.get(toolCallId);
    if (!operationId) {
      console.error("[UndoManager] No undo operation for tool call:", toolCallId);
      return false;
    }
    return this.executeUndo(operationId);
  }

  private async undoFileWrite(data: FileWriteUndoData): Promise<void> {
    if (data.originalContent === null) {
      // File didn't exist before, delete it
      await invoke("delete_path", { path: data.path });
    } else {
      // Restore original content
      await invoke("write_file", { path: data.path, content: data.originalContent });
    }
  }

  private async undoFileDelete(data: FileDeleteUndoData): Promise<void> {
    // Move from trash back to original location
    await invoke("rename_path", { oldPath: data.trashPath, newPath: data.originalPath });
  }

  private async undoDirectoryCreate(data: DirectoryCreateUndoData): Promise<void> {
    if (data.wasEmpty) {
      // Check if directory is still empty before deleting
      const isEmpty = await this.isDirectoryEmpty(data.path);
      if (isEmpty) {
        await invoke("delete_path", { path: data.path });
      } else {
        throw new Error("Directory is no longer empty, cannot undo");
      }
    }
  }

  private async undoClipboardWrite(data: ClipboardWriteUndoData): Promise<void> {
    await invoke("write_clipboard", { content: data.previousContent });
  }

  // ============================================================================
  // Query Operations
  // ============================================================================

  /**
   * Check if an undo operation is available for a tool call
   */
  isUndoAvailable(toolCallId: string): boolean {
    const operationId = this.toolCallToOperation.get(toolCallId);
    if (!operationId) return false;

    const operation = this.operations.get(operationId);
    if (!operation) return false;

    return operation.status === "available" && new Date() <= operation.expiresAt;
  }

  /**
   * Get undo operation for a tool call
   */
  getUndoOperation(toolCallId: string): UndoOperation | null {
    const operationId = this.toolCallToOperation.get(toolCallId);
    if (!operationId) return null;
    return this.operations.get(operationId) || null;
  }

  /**
   * Get all available undo operations
   */
  getAvailableOperations(): UndoOperation[] {
    const now = new Date();
    return Array.from(this.operations.values())
      .filter(op => op.status === "available" && now <= op.expiresAt)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  private cleanupExpired() {
    const now = new Date();
    const expiredIds: string[] = [];

    this.operations.forEach((operation, id) => {
      if (operation.status === "available" && now > operation.expiresAt) {
        operation.status = "expired";
      }

      // Remove old executed/failed/expired operations after 24 hours
      if (
        operation.status !== "available" &&
        now.getTime() - operation.createdAt.getTime() > 24 * 60 * 60 * 1000
      ) {
        expiredIds.push(id);
      }
    });

    for (const id of expiredIds) {
      const operation = this.operations.get(id);
      if (operation) {
        this.toolCallToOperation.delete(operation.toolCallId);
        this.operations.delete(id);
      }
    }

    // Also clean up trash directory periodically
    this.cleanupTrash();
  }

  private async cleanupTrash() {
    if (!this.requireTauri()) return;

    try {
      const appDir = await getAppDataDir();
      const trashDir = `${appDir}/trash`;

      // List files in trash
      const files = await invoke<string[]>("list_files", { dir: trashDir });

      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      for (const file of files) {
        // Extract timestamp from filename
        const match = file.match(/^(\d+)_/);
        if (match) {
          const timestamp = parseInt(match[1], 10);
          if (now - timestamp > maxAge) {
            await invoke("delete_path", { path: `${trashDir}/${file}` });
          }
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private requireTauri(): boolean {
    return isTauri();
  }

  private async isDirectory(path: string): Promise<boolean> {
    try {
      // Try to read as directory - if it succeeds, it's a directory
      await invoke("read_directory", { path, maxDepth: 0 });
      return true;
    } catch {
      return false;
    }
  }

  private async isDirectoryEmpty(path: string): Promise<boolean> {
    try {
      const contents = await invoke<Array<{ name: string }>>("read_directory", { path, maxDepth: 1 });
      return !contents || contents.length === 0;
    } catch {
      return true;
    }
  }

  /**
   * Clear all operations (for testing)
   */
  clear() {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.operations.clear();
    this.toolCallToOperation.clear();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

const undoManagerSingleton = createSingleton(
  () => new UndoManager(),
  (instance) => instance.clear(),
);

export const getUndoManager = undoManagerSingleton.get;
export const resetUndoManager = undoManagerSingleton.reset;

