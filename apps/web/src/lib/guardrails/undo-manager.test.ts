import { describe, it, expect, beforeEach, vi } from "vitest";
import { getUndoManager, resetUndoManager } from "./undo-manager";

// Mock @tauri-apps/api/core
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));

// Mock @/lib/storage
vi.mock("@/lib/storage", () => ({
  isTauri: vi.fn(() => false),
  getAppDataDir: vi.fn(async () => "/mock-app-data"),
}));

// Mock uuid
vi.mock("uuid", () => ({
  v4: vi.fn(() => "test-uuid-" + Math.random().toString(36).slice(2, 8)),
}));

import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/storage";

const mockInvoke = vi.mocked(invoke);
const mockIsTauri = vi.mocked(isTauri);

describe("UndoManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetUndoManager();
    mockIsTauri.mockReturnValue(false);
  });

  // ==========================================================================
  // Singleton
  // ==========================================================================
  describe("singleton", () => {
    it("should return the same instance on repeated calls", () => {
      const a = getUndoManager();
      const b = getUndoManager();
      expect(a).toBe(b);
    });

    it("should return a fresh instance after reset", () => {
      const a = getUndoManager();
      resetUndoManager();
      const b = getUndoManager();
      expect(a).not.toBe(b);
    });
  });

  // ==========================================================================
  // registerUndo
  // ==========================================================================
  describe("registerUndo", () => {
    it("should register an undo operation and return an id", async () => {
      const manager = getUndoManager();
      const id = await manager.registerUndo("tool-1", "file_write", { path: "/test.txt" });
      expect(id).toBeTruthy();
      expect(typeof id).toBe("string");
    });

    it("should make undo available after registration", async () => {
      const manager = getUndoManager();
      await manager.registerUndo("tool-1", "file_write", { path: "/test.txt" });
      expect(manager.isUndoAvailable("tool-1")).toBe(true);
    });

    it("should store operation data correctly", async () => {
      const manager = getUndoManager();
      const undoData = { path: "/test.txt", originalContent: "hello" };
      await manager.registerUndo("tool-1", "file_write", undoData);

      const op = manager.getUndoOperation("tool-1");
      expect(op).not.toBeNull();
      expect(op!.operationType).toBe("file_write");
      expect(op!.undoData).toEqual(undoData);
      expect(op!.status).toBe("available");
      expect(op!.toolCallId).toBe("tool-1");
    });

    it("should set expiry to 1 hour from creation", async () => {
      const manager = getUndoManager();
      const before = Date.now();
      await manager.registerUndo("tool-1", "file_write", {});
      const after = Date.now();

      const op = manager.getUndoOperation("tool-1");
      const expiryMs = op!.expiresAt.getTime() - op!.createdAt.getTime();
      expect(expiryMs).toBe(60 * 60 * 1000);
      expect(op!.createdAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(op!.createdAt.getTime()).toBeLessThanOrEqual(after);
    });

    it("should handle multiple registrations for different tool calls", async () => {
      const manager = getUndoManager();
      await manager.registerUndo("tool-1", "file_write", { path: "/a.txt" });
      await manager.registerUndo("tool-2", "file_delete", { originalPath: "/b.txt" });

      expect(manager.isUndoAvailable("tool-1")).toBe(true);
      expect(manager.isUndoAvailable("tool-2")).toBe(true);
    });
  });

  // ==========================================================================
  // isUndoAvailable
  // ==========================================================================
  describe("isUndoAvailable", () => {
    it("should return false for unregistered tool call", () => {
      const manager = getUndoManager();
      expect(manager.isUndoAvailable("nonexistent")).toBe(false);
    });

    it("should return true for freshly registered operation", async () => {
      const manager = getUndoManager();
      await manager.registerUndo("tool-1", "file_write", {});
      expect(manager.isUndoAvailable("tool-1")).toBe(true);
    });

    it("should return false for expired operations", async () => {
      const manager = getUndoManager();
      await manager.registerUndo("tool-1", "file_write", {});

      // Manually expire it
      const op = manager.getUndoOperation("tool-1");
      op!.expiresAt = new Date(Date.now() - 1000);

      expect(manager.isUndoAvailable("tool-1")).toBe(false);
    });
  });

  // ==========================================================================
  // getUndoOperation
  // ==========================================================================
  describe("getUndoOperation", () => {
    it("should return null for unregistered tool call", () => {
      const manager = getUndoManager();
      expect(manager.getUndoOperation("nonexistent")).toBeNull();
    });

    it("should return the operation for a registered tool call", async () => {
      const manager = getUndoManager();
      await manager.registerUndo("tool-1", "directory_create", { path: "/tmp/test" });
      const op = manager.getUndoOperation("tool-1");
      expect(op).not.toBeNull();
      expect(op!.operationType).toBe("directory_create");
    });
  });

  // ==========================================================================
  // getAvailableOperations
  // ==========================================================================
  describe("getAvailableOperations", () => {
    it("should return empty array when no operations registered", () => {
      const manager = getUndoManager();
      expect(manager.getAvailableOperations()).toHaveLength(0);
    });

    it("should return all available operations", async () => {
      const manager = getUndoManager();
      await manager.registerUndo("tool-1", "file_write", {});
      await manager.registerUndo("tool-2", "file_delete", {});

      const ops = manager.getAvailableOperations();
      expect(ops).toHaveLength(2);
    });

    it("should exclude expired operations", async () => {
      const manager = getUndoManager();
      await manager.registerUndo("tool-1", "file_write", {});
      await manager.registerUndo("tool-2", "file_delete", {});

      // Expire one
      const op = manager.getUndoOperation("tool-1");
      op!.expiresAt = new Date(Date.now() - 1000);

      const ops = manager.getAvailableOperations();
      expect(ops).toHaveLength(1);
      expect(ops[0].toolCallId).toBe("tool-2");
    });

    it("should sort by createdAt descending (newest first)", async () => {
      const manager = getUndoManager();
      await manager.registerUndo("tool-1", "file_write", {});
      // Add small delay to ensure different timestamps
      await new Promise(r => setTimeout(r, 10));
      await manager.registerUndo("tool-2", "file_delete", {});

      const ops = manager.getAvailableOperations();
      expect(ops[0].toolCallId).toBe("tool-2");
      expect(ops[1].toolCallId).toBe("tool-1");
    });
  });

  // ==========================================================================
  // prepareFileWriteUndo (non-Tauri)
  // ==========================================================================
  describe("prepareFileWriteUndo (non-Tauri)", () => {
    it("should return data with null originalContent when not in Tauri", async () => {
      const manager = getUndoManager();
      const data = await manager.prepareFileWriteUndo("/test/file.txt");
      expect(data.path).toBe("/test/file.txt");
      expect(data.originalContent).toBeNull();
    });
  });

  // ==========================================================================
  // prepareFileWriteUndo (Tauri)
  // ==========================================================================
  describe("prepareFileWriteUndo (Tauri)", () => {
    beforeEach(() => {
      mockIsTauri.mockReturnValue(true);
    });

    it("should return original content when file exists", async () => {
      mockInvoke
        .mockResolvedValueOnce(true)   // path_exists
        .mockResolvedValueOnce("original content");  // read_file

      const manager = getUndoManager();
      const data = await manager.prepareFileWriteUndo("/test/file.txt");
      expect(data.path).toBe("/test/file.txt");
      expect(data.originalContent).toBe("original content");
    });

    it("should return null originalContent when file does not exist", async () => {
      mockInvoke.mockResolvedValueOnce(false);  // path_exists

      const manager = getUndoManager();
      const data = await manager.prepareFileWriteUndo("/test/new-file.txt");
      expect(data.originalContent).toBeNull();
    });

    it("should return null originalContent on invoke error", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("Tauri error"));

      const manager = getUndoManager();
      const data = await manager.prepareFileWriteUndo("/test/file.txt");
      expect(data.originalContent).toBeNull();
    });
  });

  // ==========================================================================
  // prepareFileDeleteUndo
  // ==========================================================================
  describe("prepareFileDeleteUndo", () => {
    it("should return null when not in Tauri", async () => {
      const manager = getUndoManager();
      const result = await manager.prepareFileDeleteUndo("/test/file.txt");
      expect(result).toBeNull();
    });

    it("should return null when file does not exist (Tauri)", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValueOnce(false);  // path_exists

      const manager = getUndoManager();
      const result = await manager.prepareFileDeleteUndo("/test/file.txt");
      expect(result).toBeNull();
    });

    it("should move file to trash and return undo data (Tauri)", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke
        .mockResolvedValueOnce(true)    // path_exists
        .mockRejectedValueOnce(new Error("not a directory"))  // read_directory (isDirectory check)
        .mockResolvedValueOnce(undefined) // create_directory (trash dir)
        .mockResolvedValueOnce(undefined); // rename_path

      const manager = getUndoManager();
      const result = await manager.prepareFileDeleteUndo("/test/file.txt");
      expect(result).not.toBeNull();
      expect(result!.originalPath).toBe("/test/file.txt");
      expect(result!.trashPath).toContain("/mock-app-data/trash/");
      expect(result!.wasDirectory).toBe(false);
    });
  });

  // ==========================================================================
  // prepareDirectoryCreateUndo
  // ==========================================================================
  describe("prepareDirectoryCreateUndo", () => {
    it("should return null when not in Tauri", async () => {
      const manager = getUndoManager();
      const result = await manager.prepareDirectoryCreateUndo("/test/dir");
      expect(result).toBeNull();
    });

    it("should return null when directory already exists (Tauri)", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValueOnce(true);  // path_exists

      const manager = getUndoManager();
      const result = await manager.prepareDirectoryCreateUndo("/test/dir");
      expect(result).toBeNull();
    });

    it("should return undo data when directory does not exist (Tauri)", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValueOnce(false);  // path_exists

      const manager = getUndoManager();
      const result = await manager.prepareDirectoryCreateUndo("/test/new-dir");
      expect(result).not.toBeNull();
      expect(result!.path).toBe("/test/new-dir");
      expect(result!.wasEmpty).toBe(true);
    });
  });

  // ==========================================================================
  // prepareClipboardWriteUndo
  // ==========================================================================
  describe("prepareClipboardWriteUndo", () => {
    it("should return null when not in Tauri", async () => {
      const manager = getUndoManager();
      const result = await manager.prepareClipboardWriteUndo();
      expect(result).toBeNull();
    });

    it("should return previous clipboard content (Tauri)", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValueOnce("previous clipboard");

      const manager = getUndoManager();
      const result = await manager.prepareClipboardWriteUndo();
      expect(result).not.toBeNull();
      expect(result!.previousContent).toBe("previous clipboard");
    });

    it("should return empty string on clipboard read error (Tauri)", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockRejectedValueOnce(new Error("clipboard error"));

      const manager = getUndoManager();
      const result = await manager.prepareClipboardWriteUndo();
      expect(result).not.toBeNull();
      expect(result!.previousContent).toBe("");
    });
  });

  // ==========================================================================
  // executeUndo
  // ==========================================================================
  describe("executeUndo", () => {
    it("should return false for non-existent operation", async () => {
      const manager = getUndoManager();
      const result = await manager.executeUndo("nonexistent-id");
      expect(result).toBe(false);
    });

    it("should return false if not in Tauri", async () => {
      const manager = getUndoManager();
      const id = await manager.registerUndo("tool-1", "file_write", {
        path: "/test.txt",
        originalContent: "hello",
      });
      const result = await manager.executeUndo(id);
      expect(result).toBe(false);
    });

    it("should execute file_write undo by deleting file that didn't exist before (Tauri)", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValue(undefined);

      const manager = getUndoManager();
      const id = await manager.registerUndo("tool-1", "file_write", {
        path: "/test.txt",
        originalContent: null,
      });

      const result = await manager.executeUndo(id);
      expect(result).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith("delete_path", { path: "/test.txt" });

      const op = manager.getUndoOperation("tool-1");
      expect(op!.status).toBe("executed");
    });

    it("should execute file_write undo by restoring original content (Tauri)", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValue(undefined);

      const manager = getUndoManager();
      const id = await manager.registerUndo("tool-1", "file_write", {
        path: "/test.txt",
        originalContent: "original content",
      });

      const result = await manager.executeUndo(id);
      expect(result).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith("write_file", {
        path: "/test.txt",
        content: "original content",
      });
    });

    it("should execute file_delete undo by moving from trash (Tauri)", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValue(undefined);

      const manager = getUndoManager();
      const id = await manager.registerUndo("tool-1", "file_delete", {
        originalPath: "/test/file.txt",
        trashPath: "/trash/123_file.txt",
        wasDirectory: false,
      });

      const result = await manager.executeUndo(id);
      expect(result).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith("rename_path", {
        oldPath: "/trash/123_file.txt",
        newPath: "/test/file.txt",
      });
    });

    it("should execute directory_create undo by deleting empty dir (Tauri)", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke
        .mockResolvedValueOnce([])       // read_directory (isDirectoryEmpty)
        .mockResolvedValueOnce(undefined); // delete_path

      const manager = getUndoManager();
      const id = await manager.registerUndo("tool-1", "directory_create", {
        path: "/test/new-dir",
        wasEmpty: true,
      });

      const result = await manager.executeUndo(id);
      expect(result).toBe(true);
    });

    it("should fail directory_create undo if directory is no longer empty (Tauri)", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValueOnce([{ name: "some-file.txt" }]); // read_directory

      const manager = getUndoManager();
      const id = await manager.registerUndo("tool-1", "directory_create", {
        path: "/test/new-dir",
        wasEmpty: true,
      });

      const result = await manager.executeUndo(id);
      expect(result).toBe(false);

      const op = manager.getUndoOperation("tool-1");
      expect(op!.status).toBe("failed");
    });

    it("should execute clipboard_write undo (Tauri)", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValue(undefined);

      const manager = getUndoManager();
      const id = await manager.registerUndo("tool-1", "clipboard_write", {
        previousContent: "old clipboard",
      });

      const result = await manager.executeUndo(id);
      expect(result).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith("write_clipboard", {
        content: "old clipboard",
      });
    });

    it("should not execute if operation is already executed", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValue(undefined);

      const manager = getUndoManager();
      const id = await manager.registerUndo("tool-1", "file_write", {
        path: "/test.txt",
        originalContent: null,
      });

      await manager.executeUndo(id);
      mockInvoke.mockClear();

      const result = await manager.executeUndo(id);
      expect(result).toBe(false);
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("should not execute if operation is expired", async () => {
      mockIsTauri.mockReturnValue(true);

      const manager = getUndoManager();
      const id = await manager.registerUndo("tool-1", "file_write", {
        path: "/test.txt",
        originalContent: null,
      });

      // Manually expire
      const op = manager.getUndoOperation("tool-1");
      op!.expiresAt = new Date(Date.now() - 1000);

      const result = await manager.executeUndo(id);
      expect(result).toBe(false);
      expect(op!.status).toBe("expired");
    });

    it("should set status to 'failed' when invoke throws", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockRejectedValue(new Error("Tauri invoke failed"));

      const manager = getUndoManager();
      const id = await manager.registerUndo("tool-1", "file_write", {
        path: "/test.txt",
        originalContent: "content",
      });

      const result = await manager.executeUndo(id);
      expect(result).toBe(false);

      const op = manager.getUndoOperation("tool-1");
      expect(op!.status).toBe("failed");
    });
  });

  // ==========================================================================
  // executeUndoByToolCallId
  // ==========================================================================
  describe("executeUndoByToolCallId", () => {
    it("should return false for unregistered tool call", async () => {
      const manager = getUndoManager();
      const result = await manager.executeUndoByToolCallId("nonexistent");
      expect(result).toBe(false);
    });

    it("should execute undo by tool call ID (Tauri)", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValue(undefined);

      const manager = getUndoManager();
      await manager.registerUndo("tool-1", "file_write", {
        path: "/test.txt",
        originalContent: null,
      });

      const result = await manager.executeUndoByToolCallId("tool-1");
      expect(result).toBe(true);
    });
  });

  // ==========================================================================
  // executeUndo — unknown operation type
  // ==========================================================================
  describe("executeUndo — unknown operation type", () => {
    it("should return false for unknown operation type", async () => {
      mockIsTauri.mockReturnValue(true);

      const manager = getUndoManager();
      const id = await manager.registerUndo(
        "tool-unknown",
        "some_future_type" as never,
        {}
      );

      const result = await manager.executeUndo(id);
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // executeUndo — directory_create with wasEmpty=false (no-op)
  // ==========================================================================
  describe("executeUndo — directory_create wasEmpty=false", () => {
    it("should succeed immediately when wasEmpty is false", async () => {
      mockIsTauri.mockReturnValue(true);

      const manager = getUndoManager();
      const id = await manager.registerUndo("tool-dir", "directory_create", {
        path: "/test/dir",
        wasEmpty: false,
      });

      const result = await manager.executeUndo(id);
      // wasEmpty is false so the code never tries to delete — just succeeds
      expect(result).toBe(true);
    });
  });

  // ==========================================================================
  // isDirectoryEmpty edge — read_directory throws
  // ==========================================================================
  describe("executeUndo — isDirectoryEmpty error falls back to true", () => {
    it("should treat directory as empty when read_directory throws", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke
        .mockRejectedValueOnce(new Error("read_directory error"))  // isDirectoryEmpty → catch → true
        .mockResolvedValueOnce(undefined); // delete_path

      const manager = getUndoManager();
      const id = await manager.registerUndo("tool-dce", "directory_create", {
        path: "/test/some-dir",
        wasEmpty: true,
      });

      const result = await manager.executeUndo(id);
      expect(result).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith("delete_path", { path: "/test/some-dir" });
    });
  });

  // ==========================================================================
  // prepareFileDeleteUndo — directory path
  // ==========================================================================
  describe("prepareFileDeleteUndo — directory", () => {
    it("should mark wasDirectory=true when path is a directory", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke
        .mockResolvedValueOnce(true)       // path_exists
        .mockResolvedValueOnce([])          // read_directory (isDirectory check — success = is directory)
        .mockResolvedValueOnce(undefined)   // create_directory (trash dir)
        .mockResolvedValueOnce(undefined);  // rename_path

      const manager = getUndoManager();
      const result = await manager.prepareFileDeleteUndo("/test/my-dir");
      expect(result).not.toBeNull();
      expect(result!.wasDirectory).toBe(true);
      expect(result!.originalPath).toBe("/test/my-dir");
    });

    it("should return null and log error when rename_path throws", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke
        .mockResolvedValueOnce(true)       // path_exists
        .mockRejectedValueOnce(new Error("not dir")) // isDirectory
        .mockResolvedValueOnce(undefined)  // create_directory
        .mockRejectedValueOnce(new Error("rename failed")); // rename_path

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const manager = getUndoManager();
      const result = await manager.prepareFileDeleteUndo("/test/file.txt");
      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });
  });

  // ==========================================================================
  // prepareDirectoryCreateUndo — invoke error
  // ==========================================================================
  describe("prepareDirectoryCreateUndo — invoke error", () => {
    it("should return null when path_exists throws", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockRejectedValueOnce(new Error("invoke error"));

      const manager = getUndoManager();
      const result = await manager.prepareDirectoryCreateUndo("/test/dir");
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // getAvailableOperations — excludes non-available statuses
  // ==========================================================================
  describe("getAvailableOperations — executed/failed excluded", () => {
    it("should exclude executed operations", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValue(undefined);

      const manager = getUndoManager();
      await manager.registerUndo("tool-1", "file_write", {
        path: "/test.txt",
        originalContent: null,
      });
      await manager.registerUndo("tool-2", "file_write", {
        path: "/test2.txt",
        originalContent: null,
      });

      // Execute one of them
      await manager.executeUndoByToolCallId("tool-1");

      const ops = manager.getAvailableOperations();
      expect(ops).toHaveLength(1);
      expect(ops[0].toolCallId).toBe("tool-2");
    });
  });

  // ==========================================================================
  // clear
  // ==========================================================================
  describe("clear", () => {
    it("should remove all operations", async () => {
      const manager = getUndoManager();
      await manager.registerUndo("tool-1", "file_write", {});
      await manager.registerUndo("tool-2", "file_delete", {});

      manager.clear();

      expect(manager.isUndoAvailable("tool-1")).toBe(false);
      expect(manager.isUndoAvailable("tool-2")).toBe(false);
      expect(manager.getAvailableOperations()).toHaveLength(0);
    });
  });
});
