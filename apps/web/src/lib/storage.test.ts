import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Provide a working localStorage for the virtual FS used by storage.ts
// The jsdom environment may not have a fully functional localStorage.
// ============================================================================
const store: Record<string, string> = {};
const localStorageMock: Storage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => {
    store[key] = String(value);
  },
  removeItem: (key: string) => {
    delete store[key];
  },
  clear: () => {
    for (const key of Object.keys(store)) delete store[key];
  },
  get length() {
    return Object.keys(store).length;
  },
  key: (index: number) => Object.keys(store)[index] ?? null,
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });

const mockInvoke = vi.fn();
const mockIsTauri = vi.fn(() => false);

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  isTauri: () => mockIsTauri(),
}));

// Dynamic import so mocks are applied before module loads
async function importStorage() {
  return import("./storage");
}

// Helper to build a localStorage-backed virtual FS state
function setVFS(entries: Record<string, { isDir: boolean; content?: string }>) {
  localStorageMock.setItem("sapio:vfs", JSON.stringify(entries));
}

function getVFS(): Record<string, { isDir: boolean; content?: string }> {
  const stored = localStorageMock.getItem("sapio:vfs");
  return stored ? JSON.parse(stored) : {};
}

describe("storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauri.mockReturnValue(false);
    mockInvoke.mockResolvedValue(undefined);
    localStorageMock.clear();
  });

  // ==========================================================================
  // isTauri re-export
  // ==========================================================================
  describe("isTauri", () => {
    it("re-exports isTauri from @tauri-apps/api/core", async () => {
      const { isTauri } = await importStorage();
      expect(isTauri()).toBe(false);
      mockIsTauri.mockReturnValue(true);
      expect(isTauri()).toBe(true);
    });
  });

  // ==========================================================================
  // getAppDataDir
  // ==========================================================================
  describe("getAppDataDir", () => {
    it("returns virtual path when not in Tauri", async () => {
      const { getAppDataDir } = await importStorage();
      const dir = await getAppDataDir();
      expect(dir).toBe("/sapio-data");
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("invokes get_app_data_dir when in Tauri", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValue("/Users/test/.sapio");
      const { getAppDataDir } = await importStorage();
      const dir = await getAppDataDir();
      expect(dir).toBe("/Users/test/.sapio");
      expect(mockInvoke).toHaveBeenCalledWith("get_app_data_dir");
    });
  });

  // ==========================================================================
  // initAppDataDir
  // ==========================================================================
  describe("initAppDataDir", () => {
    it("creates default directories in virtual FS when not in Tauri", async () => {
      const { initAppDataDir } = await importStorage();
      await initAppDataDir();
      const vfs = getVFS();

      // Check all required directories
      expect(vfs["/sapio-data"]).toEqual({ isDir: true });
      expect(vfs["/sapio-data/chats"]).toEqual({ isDir: true });
      expect(vfs["/sapio-data/tasks"]).toEqual({ isDir: true });
      expect(vfs["/sapio-data/agents"]).toEqual({ isDir: true });
      expect(vfs["/sapio-data/scheduler"]).toEqual({ isDir: true });
      expect(vfs["/sapio-data/prompts"]).toEqual({ isDir: true });
      expect(vfs["/sapio-data/memories"]).toEqual({ isDir: true });
      expect(vfs["/sapio-data/skills"]).toEqual({ isDir: true });
      expect(vfs["/sapio-data/workflows"]).toEqual({ isDir: true });
      expect(vfs["/sapio-data/logs"]).toEqual({ isDir: true });
    });

    it("creates default agent file when not already present", async () => {
      const { initAppDataDir } = await importStorage();
      await initAppDataDir();
      const vfs = getVFS();
      expect(vfs["/sapio-data/agents/default.md"]).toBeDefined();
      expect(vfs["/sapio-data/agents/default.md"].isDir).toBe(false);
      expect(vfs["/sapio-data/agents/default.md"].content).toContain("name: default");
      expect(vfs["/sapio-data/agents/default.md"].content).toContain("model: claude-sonnet-4-20250514");
    });

    it("does not overwrite existing default agent file", async () => {
      // Pre-populate the agent file
      const customContent = "---\nname: custom\n---\nCustom prompt";
      setVFS({
        "/sapio-data": { isDir: true },
        "/sapio-data/agents": { isDir: true },
        "/sapio-data/agents/default.md": { isDir: false, content: customContent },
      });

      const { initAppDataDir } = await importStorage();
      await initAppDataDir();
      const vfs = getVFS();
      expect(vfs["/sapio-data/agents/default.md"].content).toBe(customContent);
    });

    it("invokes init_app_data_dir when in Tauri", async () => {
      mockIsTauri.mockReturnValue(true);
      const { initAppDataDir } = await importStorage();
      await initAppDataDir();
      expect(mockInvoke).toHaveBeenCalledWith("init_app_data_dir");
    });
  });

  // ==========================================================================
  // File operations (web fallback path)
  // ==========================================================================
  describe("readFile / writeFile (web)", () => {
    it("writeFile stores content and readFile retrieves it", async () => {
      const { writeFile, readFile } = await importStorage();
      await writeFile("/test/file.txt", "hello world");
      const content = await readFile("/test/file.txt");
      expect(content).toBe("hello world");
    });

    it("readFile throws when file does not exist", async () => {
      const { readFile } = await importStorage();
      await expect(readFile("/nonexistent")).rejects.toThrow("File not found");
    });

    it("readFile throws when path is a directory", async () => {
      const { createDirectory, readFile } = await importStorage();
      await createDirectory("/mydir");
      await expect(readFile("/mydir")).rejects.toThrow("File not found");
    });

    it("readFile returns empty string for file with no content", async () => {
      setVFS({ "/empty": { isDir: false } });
      const { readFile } = await importStorage();
      const content = await readFile("/empty");
      expect(content).toBe("");
    });

    it("writeFile auto-creates parent directories", async () => {
      const { writeFile } = await importStorage();
      await writeFile("/deep/nested/dir/file.txt", "content");
      const vfs = getVFS();
      expect(vfs["/deep"]).toEqual({ isDir: true });
      expect(vfs["/deep/nested"]).toEqual({ isDir: true });
      expect(vfs["/deep/nested/dir"]).toEqual({ isDir: true });
      expect(vfs["/deep/nested/dir/file.txt"].content).toBe("content");
    });
  });

  describe("readFile / writeFile (Tauri)", () => {
    it("writeFile invokes write_file command", async () => {
      mockIsTauri.mockReturnValue(true);
      const { writeFile } = await importStorage();
      await writeFile("/path/file.txt", "data");
      expect(mockInvoke).toHaveBeenCalledWith("write_file", {
        path: "/path/file.txt",
        content: "data",
      });
    });

    it("readFile invokes read_file command", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValue("file contents");
      const { readFile } = await importStorage();
      const result = await readFile("/path/file.txt");
      expect(result).toBe("file contents");
      expect(mockInvoke).toHaveBeenCalledWith("read_file", { path: "/path/file.txt" });
    });
  });

  // ==========================================================================
  // createDirectory
  // ==========================================================================
  describe("createDirectory", () => {
    it("creates directory in virtual FS (web)", async () => {
      const { createDirectory } = await importStorage();
      await createDirectory("/a/b/c");
      const vfs = getVFS();
      expect(vfs["/a"]).toEqual({ isDir: true });
      expect(vfs["/a/b"]).toEqual({ isDir: true });
      expect(vfs["/a/b/c"]).toEqual({ isDir: true });
    });

    it("invokes create_directory in Tauri", async () => {
      mockIsTauri.mockReturnValue(true);
      const { createDirectory } = await importStorage();
      await createDirectory("/a/b");
      expect(mockInvoke).toHaveBeenCalledWith("create_directory", { path: "/a/b" });
    });
  });

  // ==========================================================================
  // pathExists
  // ==========================================================================
  describe("pathExists", () => {
    it("returns true for existing path (web)", async () => {
      const { pathExists, createDirectory } = await importStorage();
      await createDirectory("/exists");
      expect(await pathExists("/exists")).toBe(true);
    });

    it("returns false for non-existing path (web)", async () => {
      const { pathExists } = await importStorage();
      expect(await pathExists("/nope")).toBe(false);
    });

    it("invokes path_exists in Tauri", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValue(true);
      const { pathExists } = await importStorage();
      const result = await pathExists("/some/path");
      expect(result).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith("path_exists", { path: "/some/path" });
    });
  });

  // ==========================================================================
  // deletePath
  // ==========================================================================
  describe("deletePath", () => {
    it("removes a file from virtual FS", async () => {
      const { writeFile, deletePath, pathExists } = await importStorage();
      await writeFile("/file.txt", "data");
      expect(await pathExists("/file.txt")).toBe(true);
      await deletePath("/file.txt");
      expect(await pathExists("/file.txt")).toBe(false);
    });

    it("removes a directory and all children from virtual FS", async () => {
      const { writeFile, createDirectory, deletePath, pathExists } = await importStorage();
      await createDirectory("/parent/child");
      await writeFile("/parent/child/file.txt", "data");
      await writeFile("/parent/other.txt", "data");

      await deletePath("/parent");
      expect(await pathExists("/parent")).toBe(false);
      expect(await pathExists("/parent/child")).toBe(false);
      expect(await pathExists("/parent/child/file.txt")).toBe(false);
      expect(await pathExists("/parent/other.txt")).toBe(false);
    });

    it("invokes delete_path in Tauri", async () => {
      mockIsTauri.mockReturnValue(true);
      const { deletePath } = await importStorage();
      await deletePath("/some/path");
      expect(mockInvoke).toHaveBeenCalledWith("delete_path", { path: "/some/path" });
    });
  });

  // ==========================================================================
  // readDirectory
  // ==========================================================================
  describe("readDirectory", () => {
    it("returns direct children only (web)", async () => {
      const { writeFile, createDirectory, readDirectory } = await importStorage();
      await createDirectory("/root/sub");
      await writeFile("/root/file.txt", "data");
      await writeFile("/root/sub/deep.txt", "nested");

      const entries = await readDirectory("/root");
      expect(entries).toHaveLength(2);

      const subDir = entries.find((e) => e.name === "sub");
      expect(subDir).toBeDefined();
      expect(subDir!.is_directory).toBe(true);

      const file = entries.find((e) => e.name === "file.txt");
      expect(file).toBeDefined();
      expect(file!.is_directory).toBe(false);
    });

    it("handles trailing slash in directory path", async () => {
      const { writeFile, readDirectory } = await importStorage();
      await writeFile("/root/file.txt", "data");
      const entries = await readDirectory("/root/");
      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe("file.txt");
    });

    it("returns empty array for empty directory", async () => {
      const { createDirectory, readDirectory } = await importStorage();
      await createDirectory("/empty");
      const entries = await readDirectory("/empty");
      expect(entries).toHaveLength(0);
    });

    it("invokes read_directory in Tauri", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValue([]);
      const { readDirectory } = await importStorage();
      await readDirectory("/path", 2);
      expect(mockInvoke).toHaveBeenCalledWith("read_directory", {
        path: "/path",
        max_depth: 2,
      });
    });
  });

  // ==========================================================================
  // listFiles
  // ==========================================================================
  describe("listFiles", () => {
    it("lists files with given extension, stripping it from names (web)", async () => {
      const { writeFile, listFiles } = await importStorage();
      await writeFile("/dir/a.md", "content");
      await writeFile("/dir/b.md", "content");
      await writeFile("/dir/c.txt", "content");

      const result = await listFiles("/dir", "md");
      expect(result).toEqual(expect.arrayContaining(["a", "b"]));
      expect(result).not.toContain("c");
    });

    it("lists all non-directory files when no extension is given", async () => {
      const { writeFile, listFiles } = await importStorage();
      await writeFile("/dir/a.md", "");
      await writeFile("/dir/b.txt", "");
      const result = await listFiles("/dir");
      expect(result).toHaveLength(2);
    });

    it("invokes list_files in Tauri", async () => {
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValue(["file1", "file2"]);
      const { listFiles } = await importStorage();
      const result = await listFiles("/dir", "yaml");
      expect(result).toEqual(["file1", "file2"]);
      expect(mockInvoke).toHaveBeenCalledWith("list_files", {
        dir: "/dir",
        extension: "yaml",
      });
    });
  });

  // ==========================================================================
  // renamePath
  // ==========================================================================
  describe("renamePath", () => {
    it("renames a file in virtual FS (web)", async () => {
      const { writeFile, renamePath, readFile, pathExists } = await importStorage();
      await writeFile("/file.txt", "content");
      await renamePath("/file.txt", "/renamed.txt");

      expect(await pathExists("/file.txt")).toBe(false);
      expect(await readFile("/renamed.txt")).toBe("content");
    });

    it("renames a directory and all its children (web)", async () => {
      const { writeFile, createDirectory, renamePath, readFile, pathExists } = await importStorage();
      await createDirectory("/old/sub");
      await writeFile("/old/sub/file.txt", "content");

      await renamePath("/old", "/new");

      expect(await pathExists("/old")).toBe(false);
      expect(await pathExists("/old/sub")).toBe(false);
      expect(await pathExists("/new")).toBe(true);
      expect(await pathExists("/new/sub")).toBe(true);
      expect(await readFile("/new/sub/file.txt")).toBe("content");
    });

    it("invokes rename_path in Tauri", async () => {
      mockIsTauri.mockReturnValue(true);
      const { renamePath } = await importStorage();
      await renamePath("/old", "/new");
      expect(mockInvoke).toHaveBeenCalledWith("rename_path", {
        oldPath: "/old",
        newPath: "/new",
      });
    });
  });

  // ==========================================================================
  // loadChatByPath
  // ==========================================================================
  describe("loadChatByPath", () => {
    const sampleChat = {
      id: "chat-1",
      title: "Test Chat",
      model: "claude-sonnet-4-20250514",
      agentId: null,
      messages: [],
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    };

    it("returns null when path does not exist", async () => {
      const { loadChatByPath } = await importStorage();
      const result = await loadChatByPath("/nonexistent.json");
      expect(result).toBeNull();
    });

    it("loads a JSON chat file", async () => {
      const { writeFile, loadChatByPath } = await importStorage();
      await writeFile("/chats/chat-1.json", JSON.stringify(sampleChat));
      const result = await loadChatByPath("/chats/chat-1.json");
      expect(result).toEqual(sampleChat);
    });

    it("loads a YAML chat file", async () => {
      const YAML = await import("yaml");
      const { writeFile, loadChatByPath } = await importStorage();
      await writeFile("/chats/chat-1.yaml", YAML.stringify(sampleChat));
      const result = await loadChatByPath("/chats/chat-1.yaml");
      expect(result).toEqual(sampleChat);
    });

    it("returns null for malformed JSON", async () => {
      const { writeFile, loadChatByPath } = await importStorage();
      await writeFile("/chats/bad.json", "not valid json{{{");
      const result = await loadChatByPath("/chats/bad.json");
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // Chat folder operations
  // ==========================================================================
  describe("createChatFolder", () => {
    it("creates a folder with _meta.yaml in chats directory", async () => {
      const { initAppDataDir, createChatFolder, readFile } = await importStorage();
      await initAppDataDir();

      const path = await createChatFolder("my-folder");
      expect(path).toBe("/sapio-data/chats/my-folder");

      const metaContent = await readFile(`${path}/_meta.yaml`);
      const YAML = await import("yaml");
      const meta = YAML.parse(metaContent);
      expect(meta.isPinned).toBe(false);
      expect(meta.createdAt).toBeDefined();
    });

    it("creates a nested folder when parentPath is provided", async () => {
      const { initAppDataDir, createChatFolder } = await importStorage();
      await initAppDataDir();

      const parentPath = await createChatFolder("parent");
      const childPath = await createChatFolder("child", parentPath);
      expect(childPath).toBe("/sapio-data/chats/parent/child");
    });
  });

  describe("saveFolderMeta / loadFolderMeta", () => {
    it("saves and loads folder metadata", async () => {
      const { createDirectory, saveFolderMeta, loadFolderMeta } = await importStorage();
      await createDirectory("/folder");

      const meta = { isPinned: true, createdAt: "2025-01-01T00:00:00.000Z" };
      await saveFolderMeta("/folder", meta);

      const loaded = await loadFolderMeta("/folder");
      expect(loaded).toEqual(meta);
    });

    it("returns null when meta file does not exist", async () => {
      const { loadFolderMeta } = await importStorage();
      const result = await loadFolderMeta("/nonexistent");
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // saveChatToFolder
  // ==========================================================================
  describe("saveChatToFolder", () => {
    const sampleChat = {
      id: "chat-1",
      title: "Test",
      model: "claude-sonnet-4-20250514",
      agentId: null,
      messages: [],
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    };

    it("saves chat as JSON to the specified folder", async () => {
      const { initAppDataDir, createChatFolder, saveChatToFolder, readFile } = await importStorage();
      await initAppDataDir();
      const folderPath = await createChatFolder("conversations");

      await saveChatToFolder(sampleChat, folderPath);
      const content = await readFile(`${folderPath}/chat-1.json`);
      expect(JSON.parse(content)).toEqual(sampleChat);
    });

    it("saves chat to root chats directory when no folderPath", async () => {
      const { initAppDataDir, saveChatToFolder, readFile } = await importStorage();
      await initAppDataDir();

      await saveChatToFolder(sampleChat);
      const content = await readFile("/sapio-data/chats/chat-1.json");
      expect(JSON.parse(content)).toEqual(sampleChat);
    });
  });

  // ==========================================================================
  // loadChatTree
  // ==========================================================================
  describe("loadChatTree", () => {
    it("returns empty array when chats directory does not exist", async () => {
      const { loadChatTree } = await importStorage();
      const tree = await loadChatTree();
      expect(tree).toEqual([]);
    });

    it("loads a flat list of chats", async () => {
      const { initAppDataDir, saveChatToFolder, loadChatTree } = await importStorage();
      await initAppDataDir();

      const chat1 = {
        id: "c1",
        title: "Chat One",
        model: "claude",
        agentId: null,
        messages: [],
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-02T00:00:00Z",
      };
      const chat2 = {
        id: "c2",
        title: "Chat Two",
        model: "claude",
        agentId: null,
        messages: [],
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-03T00:00:00Z",
      };

      await saveChatToFolder(chat1);
      await saveChatToFolder(chat2);

      const tree = await loadChatTree();
      expect(tree).toHaveLength(2);
      expect(tree.map((n) => n.id)).toEqual(expect.arrayContaining(["c1", "c2"]));
      expect(tree[0].type).toBe("chat");
    });

    it("loads chats nested in folders with metadata", async () => {
      const { initAppDataDir, createChatFolder, saveChatToFolder, saveFolderMeta, loadChatTree } =
        await importStorage();
      await initAppDataDir();

      const folderPath = await createChatFolder("pinned-folder");
      await saveFolderMeta(folderPath, {
        isPinned: true,
        createdAt: "2025-01-01T00:00:00Z",
      });

      const chat = {
        id: "c1",
        title: "Nested Chat",
        model: "claude",
        agentId: null,
        messages: [],
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-02T00:00:00Z",
      };
      await saveChatToFolder(chat, folderPath);

      const tree = await loadChatTree();
      const folder = tree.find((n) => n.type === "folder");
      expect(folder).toBeDefined();
      expect(folder!.isPinned).toBe(true);
      expect(folder!.children).toHaveLength(1);
      expect(folder!.children![0].id).toBe("c1");
    });

    it("sorts pinned items first, then folders before chats", async () => {
      const { initAppDataDir, createChatFolder, saveChatToFolder, saveFolderMeta, loadChatTree } =
        await importStorage();
      await initAppDataDir();

      // Create a non-pinned folder
      await createChatFolder("alpha-folder");

      // Create a pinned folder
      const folder2 = await createChatFolder("beta-folder");
      await saveFolderMeta(folder2, {
        isPinned: true,
        createdAt: "2025-01-01T00:00:00Z",
      });

      // Create a chat at root
      await saveChatToFolder({
        id: "root-chat",
        title: "Root Chat",
        model: "claude",
        agentId: null,
        messages: [],
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-02T00:00:00Z",
      });

      const tree = await loadChatTree();
      // Pinned folder should come first
      expect(tree[0].name).toBe("beta-folder");
      expect(tree[0].isPinned).toBe(true);
      // Then unpinned folder
      expect(tree[1].name).toBe("alpha-folder");
      expect(tree[1].type).toBe("folder");
      // Then chat
      expect(tree[2].type).toBe("chat");
    });

    it("skips _meta.yaml and _meta.json files as chat entries", async () => {
      const YAML = await import("yaml");
      const { initAppDataDir, writeFile, loadChatTree } = await importStorage();
      await initAppDataDir();

      // Write a _meta.yaml - should not appear as a chat
      await writeFile(
        "/sapio-data/chats/_meta.yaml",
        YAML.stringify({ isPinned: false, createdAt: "2025-01-01T00:00:00Z" }),
      );

      const tree = await loadChatTree();
      expect(tree).toHaveLength(0);
    });

    it("skips malformed chat JSON files gracefully", async () => {
      const { initAppDataDir, writeFile, loadChatTree } = await importStorage();
      await initAppDataDir();
      await writeFile("/sapio-data/chats/bad.json", "not valid json{{{");
      const tree = await loadChatTree();
      expect(tree).toHaveLength(0);
    });

    it("loads YAML chat files (.yaml extension)", async () => {
      const YAML = await import("yaml");
      const { initAppDataDir, writeFile, loadChatTree } = await importStorage();
      await initAppDataDir();

      const chatData = {
        id: "yaml-chat",
        title: "YAML Chat",
        model: "claude",
        agentId: null,
        messages: [],
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-02T00:00:00Z",
      };
      await writeFile("/sapio-data/chats/yaml-chat.yaml", YAML.stringify(chatData));

      const tree = await loadChatTree();
      expect(tree).toHaveLength(1);
      expect(tree[0].id).toBe("yaml-chat");
      expect(tree[0].type).toBe("chat");
    });

    it("skips malformed YAML chat files gracefully", async () => {
      const { initAppDataDir, writeFile, loadChatTree } = await importStorage();
      await initAppDataDir();
      await writeFile("/sapio-data/chats/bad.yaml", ":\n  :\n  invalid: [}{");
      const tree = await loadChatTree();
      expect(tree).toHaveLength(0);
    });
  });

  // ==========================================================================
  // deleteChatByPath / deleteChatFolder
  // ==========================================================================
  describe("deleteChatByPath / deleteChatFolder", () => {
    it("deletes a chat file by path", async () => {
      const { initAppDataDir, saveChatToFolder, deleteChatByPath, pathExists } = await importStorage();
      await initAppDataDir();

      const chat = {
        id: "c1",
        title: "T",
        model: "m",
        agentId: null,
        messages: [],
        createdAt: "",
        updatedAt: "",
      };
      await saveChatToFolder(chat);

      expect(await pathExists("/sapio-data/chats/c1.json")).toBe(true);
      await deleteChatByPath("/sapio-data/chats/c1.json");
      expect(await pathExists("/sapio-data/chats/c1.json")).toBe(false);
    });

    it("deletes a chat folder and all contents", async () => {
      const { initAppDataDir, createChatFolder, saveChatToFolder, deleteChatFolder, pathExists } =
        await importStorage();
      await initAppDataDir();

      const folder = await createChatFolder("to-delete");
      await saveChatToFolder(
        { id: "c1", title: "T", model: "m", agentId: null, messages: [], createdAt: "", updatedAt: "" },
        folder,
      );

      await deleteChatFolder(folder);
      expect(await pathExists(folder)).toBe(false);
    });
  });

  // ==========================================================================
  // renameChat / renameChatFolder
  // ==========================================================================
  describe("renameChat / renameChatFolder", () => {
    it("renames a chat file", async () => {
      const { initAppDataDir, saveChatToFolder, renameChat, pathExists } = await importStorage();
      await initAppDataDir();

      const chat = {
        id: "old-id",
        title: "T",
        model: "m",
        agentId: null,
        messages: [],
        createdAt: "",
        updatedAt: "",
      };
      await saveChatToFolder(chat);

      const newPath = await renameChat("/sapio-data/chats/old-id.json", "new-id");
      expect(newPath).toBe("/sapio-data/chats/new-id.json");
      expect(await pathExists("/sapio-data/chats/old-id.json")).toBe(false);
      expect(await pathExists("/sapio-data/chats/new-id.json")).toBe(true);
    });

    it("renames a chat folder", async () => {
      const { initAppDataDir, createChatFolder, renameChatFolder, pathExists } = await importStorage();
      await initAppDataDir();

      const folder = await createChatFolder("old-name");
      const newPath = await renameChatFolder(folder, "new-name");
      expect(newPath).toBe("/sapio-data/chats/new-name");
      expect(await pathExists(folder)).toBe(false);
      expect(await pathExists(newPath)).toBe(true);
    });
  });

  // ==========================================================================
  // Agent storage
  // ==========================================================================
  describe("agent storage", () => {
    it("saves and loads an agent with frontmatter", async () => {
      const { initAppDataDir, saveAgent, loadAgent } = await importStorage();
      await initAppDataDir();

      const agent = {
        name: "coder",
        model: "claude-sonnet-4-20250514",
        temperature: 0.5,
        systemPrompt: "You are a coding assistant.",
      };
      await saveAgent(agent);

      const loaded = await loadAgent("coder");
      expect(loaded).not.toBeNull();
      expect(loaded!.name).toBe("coder");
      expect(loaded!.model).toBe("claude-sonnet-4-20250514");
      expect(loaded!.temperature).toBe(0.5);
      expect(loaded!.systemPrompt).toBe("You are a coding assistant.");
    });

    it("loadAgent returns null when agent does not exist", async () => {
      const { initAppDataDir, loadAgent } = await importStorage();
      await initAppDataDir();
      const result = await loadAgent("nonexistent");
      expect(result).toBeNull();
    });

    it("loadAgent uses defaults for missing frontmatter fields", async () => {
      const { initAppDataDir, writeFile, loadAgent } = await importStorage();
      await initAppDataDir();

      // Write a markdown file with minimal frontmatter
      await writeFile("/sapio-data/agents/minimal.md", "---\n---\nJust a prompt.");
      const loaded = await loadAgent("minimal");
      expect(loaded).not.toBeNull();
      expect(loaded!.name).toBe("minimal"); // falls back to name param
      expect(loaded!.model).toBe("claude-sonnet-4-20250514"); // default
      expect(loaded!.temperature).toBe(0.7); // default
      expect(loaded!.systemPrompt).toBe("Just a prompt.");
    });

    it("lists all agents", async () => {
      const { initAppDataDir, saveAgent, listAgents } = await importStorage();
      await initAppDataDir();

      await saveAgent({ name: "a1", model: "m", temperature: 0.5, systemPrompt: "p" });
      await saveAgent({ name: "a2", model: "m", temperature: 0.5, systemPrompt: "p" });

      const agents = await listAgents();
      expect(agents).toEqual(expect.arrayContaining(["a1", "a2"]));
    });

    it("deletes an agent", async () => {
      const { initAppDataDir, saveAgent, deleteAgent, loadAgent } = await importStorage();
      await initAppDataDir();

      await saveAgent({ name: "to-delete", model: "m", temperature: 0.5, systemPrompt: "p" });
      expect(await loadAgent("to-delete")).not.toBeNull();

      await deleteAgent("to-delete");
      expect(await loadAgent("to-delete")).toBeNull();
    });
  });

  // ==========================================================================
  // Task storage
  // ==========================================================================
  describe("task storage", () => {
    it("creates a task folder with folder.yaml", async () => {
      const YAML = await import("yaml");
      const { initAppDataDir, createTaskFolder, readFile, pathExists } = await importStorage();
      await initAppDataDir();

      const path = await createTaskFolder("My Backlog");
      expect(await pathExists(path)).toBe(true);
      expect(await pathExists(`${path}/folder.yaml`)).toBe(true);

      const content = await readFile(`${path}/folder.yaml`);
      const data = YAML.parse(content);
      expect(data.name).toBe("My Backlog");
      expect(data.isPinned).toBe(false);
      expect(data.tasks).toEqual([]);
    });

    it("saves and loads a task folder", async () => {
      const { initAppDataDir, createTaskFolder, saveTaskFolder, loadTaskFolder } = await importStorage();
      await initAppDataDir();

      const path = await createTaskFolder("Backlog");
      const folderData = {
        id: "uuid",
        name: "Updated Backlog",
        isPinned: true,
        tasks: [
          {
            id: "t1",
            title: "Task 1",
            description: "Do something",
            agent: "default",
            outputFolder: "/output",
            resultStatus: null,
            stage: "backlog" as const,
            createdAt: "2025-01-01T00:00:00Z",
            updatedAt: "2025-01-01T00:00:00Z",
          },
        ],
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      };

      await saveTaskFolder(folderData, path);
      const loaded = await loadTaskFolder(path);
      expect(loaded).not.toBeNull();
      expect(loaded!.name).toBe("Updated Backlog");
      expect(loaded!.tasks).toHaveLength(1);
    });

    it("loadTaskFolder returns null when folder.yaml does not exist", async () => {
      const { loadTaskFolder } = await importStorage();
      const result = await loadTaskFolder("/nonexistent");
      expect(result).toBeNull();
    });

    it("loadTaskTree returns empty when tasks dir does not exist", async () => {
      const { loadTaskTree } = await importStorage();
      const result = await loadTaskTree();
      expect(result).toEqual([]);
    });

    it("loadTaskTree loads folders with tasks", async () => {
      const YAML = await import("yaml");
      const { initAppDataDir, createDirectory, writeFile, loadTaskTree } = await importStorage();
      await initAppDataDir();

      // Create a task folder manually
      const folderId = "test-folder-id";
      await createDirectory(`/sapio-data/tasks/${folderId}`);
      await writeFile(
        `/sapio-data/tasks/${folderId}/folder.yaml`,
        YAML.stringify({
          id: folderId,
          name: "Test Folder",
          isPinned: true,
          tasks: [{ id: "t1", title: "Task 1" }],
          createdAt: "2025-01-01T00:00:00Z",
          updatedAt: "2025-01-02T00:00:00Z",
        }),
      );

      const tree = await loadTaskTree();
      expect(tree).toHaveLength(1);
      expect(tree[0].name).toBe("Test Folder");
      expect(tree[0].isPinned).toBe(true);
      expect(tree[0].tasks).toHaveLength(1);
    });

    it("loadTaskTree sorts pinned folders first", async () => {
      const YAML = await import("yaml");
      const { initAppDataDir, createDirectory, writeFile, loadTaskTree } = await importStorage();
      await initAppDataDir();

      await createDirectory("/sapio-data/tasks/f1");
      await writeFile(
        "/sapio-data/tasks/f1/folder.yaml",
        YAML.stringify({
          id: "f1",
          name: "Alpha",
          isPinned: false,
          tasks: [],
          createdAt: "2025-01-01T00:00:00Z",
          updatedAt: "2025-01-01T00:00:00Z",
        }),
      );

      await createDirectory("/sapio-data/tasks/f2");
      await writeFile(
        "/sapio-data/tasks/f2/folder.yaml",
        YAML.stringify({
          id: "f2",
          name: "Beta",
          isPinned: true,
          tasks: [],
          createdAt: "2025-01-01T00:00:00Z",
          updatedAt: "2025-01-01T00:00:00Z",
        }),
      );

      const tree = await loadTaskTree();
      expect(tree[0].name).toBe("Beta"); // pinned first
      expect(tree[1].name).toBe("Alpha");
    });

    it("loadTaskTree skips directories without folder.yaml", async () => {
      const { initAppDataDir, createDirectory, loadTaskTree } = await importStorage();
      await initAppDataDir();
      await createDirectory("/sapio-data/tasks/empty-dir");
      const tree = await loadTaskTree();
      expect(tree).toHaveLength(0);
    });

    it("loadTaskTree skips directories with malformed folder.yaml", async () => {
      const { initAppDataDir, createDirectory, writeFile, loadTaskTree } = await importStorage();
      await initAppDataDir();
      await createDirectory("/sapio-data/tasks/bad-folder");
      await writeFile("/sapio-data/tasks/bad-folder/folder.yaml", ":\n  :\n  [}{");
      const tree = await loadTaskTree();
      expect(tree).toHaveLength(0);
    });

    it("deleteTaskFolder removes the folder", async () => {
      const { initAppDataDir, createTaskFolder, deleteTaskFolder, pathExists } = await importStorage();
      await initAppDataDir();
      const path = await createTaskFolder("to-delete");
      expect(await pathExists(path)).toBe(true);
      await deleteTaskFolder(path);
      expect(await pathExists(path)).toBe(false);
    });

    it("renameTaskFolder updates the folder name in folder.yaml", async () => {
      const { initAppDataDir, createTaskFolder, renameTaskFolder, loadTaskFolder } = await importStorage();
      await initAppDataDir();
      const path = await createTaskFolder("old-name");
      await renameTaskFolder(path, "new-name");
      const loaded = await loadTaskFolder(path);
      expect(loaded!.name).toBe("new-name");
    });

    it("renameTaskFolder does nothing when folder does not exist", async () => {
      const { renameTaskFolder } = await importStorage();
      // Should not throw
      await renameTaskFolder("/nonexistent", "new-name");
    });

    it("toggleTaskFolderPin toggles the isPinned flag", async () => {
      const { initAppDataDir, createTaskFolder, toggleTaskFolderPin, loadTaskFolder } =
        await importStorage();
      await initAppDataDir();
      const path = await createTaskFolder("toggleable");

      let loaded = await loadTaskFolder(path);
      expect(loaded!.isPinned).toBe(false);

      await toggleTaskFolderPin(path);
      loaded = await loadTaskFolder(path);
      expect(loaded!.isPinned).toBe(true);

      await toggleTaskFolderPin(path);
      loaded = await loadTaskFolder(path);
      expect(loaded!.isPinned).toBe(false);
    });

    it("toggleTaskFolderPin does nothing when folder does not exist", async () => {
      const { toggleTaskFolderPin } = await importStorage();
      // Should not throw
      await toggleTaskFolderPin("/nonexistent");
    });
  });

  // ==========================================================================
  // Schedule storage
  // ==========================================================================
  describe("schedule storage", () => {
    const sampleSchedule = {
      id: "sched-1",
      name: "Daily Backup",
      cron: "0 0 * * *",
      agentId: "default",
      prompt: "Run backup",
      enabled: true,
      hasError: false,
      lastRun: null,
      nextRun: null,
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    };

    it("saves and loads a schedule", async () => {
      const { initAppDataDir, saveSchedule, loadSchedule } = await importStorage();
      await initAppDataDir();

      const path = await saveSchedule(sampleSchedule);
      expect(path).toBe("/sapio-data/scheduler/sched-1.yaml");

      const loaded = await loadSchedule(path);
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe("sched-1");
      expect(loaded!.name).toBe("Daily Backup");
      expect(loaded!.cron).toBe("0 0 * * *");
    });

    it("saves schedule to specific folder", async () => {
      const { initAppDataDir, createSchedulerFolder, saveSchedule, loadSchedule } = await importStorage();
      await initAppDataDir();

      const folder = await createSchedulerFolder("automation");
      const path = await saveSchedule(sampleSchedule, folder);
      expect(path).toContain("automation");

      const loaded = await loadSchedule(path);
      expect(loaded!.id).toBe("sched-1");
    });

    it("loadSchedule returns null when path does not exist", async () => {
      const { loadSchedule } = await importStorage();
      const result = await loadSchedule("/nonexistent.yaml");
      expect(result).toBeNull();
    });

    it("deleteScheduleByPath removes the schedule", async () => {
      const { initAppDataDir, saveSchedule, deleteScheduleByPath, pathExists } = await importStorage();
      await initAppDataDir();

      const path = await saveSchedule(sampleSchedule);
      expect(await pathExists(path)).toBe(true);
      await deleteScheduleByPath(path);
      expect(await pathExists(path)).toBe(false);
    });

    it("createSchedulerFolder creates a folder with _meta.yaml", async () => {
      const { initAppDataDir, createSchedulerFolder, pathExists } = await importStorage();
      await initAppDataDir();

      const path = await createSchedulerFolder("my-schedules");
      expect(path).toBe("/sapio-data/scheduler/my-schedules");
      expect(await pathExists(`${path}/_meta.yaml`)).toBe(true);
    });

    it("createSchedulerFolder with parentPath creates nested folder", async () => {
      const { initAppDataDir, createSchedulerFolder, pathExists } = await importStorage();
      await initAppDataDir();

      const parent = await createSchedulerFolder("parent");
      const child = await createSchedulerFolder("child", parent);
      expect(child).toBe("/sapio-data/scheduler/parent/child");
      expect(await pathExists(child)).toBe(true);
    });

    it("deleteSchedulerFolder removes the folder", async () => {
      const { initAppDataDir, createSchedulerFolder, deleteSchedulerFolder, pathExists } =
        await importStorage();
      await initAppDataDir();

      const path = await createSchedulerFolder("to-delete");
      await deleteSchedulerFolder(path);
      expect(await pathExists(path)).toBe(false);
    });

    it("renameSchedulerFolder renames the directory", async () => {
      const { initAppDataDir, createSchedulerFolder, renameSchedulerFolder, pathExists } =
        await importStorage();
      await initAppDataDir();

      const oldPath = await createSchedulerFolder("old-name");
      const newPath = await renameSchedulerFolder(oldPath, "new-name");
      expect(newPath).toBe("/sapio-data/scheduler/new-name");
      expect(await pathExists(oldPath)).toBe(false);
      expect(await pathExists(newPath)).toBe(true);
    });
  });

  // ==========================================================================
  // loadSchedulerTree
  // ==========================================================================
  describe("loadSchedulerTree", () => {
    it("returns empty array when scheduler dir does not exist", async () => {
      const { loadSchedulerTree } = await importStorage();
      const result = await loadSchedulerTree();
      expect(result).toEqual([]);
    });

    it("loads schedule entries from the scheduler directory", async () => {
      const { initAppDataDir, saveSchedule, loadSchedulerTree } = await importStorage();
      await initAppDataDir();

      await saveSchedule({
        id: "s1",
        name: "Schedule 1",
        cron: "0 * * * *",
        agentId: "default",
        prompt: "do something",
        enabled: true,
        hasError: false,
        lastRun: null,
        nextRun: null,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      });

      const tree = await loadSchedulerTree();
      expect(tree).toHaveLength(1);
      expect(tree[0].type).toBe("schedule");
      expect(tree[0].id).toBe("s1");
      expect(tree[0].name).toBe("Schedule 1");
      expect(tree[0].cron).toBe("0 * * * *");
      expect(tree[0].enabled).toBe(true);
    });

    it("loads nested schedules in folders", async () => {
      const { initAppDataDir, createSchedulerFolder, saveSchedule, loadSchedulerTree } =
        await importStorage();
      await initAppDataDir();

      const folder = await createSchedulerFolder("work");
      await saveSchedule(
        {
          id: "s1",
          name: "Work Schedule",
          cron: "0 9 * * 1-5",
          agentId: "default",
          prompt: "start work",
          enabled: true,
          hasError: false,
          lastRun: null,
          nextRun: null,
          createdAt: "2025-01-01T00:00:00Z",
          updatedAt: "2025-01-01T00:00:00Z",
        },
        folder,
      );

      const tree = await loadSchedulerTree();
      const folderNode = tree.find((n) => n.type === "folder");
      expect(folderNode).toBeDefined();
      expect(folderNode!.name).toBe("work");
      expect(folderNode!.children).toHaveLength(1);
      expect(folderNode!.children![0].id).toBe("s1");
    });

    it("skips malformed schedule YAML files", async () => {
      const { initAppDataDir, writeFile, loadSchedulerTree } = await importStorage();
      await initAppDataDir();
      await writeFile("/sapio-data/scheduler/bad.yaml", ":\n  :\n  [}{");
      const tree = await loadSchedulerTree();
      expect(tree).toHaveLength(0);
    });
  });

  // ==========================================================================
  // toggleSchedulerFolderPin
  // ==========================================================================
  describe("toggleSchedulerFolderPin", () => {
    it("toggles pin on existing folder meta", async () => {
      const { initAppDataDir, createSchedulerFolder, loadFolderMeta, toggleSchedulerFolderPin } =
        await importStorage();
      await initAppDataDir();

      const folder = await createSchedulerFolder("pin-test");
      let meta = await loadFolderMeta(folder);
      expect(meta!.isPinned).toBe(false);

      await toggleSchedulerFolderPin(folder);
      meta = await loadFolderMeta(folder);
      expect(meta!.isPinned).toBe(true);

      await toggleSchedulerFolderPin(folder);
      meta = await loadFolderMeta(folder);
      expect(meta!.isPinned).toBe(false);
    });

    it("creates meta with isPinned=true when meta does not exist", async () => {
      const { initAppDataDir, createDirectory, toggleSchedulerFolderPin, loadFolderMeta } =
        await importStorage();
      await initAppDataDir();

      // Create a directory without _meta.yaml
      await createDirectory("/sapio-data/scheduler/no-meta");
      await toggleSchedulerFolderPin("/sapio-data/scheduler/no-meta");

      const meta = await loadFolderMeta("/sapio-data/scheduler/no-meta");
      expect(meta).not.toBeNull();
      expect(meta!.isPinned).toBe(true);
    });
  });

  // ==========================================================================
  // Toolbox item storage
  // ==========================================================================
  describe("toolbox item storage", () => {
    it("saves and loads a prompt (yaml extension)", async () => {
      const { initAppDataDir, saveToolboxItem, loadToolboxItem } = await importStorage();
      await initAppDataDir();

      await saveToolboxItem({
        name: "greeting",
        category: "prompts",
        content: "Hello, world!",
        updatedAt: "2025-01-01T00:00:00Z",
      });

      const loaded = await loadToolboxItem("prompts", "greeting");
      expect(loaded).not.toBeNull();
      expect(loaded!.name).toBe("greeting");
      expect(loaded!.category).toBe("prompts");
      expect(loaded!.content).toBe("Hello, world!");
    });

    it("saves and loads a memory (md extension)", async () => {
      const { initAppDataDir, saveToolboxItem, loadToolboxItem } = await importStorage();
      await initAppDataDir();

      await saveToolboxItem({
        name: "important",
        category: "memories",
        content: "# Important Memory\nRemember this.",
        updatedAt: "2025-01-01T00:00:00Z",
      });

      const loaded = await loadToolboxItem("memories", "important");
      expect(loaded).not.toBeNull();
      expect(loaded!.content).toBe("# Important Memory\nRemember this.");
    });

    it("saves and loads a skill (md extension)", async () => {
      const { initAppDataDir, saveToolboxItem, loadToolboxItem } = await importStorage();
      await initAppDataDir();

      await saveToolboxItem({
        name: "coding",
        category: "skills",
        content: "Skill content",
        updatedAt: "2025-01-01T00:00:00Z",
      });

      const loaded = await loadToolboxItem("skills", "coding");
      expect(loaded).not.toBeNull();
    });

    it("saves and loads a workflow (yaml extension)", async () => {
      const { initAppDataDir, saveToolboxItem, loadToolboxItem } = await importStorage();
      await initAppDataDir();

      await saveToolboxItem({
        name: "deploy",
        category: "workflows",
        content: "steps:\n  - build\n  - deploy",
        updatedAt: "2025-01-01T00:00:00Z",
      });

      const loaded = await loadToolboxItem("workflows", "deploy");
      expect(loaded).not.toBeNull();
      expect(loaded!.content).toContain("steps:");
    });

    it("loadToolboxItem returns null when item does not exist", async () => {
      const { initAppDataDir, loadToolboxItem } = await importStorage();
      await initAppDataDir();
      const result = await loadToolboxItem("prompts", "nonexistent");
      expect(result).toBeNull();
    });

    it("lists toolbox items in a category", async () => {
      const { initAppDataDir, saveToolboxItem, listToolboxItems } = await importStorage();
      await initAppDataDir();

      await saveToolboxItem({ name: "p1", category: "prompts", content: "c", updatedAt: "" });
      await saveToolboxItem({ name: "p2", category: "prompts", content: "c", updatedAt: "" });

      const items = await listToolboxItems("prompts");
      expect(items).toEqual(expect.arrayContaining(["p1", "p2"]));
    });

    it("deletes a toolbox item", async () => {
      const { initAppDataDir, saveToolboxItem, deleteToolboxItem, loadToolboxItem } = await importStorage();
      await initAppDataDir();

      await saveToolboxItem({ name: "to-delete", category: "prompts", content: "c", updatedAt: "" });
      expect(await loadToolboxItem("prompts", "to-delete")).not.toBeNull();

      await deleteToolboxItem("prompts", "to-delete");
      expect(await loadToolboxItem("prompts", "to-delete")).toBeNull();
    });

    it("renames a toolbox item", async () => {
      const { initAppDataDir, saveToolboxItem, renameToolboxItem, loadToolboxItem } = await importStorage();
      await initAppDataDir();

      await saveToolboxItem({
        name: "old-name",
        category: "prompts",
        content: "content here",
        updatedAt: "2025-01-01T00:00:00Z",
      });

      await renameToolboxItem("prompts", "old-name", "new-name");

      expect(await loadToolboxItem("prompts", "old-name")).toBeNull();
      const renamed = await loadToolboxItem("prompts", "new-name");
      expect(renamed).not.toBeNull();
      expect(renamed!.content).toBe("content here");
    });

    it("renameToolboxItem does nothing when item does not exist", async () => {
      const { initAppDataDir, renameToolboxItem, loadToolboxItem } = await importStorage();
      await initAppDataDir();
      // Should not throw
      await renameToolboxItem("prompts", "nonexistent", "new-name");
      expect(await loadToolboxItem("prompts", "new-name")).toBeNull();
    });

    it("saves and loads an agent via toolbox (md extension)", async () => {
      const { initAppDataDir, saveToolboxItem, loadToolboxItem } = await importStorage();
      await initAppDataDir();

      await saveToolboxItem({
        name: "my-agent",
        category: "agents",
        content: "Agent content",
        updatedAt: "2025-01-01T00:00:00Z",
      });

      const loaded = await loadToolboxItem("agents", "my-agent");
      expect(loaded).not.toBeNull();
      expect(loaded!.content).toBe("Agent content");
    });
  });

  // ==========================================================================
  // getAppDataDir caching behavior
  // ==========================================================================
  describe("getAppDataDir caching", () => {
    it("caches the result so invoke is only called once across multiple calls", async () => {
      // We need a fresh module to test the caching. Reset modules.
      vi.resetModules();
      mockIsTauri.mockReturnValue(true);
      mockInvoke.mockResolvedValue("/cached/path");

      const storage = await import("./storage");

      // Call multiple functions that use getAppDataDirCached
      await storage.listAgents();
      await storage.listAgents();
      await storage.listAgents();

      // get_app_data_dir should only be called once due to caching
      const appDataDirCalls = mockInvoke.mock.calls.filter(
        (call) => call[0] === "get_app_data_dir",
      );
      expect(appDataDirCalls).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Edge cases: Virtual FS readDirectory for implicit directories
  // ==========================================================================
  describe("readDirectory edge cases (web)", () => {
    it("detects implicit directories from deeper paths", async () => {
      const { writeFile, readDirectory } = await importStorage();
      // Write a deeply nested file without explicitly creating intermediate dirs
      // The webWriteFile auto-creates parent dirs
      await writeFile("/root/implicit-dir/file.txt", "data");

      const entries = await readDirectory("/root");
      const implicitDir = entries.find((e) => e.name === "implicit-dir");
      expect(implicitDir).toBeDefined();
      expect(implicitDir!.is_directory).toBe(true);
    });
  });
});
