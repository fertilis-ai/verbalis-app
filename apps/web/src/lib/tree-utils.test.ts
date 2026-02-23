import { describe, it, expect } from "vitest";
import { findNodeInTree, getUniqueName, getSiblingFolderNames, type TreeNode } from "./tree-utils";

const tree: TreeNode[] = [
  { id: "f1", name: "Folder A", type: "folder", children: [
    { id: "c1", name: "Chat 1", type: "chat" },
    { id: "f2", name: "Subfolder", type: "folder", children: [
      { id: "c2", name: "Chat 2", type: "chat" },
    ] },
  ] },
  { id: "f3", name: "Folder B", type: "folder" },
  { id: "c3", name: "Chat 3", type: "chat" },
];

describe("findNodeInTree", () => {
  it("finds a root-level node", () => {
    expect(findNodeInTree(tree, "f1")?.name).toBe("Folder A");
  });

  it("finds a deeply nested node", () => {
    expect(findNodeInTree(tree, "c2")?.name).toBe("Chat 2");
  });

  it("returns null for unknown id", () => {
    expect(findNodeInTree(tree, "nonexistent")).toBeNull();
  });

  it("returns null for empty tree", () => {
    expect(findNodeInTree([], "f1")).toBeNull();
  });
});

describe("getUniqueName", () => {
  it("returns base name when no collision", () => {
    expect(getUniqueName("New Folder", ["Existing"])).toBe("New Folder");
  });

  it("appends counter on collision", () => {
    expect(getUniqueName("Folder", ["Folder"])).toBe("Folder 2");
  });

  it("increments counter until unique", () => {
    expect(getUniqueName("Folder", ["Folder", "Folder 2", "Folder 3"])).toBe("Folder 4");
  });

  it("handles empty existing names", () => {
    expect(getUniqueName("Folder", [])).toBe("Folder");
  });
});

describe("getSiblingFolderNames", () => {
  it("returns root-level folder names when no parent", () => {
    expect(getSiblingFolderNames(tree)).toEqual(["Folder A", "Folder B"]);
  });

  it("returns child folder names for a parent", () => {
    expect(getSiblingFolderNames(tree, "f1")).toEqual(["Subfolder"]);
  });

  it("returns empty array for leaf node parent", () => {
    expect(getSiblingFolderNames(tree, "c1")).toEqual([]);
  });

  it("returns empty array for unknown parent", () => {
    expect(getSiblingFolderNames(tree, "nonexistent")).toEqual([]);
  });
});
