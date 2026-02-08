import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));

const mockReadDirectory = vi.fn().mockResolvedValue([]);
const mockReadFile = vi.fn().mockResolvedValue("");
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockDeletePath = vi.fn().mockResolvedValue(undefined);
const mockCreateDirectory = vi.fn().mockResolvedValue(undefined);
const mockRenamePath = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/storage", () => ({
  readDirectory: (...args: unknown[]) => mockReadDirectory(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  deletePath: (...args: unknown[]) => mockDeletePath(...args),
  createDirectory: (...args: unknown[]) => mockCreateDirectory(...args),
  renamePath: (...args: unknown[]) => mockRenamePath(...args),
}));

import { useFileStore } from "./file-store";
import type { FileNode, OpenFile } from "./file-store";

function getState() {
  return useFileStore.getState();
}

function makeOpenFile(overrides: Partial<OpenFile> = {}): OpenFile {
  return {
    path: "/test/file.ts",
    originalContent: "original",
    currentContent: "original",
    isModified: false,
    language: "typescript",
    ...overrides,
  };
}

function makeTauriNode(
  name: string,
  path: string,
  isDir: boolean,
  children?: ReturnType<typeof makeTauriNode>[]
) {
  return { name, path, is_directory: isDir, children };
}

beforeEach(() => {
  vi.clearAllMocks();
  useFileStore.setState({
    rootPath: "~/Projects",
    tree: [],
    selectedFile: null,
    fileContent: null,
    isLoading: false,
    searchQuery: "",
    isSearchOpen: false,
    openFiles: [],
    activeFilePath: null,
    editingPath: null,
    editingName: "",
    pendingCloseFilePath: null,
  });
});

