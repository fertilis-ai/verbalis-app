import { create } from "zustand";
import {
  readDirectory,
  readFile,
  writeFile,
  deletePath,
  createDirectory,
  renamePath,
  type FileNode as TauriFileNode,
} from "@/lib/storage";

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
  isExpanded?: boolean;
}

export interface OpenFile {
  path: string;
  originalContent: string;
  currentContent: string;
  isModified: boolean;
  language: string;
}

interface FileState {
  rootPath: string;
  tree: FileNode[];
  selectedFile: string | null;
  fileContent: string | null;
  isLoading: boolean;
  searchQuery: string;
  isSearchOpen: boolean;

  // Multi-file editing state
  openFiles: OpenFile[];
  activeFilePath: string | null;

  // Inline editing state
  editingPath: string | null;
  editingName: string;

  // Unsaved warning modal state
  pendingCloseFilePath: string | null;

  // Basic actions
  setRootPath: (path: string) => void;
  setTree: (tree: FileNode[]) => void;
  selectFile: (path: string | null) => void;
  setFileContent: (content: string | null) => void;
  toggleDirectory: (path: string) => void;
  setSearchQuery: (query: string) => void;
  setSearchOpen: (open: boolean) => void;
  setLoading: (loading: boolean) => void;

  // File tree operations
  loadFileTree: (rootPath: string) => Promise<void>;
  refreshTree: () => Promise<void>;

  // Multi-file editing actions
  openFile: (path: string) => Promise<void>;
  closeFile: (path: string, force?: boolean) => void;
  setActiveFile: (path: string | null) => void;
  updateFileContent: (path: string, content: string) => void;
  saveFile: (path: string) => Promise<void>;
  saveActiveFile: () => Promise<void>;

  // File operations
  createFile: (parentPath: string | null, name: string) => Promise<void>;
  createFolder: (parentPath: string | null, name: string) => Promise<void>;
  renameItem: (oldPath: string, newName: string) => Promise<void>;
  deleteItem: (path: string) => Promise<void>;

  // Inline editing
  startEditing: (path: string) => void;
  cancelEditing: () => void;
  submitEditing: () => Promise<void>;
  setEditingName: (name: string) => void;

  // Unsaved warning modal
  setPendingCloseFilePath: (path: string | null) => void;
  confirmClose: () => void;
  discardAndClose: () => void;
}

// Helper to detect language from file extension
function getLanguageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const fileName = path.split("/").pop() ?? "";

  // Extensionless file handling
  const nameMap: Record<string, string> = {
    Dockerfile: "dockerfile",
    Makefile: "makefile",
    Containerfile: "dockerfile",
    Justfile: "makefile",
    Rakefile: "ruby",
    Gemfile: "ruby",
    Vagrantfile: "ruby",
  };
  if (nameMap[fileName]) return nameMap[fileName];
  if (fileName.startsWith(".env")) return "shell";

  const langMap: Record<string, string> = {
    // JavaScript / TypeScript
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    mjs: "javascript",
    mts: "typescript",
    cjs: "javascript",
    cts: "typescript",
    // Web
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    less: "less",
    sass: "sass",
    vue: "vue",
    svelte: "svelte",
    astro: "astro",
    // Data / Config
    json: "json",
    jsonc: "jsonc",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "xml",
    csv: "csv",
    ini: "ini",
    // Markdown / Docs
    md: "markdown",
    mdx: "mdx",
    // Shell
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    fish: "fish",
    ps1: "powershell",
    // Systems
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    hpp: "cpp",
    rs: "rust",
    go: "go",
    zig: "zig",
    // JVM
    java: "java",
    kt: "kotlin",
    kts: "kotlin",
    scala: "scala",
    groovy: "groovy",
    gradle: "groovy",
    // .NET
    cs: "csharp",
    fs: "fsharp",
    // Apple
    swift: "swift",
    // Scripting
    py: "python",
    rb: "ruby",
    pl: "perl",
    pm: "perl",
    lua: "lua",
    r: "r",
    R: "r",
    php: "php",
    // Functional
    ex: "elixir",
    exs: "elixir",
    erl: "erlang",
    hs: "haskell",
    clj: "clojure",
    ml: "ocaml",
    // Mobile
    dart: "dart",
    // Query / Schema
    sql: "sql",
    graphql: "graphql",
    gql: "graphql",
    proto: "proto",
    prisma: "prisma",
    // DevOps / Infra
    tf: "terraform",
    hcl: "hcl",
    nix: "nix",
    // Misc
    tex: "latex",
    latex: "latex",
    diff: "diff",
    patch: "diff",
    log: "log",
    dockerfile: "dockerfile",
    makefile: "makefile",
  };
  return langMap[ext] ?? "plaintext";
}

