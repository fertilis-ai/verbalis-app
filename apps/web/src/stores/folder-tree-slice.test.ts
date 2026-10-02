import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createFolderActions,
  createFolderExpansionSlice,
  createFolderTreeSlice,
  type FolderExpansionState,
  type FolderTreeNode,
} from "./folder-tree-slice";

const folder = (id: string, name: string, path: string, children?: FolderTreeNode[]): FolderTreeNode => ({
  type: "folder",
  id,
  name,
  path,
  children,
});

const item = (id: string, path: string): FolderTreeNode => ({ type: "chat", id, name: id, path });

const tree: FolderTreeNode[] = [
  folder("a", "Projects", "/root/Projects", [folder("b", "Nested", "/root/Projects/Nested"), item("c1", "/root/Projects/c1.json")]),
  item("c2", "/root/c2.json"),
];

function setup(nodes: FolderTreeNode[] = tree) {
  const storage = {
    create: vi.fn().mockResolvedValue("/root/new"),
    rename: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    togglePin: vi.fn().mockResolvedValue(undefined),
  };
  const reload = vi.fn().mockResolvedValue(undefined);
  const actions = createFolderTreeSlice({ logPrefix: "test", getTree: () => nodes, reload, storage });
  return { storage, reload, actions };
}

describe("createFolderTreeSlice", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a root folder and reloads", async () => {
    const { storage, reload, actions } = setup();
    await actions.createFolder("Inbox");
    expect(storage.create).toHaveBeenCalledWith("Inbox", undefined);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("de-duplicates the name among root folders", async () => {
    const { storage, actions } = setup();
    await actions.createFolder("Projects");
    expect(storage.create).toHaveBeenCalledWith("Projects 2", undefined);
  });

  it("creates inside a nested parent and de-duplicates among its children", async () => {
    const { storage, actions } = setup();
    await actions.createFolder("Nested", "a");
    expect(storage.create).toHaveBeenCalledWith("Nested 2", "/root/Projects");
  });

  it("creates at the root when the parent id is not a folder", async () => {
    const { storage, actions } = setup();
    await actions.createFolder("X", "c1");
    expect(storage.create).toHaveBeenCalledWith("X", undefined);
  });

  it("renames, deletes and pins a nested folder by path, reloading each time", async () => {
    const { storage, reload, actions } = setup();
    await actions.renameFolder("b", "Renamed");
    await actions.deleteFolder("b");
    await actions.toggleFolderPin("b");
    expect(storage.rename).toHaveBeenCalledWith("/root/Projects/Nested", "Renamed");
    expect(storage.remove).toHaveBeenCalledWith("/root/Projects/Nested");
    expect(storage.togglePin).toHaveBeenCalledWith("/root/Projects/Nested");
    expect(reload).toHaveBeenCalledTimes(3);
  });

  it("ignores unknown ids and non-folder nodes", async () => {
    const { storage, reload, actions } = setup();
    await actions.renameFolder("missing", "X");
    await actions.deleteFolder("c2");
    await actions.toggleFolderPin("c1");
    expect(storage.rename).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(storage.togglePin).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("logs a failure instead of throwing, and skips the reload", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { storage, reload, actions } = setup();
    storage.create.mockRejectedValue(new Error("disk full"));
    storage.remove.mockRejectedValue(new Error("busy"));

    await expect(actions.createFolder("X")).resolves.toBeUndefined();
    await expect(actions.deleteFolder("a")).resolves.toBeUndefined();

    expect(reload).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("[test] Failed to create folder:", expect.any(Error));
    expect(error).toHaveBeenCalledWith("[test] Failed to delete folder:", expect.any(Error));
  });
});

describe("createFolderActions", () => {
  it("works on a flat tree of folders", async () => {
    const flat = [folder("f1", "Backlog", "/tasks/f1"), folder("f2", "Other", "/tasks/f2")];
    const storage = {
      rename: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      togglePin: vi.fn().mockResolvedValue(undefined),
    };
    const actions = createFolderActions({ logPrefix: "test", getTree: () => flat, reload: vi.fn(), storage });
    expect(actions).not.toHaveProperty("createFolder");

    await actions.renameFolder("f2", "Done");
    expect(storage.rename).toHaveBeenCalledWith("/tasks/f2", "Done");
  });
});

describe("createFolderExpansionSlice", () => {
  it("starts collapsed and toggles a folder", () => {
    let state: FolderExpansionState = createFolderExpansionSlice((update) => {
      state = { ...state, ...update(state) };
    });
    expect(state.expandedFolders.size).toBe(0);

    state.toggleFolderExpansion("a");
    expect([...state.expandedFolders]).toEqual(["a"]);

    state.toggleFolderExpansion("a");
    expect(state.expandedFolders.size).toBe(0);
  });
});