describe("file-store", () => {
  describe("initial state", () => {
    it("has correct defaults", () => {
      const state = getState();
      expect(state.rootPath).toBe("~/Projects");
      expect(state.tree).toEqual([]);
      expect(state.selectedFile).toBeNull();
      expect(state.fileContent).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.searchQuery).toBe("");
      expect(state.isSearchOpen).toBe(false);
      expect(state.openFiles).toEqual([]);
      expect(state.activeFilePath).toBeNull();
      expect(state.editingPath).toBeNull();
      expect(state.editingName).toBe("");
      expect(state.pendingCloseFilePath).toBeNull();
    });
  });

  describe("basic setters", () => {
    it("setRootPath", () => {
      getState().setRootPath("/new/root");
      expect(getState().rootPath).toBe("/new/root");
    });

    it("setTree", () => {
      const tree: FileNode[] = [{ name: "a", path: "/a", isDirectory: false }];
      getState().setTree(tree);
      expect(getState().tree).toEqual(tree);
    });

    it("selectFile", () => {
      getState().selectFile("/foo/bar.ts");
      expect(getState().selectedFile).toBe("/foo/bar.ts");
    });

    it("setFileContent", () => {
      getState().setFileContent("hello");
      expect(getState().fileContent).toBe("hello");
    });

    it("setSearchQuery", () => {
      getState().setSearchQuery("test");
      expect(getState().searchQuery).toBe("test");
    });

    it("setSearchOpen", () => {
      getState().setSearchOpen(true);
      expect(getState().isSearchOpen).toBe(true);
    });

    it("setLoading", () => {
      getState().setLoading(true);
      expect(getState().isLoading).toBe(true);
    });
  });

  describe("toggleDirectory", () => {
    it("toggles isExpanded on matching node", () => {
      useFileStore.setState({
        tree: [
          { name: "src", path: "/src", isDirectory: true, isExpanded: false, children: [] },
        ],
      });

      getState().toggleDirectory("/src");

      expect(getState().tree[0].isExpanded).toBe(true);
    });

    it("toggles back to collapsed", () => {
      useFileStore.setState({
        tree: [
          { name: "src", path: "/src", isDirectory: true, isExpanded: true, children: [] },
        ],
      });

      getState().toggleDirectory("/src");

      expect(getState().tree[0].isExpanded).toBe(false);
    });

    it("toggles nested nodes", () => {
      useFileStore.setState({
        tree: [
          {
            name: "src",
            path: "/src",
            isDirectory: true,
            isExpanded: true,
            children: [
              { name: "lib", path: "/src/lib", isDirectory: true, isExpanded: false, children: [] },
            ],
          },
        ],
      });

      getState().toggleDirectory("/src/lib");

      expect(getState().tree[0].children![0].isExpanded).toBe(true);
    });
  });

  describe("loadFileTree", () => {
    it("loads and sorts the tree (directories first)", async () => {
      mockReadDirectory.mockResolvedValue([
        makeTauriNode("b.ts", "/root/b.ts", false),
        makeTauriNode("a-dir", "/root/a-dir", true),
        makeTauriNode("a.ts", "/root/a.ts", false),
      ]);

      await getState().loadFileTree("/root");

      expect(mockReadDirectory).toHaveBeenCalledWith("/root", 10);
      expect(getState().rootPath).toBe("/root");
      expect(getState().isLoading).toBe(false);

      const tree = getState().tree;
      expect(tree).toHaveLength(3);
      expect(tree[0].name).toBe("a-dir");
      expect(tree[0].isDirectory).toBe(true);
      expect(tree[1].name).toBe("a.ts");
      expect(tree[2].name).toBe("b.ts");
    });

    it("handles errors gracefully", async () => {
      mockReadDirectory.mockRejectedValue(new Error("fail"));

      await getState().loadFileTree("/root");

      expect(getState().tree).toEqual([]);
      expect(getState().isLoading).toBe(false);
    });
  });

  describe("refreshTree", () => {
    it("preserves expanded state after refresh", async () => {
      useFileStore.setState({
        rootPath: "/root",
        tree: [
          { name: "src", path: "/root/src", isDirectory: true, isExpanded: true, children: [] },
          { name: "lib", path: "/root/lib", isDirectory: true, isExpanded: false, children: [] },
        ],
      });

      mockReadDirectory.mockResolvedValue([
        makeTauriNode("src", "/root/src", true),
        makeTauriNode("lib", "/root/lib", true),
        makeTauriNode("new.ts", "/root/new.ts", false),
      ]);

      await getState().refreshTree();

      const tree = getState().tree;
      const src = tree.find((n) => n.name === "src");
      const lib = tree.find((n) => n.name === "lib");
      expect(src?.isExpanded).toBe(true);
      expect(lib?.isExpanded).toBe(false);
    });
  });

  describe("openFile", () => {
    it("reads file and adds to openFiles", async () => {
      mockReadFile.mockResolvedValue("file content");

      await getState().openFile("/test/hello.ts");

      expect(mockReadFile).toHaveBeenCalledWith("/test/hello.ts");
      const { openFiles, activeFilePath, selectedFile, fileContent } = getState();
      expect(openFiles).toHaveLength(1);
      expect(openFiles[0].path).toBe("/test/hello.ts");
      expect(openFiles[0].originalContent).toBe("file content");
      expect(openFiles[0].currentContent).toBe("file content");
      expect(openFiles[0].isModified).toBe(false);
      expect(openFiles[0].language).toBe("typescript");
      expect(activeFilePath).toBe("/test/hello.ts");
      expect(selectedFile).toBe("/test/hello.ts");
      expect(fileContent).toBe("file content");
    });

    it("detects language from extension", async () => {
      mockReadFile.mockResolvedValue("");

      await getState().openFile("/test/script.py");
      expect(getState().openFiles[0].language).toBe("python");
    });

    it("uses plaintext for unknown extensions", async () => {
      mockReadFile.mockResolvedValue("");

      await getState().openFile("/test/data.xyz");
      expect(getState().openFiles[0].language).toBe("plaintext");
    });

    it("activates already-open file without duplicating", async () => {
      useFileStore.setState({
        openFiles: [makeOpenFile({ path: "/test/file.ts" })],
        activeFilePath: null,
      });

      await getState().openFile("/test/file.ts");

      expect(getState().openFiles).toHaveLength(1);
      expect(getState().activeFilePath).toBe("/test/file.ts");
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it("handles read errors gracefully", async () => {
      mockReadFile.mockRejectedValue(new Error("read fail"));

      await getState().openFile("/test/fail.ts");

      expect(getState().openFiles).toHaveLength(0);
      expect(getState().isLoading).toBe(false);
    });
  });

  describe("closeFile", () => {
    it("removes file and selects next tab", () => {
      useFileStore.setState({
        openFiles: [
          makeOpenFile({ path: "/a.ts" }),
          makeOpenFile({ path: "/b.ts" }),
        ],
        activeFilePath: "/a.ts",
      });

      getState().closeFile("/a.ts");

      expect(getState().openFiles).toHaveLength(1);
      expect(getState().activeFilePath).toBe("/b.ts");
    });

    it("sets null when closing last file", () => {
      useFileStore.setState({
        openFiles: [makeOpenFile({ path: "/a.ts" })],
        activeFilePath: "/a.ts",
      });

      getState().closeFile("/a.ts");

      expect(getState().openFiles).toHaveLength(0);
      expect(getState().activeFilePath).toBeNull();
    });

    it("shows warning modal for modified file without force", () => {
      useFileStore.setState({
        openFiles: [makeOpenFile({ path: "/a.ts", isModified: true })],
        activeFilePath: "/a.ts",
      });

      getState().closeFile("/a.ts");

      // File should NOT be closed
      expect(getState().openFiles).toHaveLength(1);
      expect(getState().pendingCloseFilePath).toBe("/a.ts");
    });

    it("force-closes modified file", () => {
      useFileStore.setState({
        openFiles: [makeOpenFile({ path: "/a.ts", isModified: true })],
        activeFilePath: "/a.ts",
      });

      getState().closeFile("/a.ts", true);

      expect(getState().openFiles).toHaveLength(0);
    });

    it("keeps activeFilePath when closing non-active tab", () => {
      useFileStore.setState({
        openFiles: [
          makeOpenFile({ path: "/a.ts" }),
          makeOpenFile({ path: "/b.ts" }),
        ],
        activeFilePath: "/a.ts",
      });

      getState().closeFile("/b.ts");

      expect(getState().activeFilePath).toBe("/a.ts");
    });
  });

  describe("setActiveFile", () => {
    it("sets active file and updates content", () => {
      useFileStore.setState({
        openFiles: [makeOpenFile({ path: "/a.ts", currentContent: "aaa" })],
      });

      getState().setActiveFile("/a.ts");

      expect(getState().activeFilePath).toBe("/a.ts");
      expect(getState().selectedFile).toBe("/a.ts");
      expect(getState().fileContent).toBe("aaa");
    });

    it("sets null content for non-existent file", () => {
      getState().setActiveFile("/nonexistent.ts");

      expect(getState().fileContent).toBeNull();
    });
  });

  describe("updateFileContent", () => {
    it("updates content and marks modified", () => {
      useFileStore.setState({
        openFiles: [makeOpenFile({ path: "/a.ts" })],
        activeFilePath: "/a.ts",
      });

      getState().updateFileContent("/a.ts", "changed");

      const file = getState().openFiles[0];
      expect(file.currentContent).toBe("changed");
      expect(file.isModified).toBe(true);
      expect(getState().fileContent).toBe("changed");
    });

    it("clears isModified when content reverts to original", () => {
      useFileStore.setState({
        openFiles: [makeOpenFile({ path: "/a.ts", currentContent: "changed", isModified: true })],
        activeFilePath: "/a.ts",
      });

      getState().updateFileContent("/a.ts", "original");

      expect(getState().openFiles[0].isModified).toBe(false);
    });

    it("does not update fileContent for non-active file", () => {
      useFileStore.setState({
        openFiles: [
          makeOpenFile({ path: "/a.ts" }),
          makeOpenFile({ path: "/b.ts", currentContent: "bbb" }),
        ],
        activeFilePath: "/a.ts",
        fileContent: "original",
      });

      getState().updateFileContent("/b.ts", "b-changed");

      expect(getState().fileContent).toBe("original");
    });
  });

  describe("saveFile", () => {
    it("writes to disk and marks as not modified", async () => {
      useFileStore.setState({
        openFiles: [makeOpenFile({ path: "/a.ts", currentContent: "saved", isModified: true })],
      });

      await getState().saveFile("/a.ts");

      expect(mockWriteFile).toHaveBeenCalledWith("/a.ts", "saved");
      const file = getState().openFiles[0];
      expect(file.originalContent).toBe("saved");
      expect(file.isModified).toBe(false);
    });

    it("does nothing for non-existent file", async () => {
      await getState().saveFile("/nonexistent.ts");
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it("handles write errors gracefully", async () => {
      useFileStore.setState({
        openFiles: [makeOpenFile({ path: "/a.ts", currentContent: "data", isModified: true })],
      });
      mockWriteFile.mockRejectedValueOnce(new Error("write fail"));

      await getState().saveFile("/a.ts");

      // Should not crash; file stays modified
      expect(getState().openFiles[0].isModified).toBe(true);
    });
  });

  describe("saveActiveFile", () => {
    it("saves the active file", async () => {
      useFileStore.setState({
        openFiles: [makeOpenFile({ path: "/a.ts", currentContent: "data", isModified: true })],
        activeFilePath: "/a.ts",
      });

      await getState().saveActiveFile();

      expect(mockWriteFile).toHaveBeenCalledWith("/a.ts", "data");
    });

    it("does nothing when no active file", async () => {
      useFileStore.setState({ activeFilePath: null });

      await getState().saveActiveFile();

      expect(mockWriteFile).not.toHaveBeenCalled();
    });
  });

  describe("createFile", () => {
    it("writes empty file and opens it", async () => {
      mockReadFile.mockResolvedValue("");
      mockReadDirectory.mockResolvedValue([]);

      await getState().createFile("/root", "new.ts");

      expect(mockWriteFile).toHaveBeenCalledWith("/root/new.ts", "");
      expect(mockReadFile).toHaveBeenCalledWith("/root/new.ts");
    });

    it("uses rootPath when parentPath is null", async () => {
      useFileStore.setState({ rootPath: "/default" });
      mockReadFile.mockResolvedValue("");
      mockReadDirectory.mockResolvedValue([]);

      await getState().createFile(null, "new.ts");

      expect(mockWriteFile).toHaveBeenCalledWith("/default/new.ts", "");
    });
  });

  describe("createFolder", () => {
    it("creates directory and refreshes tree", async () => {
      mockReadDirectory.mockResolvedValue([]);

      await getState().createFolder("/root", "new-dir");

      expect(mockCreateDirectory).toHaveBeenCalledWith("/root/new-dir");
    });

    it("uses rootPath when parentPath is null", async () => {
      useFileStore.setState({ rootPath: "/default" });
      mockReadDirectory.mockResolvedValue([]);

      await getState().createFolder(null, "new-dir");

      expect(mockCreateDirectory).toHaveBeenCalledWith("/default/new-dir");
    });
  });

  describe("renameItem", () => {
    it("renames path and updates open files", async () => {
      useFileStore.setState({
        openFiles: [makeOpenFile({ path: "/root/old.ts" })],
        activeFilePath: "/root/old.ts",
        selectedFile: "/root/old.ts",
      });
      mockReadDirectory.mockResolvedValue([]);

      await getState().renameItem("/root/old.ts", "new.ts");

      expect(mockRenamePath).toHaveBeenCalledWith("/root/old.ts", "/root/new.ts");
      expect(getState().openFiles[0].path).toBe("/root/new.ts");
      expect(getState().activeFilePath).toBe("/root/new.ts");
      expect(getState().selectedFile).toBe("/root/new.ts");
    });
  });

  describe("deleteItem", () => {
    it("closes open file and deletes from disk", async () => {
      useFileStore.setState({
        openFiles: [makeOpenFile({ path: "/root/del.ts" })],
        activeFilePath: "/root/del.ts",
      });
      mockReadDirectory.mockResolvedValue([]);

      await getState().deleteItem("/root/del.ts");

      expect(mockDeletePath).toHaveBeenCalledWith("/root/del.ts");
      expect(getState().openFiles).toHaveLength(0);
    });

    it("deletes item that is not open", async () => {
      mockReadDirectory.mockResolvedValue([]);

      await getState().deleteItem("/root/noopen.ts");

      expect(mockDeletePath).toHaveBeenCalledWith("/root/noopen.ts");
    });
  });

  describe("inline editing", () => {
    it("startEditing sets editing state", () => {
      getState().startEditing("/root/file.ts");

      expect(getState().editingPath).toBe("/root/file.ts");
      expect(getState().editingName).toBe("file.ts");
    });

    it("cancelEditing clears editing state", () => {
      useFileStore.setState({ editingPath: "/root/file.ts", editingName: "file.ts" });

      getState().cancelEditing();

      expect(getState().editingPath).toBeNull();
      expect(getState().editingName).toBe("");
    });

    it("setEditingName updates the name", () => {
      getState().setEditingName("new-name.ts");
      expect(getState().editingName).toBe("new-name.ts");
    });

    it("submitEditing renames and clears editing state", async () => {
      useFileStore.setState({
        editingPath: "/root/old.ts",
        editingName: "new.ts",
        rootPath: "/root",
      });
      mockReadDirectory.mockResolvedValue([]);

      await getState().submitEditing();

      expect(mockRenamePath).toHaveBeenCalledWith("/root/old.ts", "/root/new.ts");
      expect(getState().editingPath).toBeNull();
      expect(getState().editingName).toBe("");
    });

    it("submitEditing does nothing with empty name", async () => {
      useFileStore.setState({
        editingPath: "/root/old.ts",
        editingName: "   ",
      });

      await getState().submitEditing();

      expect(mockRenamePath).not.toHaveBeenCalled();
    });
  });

  describe("unsaved warning modal", () => {
    it("setPendingCloseFilePath sets the path", () => {
      getState().setPendingCloseFilePath("/file.ts");
      expect(getState().pendingCloseFilePath).toBe("/file.ts");
    });

    it("confirmClose saves and closes the file", async () => {
      useFileStore.setState({
        openFiles: [makeOpenFile({ path: "/a.ts", currentContent: "data", isModified: true })],
        activeFilePath: "/a.ts",
        pendingCloseFilePath: "/a.ts",
      });

      await getState().confirmClose();

      expect(mockWriteFile).toHaveBeenCalledWith("/a.ts", "data");
      expect(getState().openFiles).toHaveLength(0);
      expect(getState().pendingCloseFilePath).toBeNull();
    });

    it("discardAndClose force-closes without saving", () => {
      useFileStore.setState({
        openFiles: [makeOpenFile({ path: "/a.ts", isModified: true })],
        activeFilePath: "/a.ts",
        pendingCloseFilePath: "/a.ts",
      });

      getState().discardAndClose();

      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(getState().openFiles).toHaveLength(0);
      expect(getState().pendingCloseFilePath).toBeNull();
    });
  });
});