// Convert Tauri FileNode to store FileNode with isExpanded
function convertTauriNode(node: TauriFileNode): FileNode {
  return {
    name: node.name,
    path: node.path,
    isDirectory: node.is_directory,
    isExpanded: false,
    children: node.children?.map(convertTauriNode),
  };
}

// Toggle expanded state in tree
function toggleNodeExpanded(nodes: FileNode[], path: string): FileNode[] {
  return nodes.map((node) => {
    if (node.path === path) {
      return { ...node, isExpanded: !node.isExpanded };
    }
    if (node.children) {
      return { ...node, children: toggleNodeExpanded(node.children, path) };
    }
    return node;
  });
}

// Sort tree with folders first, then alphabetically
function sortTree(nodes: FileNode[]): FileNode[] {
  return [...nodes]
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map((node) => ({
      ...node,
      children: node.children ? sortTree(node.children) : undefined,
    }));
}

export const useFileStore = create<FileState>((set, get) => ({
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

  setRootPath: (rootPath) => set({ rootPath }),
  setTree: (tree) => set({ tree }),
  selectFile: (selectedFile) => set({ selectedFile }),
  setFileContent: (fileContent) => set({ fileContent }),
  toggleDirectory: (path) =>
    set((state) => ({
      tree: toggleNodeExpanded(state.tree, path),
    })),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSearchOpen: (isSearchOpen) => set({ isSearchOpen }),
  setLoading: (isLoading) => set({ isLoading }),

  loadFileTree: async (rootPath: string) => {
    set({ isLoading: true, rootPath });
    try {
      const nodes = await readDirectory(rootPath, 10);
      const tree = sortTree(nodes.map(convertTauriNode));
      set({ tree, isLoading: false });
    } catch (error) {
      console.error("Failed to load file tree:", error);
      set({ tree: [], isLoading: false });
    }
  },

  refreshTree: async () => {
    const { rootPath } = get();
    if (rootPath) {
      try {
        const nodes = await readDirectory(rootPath, 10);
        // Preserve expanded state from current tree
        const currentTree = get().tree;
        const expandedPaths = new Set<string>();
        const collectExpanded = (nodes: FileNode[]) => {
          for (const node of nodes) {
            if (node.isExpanded) expandedPaths.add(node.path);
            if (node.children) collectExpanded(node.children);
          }
        };
        collectExpanded(currentTree);

        const applyExpanded = (nodes: FileNode[]): FileNode[] => {
          return nodes.map((node) => ({
            ...node,
            isExpanded: expandedPaths.has(node.path),
            children: node.children ? applyExpanded(node.children) : undefined,
          }));
        };

        const tree = sortTree(applyExpanded(nodes.map(convertTauriNode)));
        set({ tree });
      } catch (error) {
        console.error("Failed to refresh file tree:", error);
      }
    }
  },

  openFile: async (path: string) => {
    const { openFiles } = get();
    // Check if already open
    const existing = openFiles.find((f) => f.path === path);
    if (existing) {
      set({ activeFilePath: path, selectedFile: path });
      return;
    }

    set({ isLoading: true });
    try {
      const content = await readFile(path);
      const newFile: OpenFile = {
        path,
        originalContent: content,
        currentContent: content,
        isModified: false,
        language: getLanguageFromPath(path),
      };
      set({
        openFiles: [...openFiles, newFile],
        activeFilePath: path,
        selectedFile: path,
        fileContent: content,
        isLoading: false,
      });
    } catch (error) {
      console.error("Failed to open file:", error);
      set({ isLoading: false });
    }
  },

  closeFile: (path: string, force = false) => {
    const { openFiles, activeFilePath } = get();
    const file = openFiles.find((f) => f.path === path);

    if (!force && file?.isModified) {
      // Show warning modal
      set({ pendingCloseFilePath: path });
      return;
    }

    const newOpenFiles = openFiles.filter((f) => f.path !== path);
    let newActiveFilePath = activeFilePath;

    if (activeFilePath === path) {
      // Select another file or null
      const closedIndex = openFiles.findIndex((f) => f.path === path);
      if (newOpenFiles.length > 0) {
        newActiveFilePath =
          newOpenFiles[Math.min(closedIndex, newOpenFiles.length - 1)]?.path ??
          null;
      } else {
        newActiveFilePath = null;
      }
    }

    set({
      openFiles: newOpenFiles,
      activeFilePath: newActiveFilePath,
      selectedFile: newActiveFilePath,
      fileContent:
        newOpenFiles.find((f) => f.path === newActiveFilePath)?.currentContent ??
        null,
    });
  },

  setActiveFile: (path: string | null) => {
    const { openFiles } = get();
    const file = openFiles.find((f) => f.path === path);
    set({
      activeFilePath: path,
      selectedFile: path,
      fileContent: file?.currentContent ?? null,
    });
  },

  updateFileContent: (path: string, content: string) => {
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === path
          ? {
              ...f,
              currentContent: content,
              isModified: content !== f.originalContent,
            }
          : f
      ),
      fileContent: state.activeFilePath === path ? content : state.fileContent,
    }));
  },

  saveFile: async (path: string) => {
    const { openFiles } = get();
    const file = openFiles.find((f) => f.path === path);
    if (!file) return;

    try {
      await writeFile(path, file.currentContent);
      set((state) => ({
        openFiles: state.openFiles.map((f) =>
          f.path === path
            ? {
                ...f,
                originalContent: f.currentContent,
                isModified: false,
              }
            : f
        ),
      }));
    } catch (error) {
      console.error("Failed to save file:", error);
    }
  },

  saveActiveFile: async () => {
    const { activeFilePath, saveFile } = get();
    if (activeFilePath) {
      await saveFile(activeFilePath);
    }
  },

  createFile: async (parentPath: string | null, name: string) => {
    const { rootPath, refreshTree } = get();
    const basePath = parentPath || rootPath;
    const filePath = `${basePath}/${name}`;
    try {
      await writeFile(filePath, "");
      await refreshTree();
      // Open the new file
      await get().openFile(filePath);
    } catch (error) {
      console.error("Failed to create file:", error);
    }
  },

  createFolder: async (parentPath: string | null, name: string) => {
    const { rootPath, refreshTree } = get();
    const basePath = parentPath || rootPath;
    const folderPath = `${basePath}/${name}`;
    try {
      await createDirectory(folderPath);
      await refreshTree();
    } catch (error) {
      console.error("Failed to create folder:", error);
    }
  },

  renameItem: async (oldPath: string, newName: string) => {
    const { refreshTree, openFiles } = get();
    const parentDir = oldPath.substring(0, oldPath.lastIndexOf("/"));
    const newPath = `${parentDir}/${newName}`;
    try {
      await renamePath(oldPath, newPath);

      // Update open files if the renamed file was open
      set((state) => ({
        openFiles: state.openFiles.map((f) =>
          f.path === oldPath ? { ...f, path: newPath } : f
        ),
        activeFilePath:
          state.activeFilePath === oldPath ? newPath : state.activeFilePath,
        selectedFile:
          state.selectedFile === oldPath ? newPath : state.selectedFile,
      }));

      await refreshTree();
    } catch (error) {
      console.error("Failed to rename item:", error);
    }
  },

  deleteItem: async (path: string) => {
    const { refreshTree, closeFile, openFiles } = get();
    try {
      // Close file if open
      const isOpen = openFiles.some((f) => f.path === path);
      if (isOpen) {
        closeFile(path, true);
      }

      await deletePath(path);
      await refreshTree();
    } catch (error) {
      console.error("Failed to delete item:", error);
    }
  },

  startEditing: (path: string) => {
    const name = path.split("/").pop() ?? "";
    set({ editingPath: path, editingName: name });
  },

  cancelEditing: () => {
    set({ editingPath: null, editingName: "" });
  },

  setEditingName: (editingName: string) => {
    set({ editingName });
  },

  submitEditing: async () => {
    const { editingPath, editingName, renameItem, cancelEditing } = get();
    if (editingPath && editingName.trim()) {
      await renameItem(editingPath, editingName.trim());
    }
    cancelEditing();
  },

  setPendingCloseFilePath: (path: string | null) => {
    set({ pendingCloseFilePath: path });
  },

  confirmClose: async () => {
    const { pendingCloseFilePath, saveFile, closeFile } = get();
    if (pendingCloseFilePath) {
      await saveFile(pendingCloseFilePath);
      closeFile(pendingCloseFilePath, true);
      set({ pendingCloseFilePath: null });
    }
  },

  discardAndClose: () => {
    const { pendingCloseFilePath, closeFile } = get();
    if (pendingCloseFilePath) {
      closeFile(pendingCloseFilePath, true);
      set({ pendingCloseFilePath: null });
    }
  },
}));
