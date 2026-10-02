import { describe, it, expect, beforeEach } from "vitest";
import {
  makeChatTreeNode,
  makeConversation,
  makeFolderTreeNode,
  makeMessage,
  mockCreateChatFolder,
  mockDeleteChatFolder,
  mockLoadChatTree,
  mockRenameChatFolder,
  mockRenamePath,
  mockToggleChatFolderPin,
  resetChatStore,
} from "@/test/chat-store-harness";
import { useChatStore } from "./chat-store";

// chat-store tests for the chat tree: folders, moves and loading from disk.
// Mocks and fixtures are in test/chat-store-harness.ts.

describe("chat-store", () => {
  beforeEach(() => {
    resetChatStore();
  });

  // -----------------------------------------------------------------------
  // toggleFolderExpansion
  // -----------------------------------------------------------------------
  describe("toggleFolderExpansion", () => {
    it("adds a folder to expanded set", () => {
      useChatStore.getState().toggleFolderExpansion("folder-1");
      expect(useChatStore.getState().expandedFolders.has("folder-1")).toBe(true);
    });

    it("removes a folder from expanded set on second toggle", () => {
      useChatStore.getState().toggleFolderExpansion("folder-1");
      useChatStore.getState().toggleFolderExpansion("folder-1");
      expect(useChatStore.getState().expandedFolders.has("folder-1")).toBe(false);
    });

    it("handles multiple folders independently", () => {
      useChatStore.getState().toggleFolderExpansion("f1");
      useChatStore.getState().toggleFolderExpansion("f2");
      const expanded = useChatStore.getState().expandedFolders;
      expect(expanded.has("f1")).toBe(true);
      expect(expanded.has("f2")).toBe(true);
    });

    it("third toggle re-adds the folder", () => {
      useChatStore.getState().toggleFolderExpansion("f1");
      useChatStore.getState().toggleFolderExpansion("f1");
      useChatStore.getState().toggleFolderExpansion("f1");
      expect(useChatStore.getState().expandedFolders.has("f1")).toBe(true);
    });
  });


  // -----------------------------------------------------------------------
  // moveConversation
  // -----------------------------------------------------------------------
  describe("moveConversation", () => {
    it("moves a conversation into a folder", async () => {
      const conv = makeConversation({ id: "c1", path: "/mock-data/chats/c1.json" });
      const folder = makeFolderTreeNode({ id: "folder-1", path: "/mock-data/chats/Work" });
      useChatStore.setState({ conversations: [conv], chatTree: [folder] });

      await useChatStore.getState().moveConversation("c1", "folder-1");

      expect(mockRenamePath).toHaveBeenCalledWith(
        "/mock-data/chats/c1.json",
        "/mock-data/chats/Work/c1.json"
      );
      expect(mockLoadChatTree).toHaveBeenCalled();
      const updated = useChatStore.getState().conversations.find((c) => c.id === "c1");
      expect(updated?.path).toBe("/mock-data/chats/Work/c1.json");
      expect(updated?.folderId).toBe("folder-1");
    });

    it("moves a conversation back to the root", async () => {
      const conv = makeConversation({
        id: "c1",
        path: "/mock-data/chats/Work/c1.json",
        folderId: "folder-1",
      });
      useChatStore.setState({ conversations: [conv], chatTree: [] });

      await useChatStore.getState().moveConversation("c1", null);

      expect(mockRenamePath).toHaveBeenCalledWith(
        "/mock-data/chats/Work/c1.json",
        "/mock-data/chats/c1.json"
      );
      const updated = useChatStore.getState().conversations.find((c) => c.id === "c1");
      expect(updated?.folderId).toBeUndefined();
    });

    it("is a no-op when the conversation has no path", async () => {
      const conv = makeConversation({ id: "c1" });
      useChatStore.setState({ conversations: [conv], chatTree: [] });

      await useChatStore.getState().moveConversation("c1", null);
      expect(mockRenamePath).not.toHaveBeenCalled();
    });

    it("is a no-op when the target folder does not exist", async () => {
      const conv = makeConversation({ id: "c1", path: "/mock-data/chats/c1.json" });
      useChatStore.setState({ conversations: [conv], chatTree: [] });

      await useChatStore.getState().moveConversation("c1", "missing-folder");
      expect(mockRenamePath).not.toHaveBeenCalled();
    });

    it("is a no-op when the conversation is already in the target folder", async () => {
      const conv = makeConversation({ id: "c1", path: "/mock-data/chats/c1.json" });
      useChatStore.setState({ conversations: [conv], chatTree: [] });

      await useChatStore.getState().moveConversation("c1", null);
      expect(mockRenamePath).not.toHaveBeenCalled();
    });
  });


  // -----------------------------------------------------------------------
  // loadChatsFromDisk
  // -----------------------------------------------------------------------
  describe("loadChatsFromDisk", () => {
    it("loads tree and syncs conversations", async () => {
      const chatNode = makeChatTreeNode({
        id: "chat-from-disk",
        name: "Disk Chat",
        title: "Disk Chat Title",
        path: "/mock-data/chats/chat-from-disk.json",
        updatedAt: "2025-06-01T00:00:00.000Z",
      });
      mockLoadChatTree.mockResolvedValueOnce([chatNode]);

      await useChatStore.getState().loadChatsFromDisk();

      const state = useChatStore.getState();
      expect(state.chatTree).toEqual([chatNode]);
      expect(state.conversations).toHaveLength(1);
      expect(state.conversations[0]!.id).toBe("chat-from-disk");
      expect(state.conversations[0]!.title).toBe("Disk Chat Title");
      expect(state.conversations[0]!.path).toBe("/mock-data/chats/chat-from-disk.json");
    });

    it("preserves in-memory messages when syncing from tree", async () => {
      const existingConv = makeConversation({
        id: "c1",
        messages: [makeMessage({ id: "m1", content: "In memory" })],
      });
      useChatStore.setState({ conversations: [existingConv] });

      const chatNode = makeChatTreeNode({ id: "c1", title: "Updated Title" });
      mockLoadChatTree.mockResolvedValueOnce([chatNode]);

      await useChatStore.getState().loadChatsFromDisk();

      const updated = useChatStore.getState().conversations.find((c) => c.id === "c1");
      expect(updated?.messages).toHaveLength(1);
      expect(updated?.messages[0]?.content).toBe("In memory");
    });

    it("keeps in-memory-only conversations that are not on disk", async () => {
      const memOnly = makeConversation({ id: "mem-only" });
      useChatStore.setState({ conversations: [memOnly] });

      const diskChat = makeChatTreeNode({ id: "disk-only", title: "Disk Only" });
      mockLoadChatTree.mockResolvedValueOnce([diskChat]);

      await useChatStore.getState().loadChatsFromDisk();

      const state = useChatStore.getState();
      expect(state.conversations).toHaveLength(2);
      expect(state.conversations.some((c) => c.id === "mem-only")).toBe(true);
      expect(state.conversations.some((c) => c.id === "disk-only")).toBe(true);
    });

    it("processes nested folder trees", async () => {
      const nestedChat = makeChatTreeNode({
        id: "nested-chat",
        title: "Nested",
        path: "/mock-data/chats/folder-1/nested-chat.json",
      });
      const folder = makeFolderTreeNode({
        id: "folder-1",
        children: [nestedChat],
      });
      mockLoadChatTree.mockResolvedValueOnce([folder]);

      await useChatStore.getState().loadChatsFromDisk();

      const state = useChatStore.getState();
      expect(state.conversations).toHaveLength(1);
      expect(state.conversations[0]!.id).toBe("nested-chat");
    });

    it("uses 'Untitled' for chats without a title", async () => {
      const chatNode = makeChatTreeNode({ id: "no-title", title: undefined, name: "no-title.json" });
      mockLoadChatTree.mockResolvedValueOnce([chatNode]);

      await useChatStore.getState().loadChatsFromDisk();

      expect(useChatStore.getState().conversations[0]!.title).toBe("Untitled");
    });

    it("handles loadChatTree failure gracefully", async () => {
      mockLoadChatTree.mockRejectedValueOnce(new Error("Disk error"));
      await useChatStore.getState().loadChatsFromDisk();
      // Should not throw, state stays as-is
      expect(useChatStore.getState().chatTree).toEqual([]);
    });
  });


  // -----------------------------------------------------------------------
  // createFolder
  // -----------------------------------------------------------------------
  describe("createFolder", () => {
    it("calls createChatFolder and reloads", async () => {
      await useChatStore.getState().createFolder("New Folder");
      expect(mockCreateChatFolder).toHaveBeenCalledWith("New Folder", undefined);
      expect(mockLoadChatTree).toHaveBeenCalled();
    });

    it("generates unique name when sibling folder has same name", async () => {
      const existingFolder = makeFolderTreeNode({ id: "f1", name: "Projects" });
      useChatStore.setState({ chatTree: [existingFolder] });

      await useChatStore.getState().createFolder("Projects");
      expect(mockCreateChatFolder).toHaveBeenCalledWith("Projects 2", undefined);
    });

    it("generates unique name with incrementing counter", async () => {
      const f1 = makeFolderTreeNode({ id: "f1", name: "Projects" });
      const f2 = makeFolderTreeNode({ id: "f2", name: "Projects 2" });
      useChatStore.setState({ chatTree: [f1, f2] });

      await useChatStore.getState().createFolder("Projects");
      expect(mockCreateChatFolder).toHaveBeenCalledWith("Projects 3", undefined);
    });

    it("uses parent folder path when parentFolderId is provided", async () => {
      const parentFolder = makeFolderTreeNode({
        id: "parent",
        name: "Parent",
        path: "/mock-data/chats/parent",
        children: [],
      });
      useChatStore.setState({ chatTree: [parentFolder] });

      await useChatStore.getState().createFolder("Child", "parent");
      expect(mockCreateChatFolder).toHaveBeenCalledWith("Child", "/mock-data/chats/parent");
    });

    it("handles createChatFolder error gracefully", async () => {
      mockCreateChatFolder.mockRejectedValueOnce(new Error("Disk full"));
      await useChatStore.getState().createFolder("Bad Folder");
      // Should not throw
    });

    it("avoids duplicate name among children of parent folder", async () => {
      const childFolder = makeFolderTreeNode({ id: "child", name: "Existing" });
      const parentFolder = makeFolderTreeNode({
        id: "parent",
        name: "Parent",
        path: "/mock-data/chats/parent",
        children: [childFolder],
      });
      useChatStore.setState({ chatTree: [parentFolder] });

      await useChatStore.getState().createFolder("Existing", "parent");
      expect(mockCreateChatFolder).toHaveBeenCalledWith("Existing 2", "/mock-data/chats/parent");
    });
  });


  // -----------------------------------------------------------------------
  // renameFolder
  // -----------------------------------------------------------------------
  describe("renameFolder", () => {
    it("renames a folder and reloads from disk", async () => {
      const folder = makeFolderTreeNode({
        id: "f1",
        name: "Old Name",
        path: "/mock-data/chats/old-name",
      });
      useChatStore.setState({ chatTree: [folder] });

      await useChatStore.getState().renameFolder("f1", "New Name");
      expect(mockRenameChatFolder).toHaveBeenCalledWith("/mock-data/chats/old-name", "New Name");
      expect(mockLoadChatTree).toHaveBeenCalled();
    });

    it("does nothing if folder not found in tree", async () => {
      useChatStore.setState({ chatTree: [] });
      await useChatStore.getState().renameFolder("nonexistent", "New Name");
      expect(mockRenameChatFolder).not.toHaveBeenCalled();
    });

    it("does nothing if node is a chat, not a folder", async () => {
      const chatNode = makeChatTreeNode({ id: "c1" });
      useChatStore.setState({ chatTree: [chatNode] });
      await useChatStore.getState().renameFolder("c1", "New Name");
      expect(mockRenameChatFolder).not.toHaveBeenCalled();
    });

    it("handles rename failure gracefully", async () => {
      const folder = makeFolderTreeNode({ id: "f1", path: "/mock-data/chats/f1" });
      useChatStore.setState({ chatTree: [folder] });
      mockRenameChatFolder.mockRejectedValueOnce(new Error("Permission denied"));
      await useChatStore.getState().renameFolder("f1", "New Name");
      // Should not throw
    });
  });


  // -----------------------------------------------------------------------
  // deleteFolder
  // -----------------------------------------------------------------------
  describe("deleteFolder", () => {
    it("deletes a folder and reloads from disk", async () => {
      const folder = makeFolderTreeNode({
        id: "f1",
        path: "/mock-data/chats/f1",
      });
      useChatStore.setState({ chatTree: [folder] });

      await useChatStore.getState().deleteFolder("f1");
      expect(mockDeleteChatFolder).toHaveBeenCalledWith("/mock-data/chats/f1");
      expect(mockLoadChatTree).toHaveBeenCalled();
    });

    it("does nothing if folder not found in tree", async () => {
      useChatStore.setState({ chatTree: [] });
      await useChatStore.getState().deleteFolder("nonexistent");
      expect(mockDeleteChatFolder).not.toHaveBeenCalled();
    });

    it("does nothing if node is a chat, not a folder", async () => {
      const chatNode = makeChatTreeNode({ id: "c1" });
      useChatStore.setState({ chatTree: [chatNode] });
      await useChatStore.getState().deleteFolder("c1");
      expect(mockDeleteChatFolder).not.toHaveBeenCalled();
    });

    it("handles delete failure gracefully", async () => {
      const folder = makeFolderTreeNode({ id: "f1", path: "/mock-data/chats/f1" });
      useChatStore.setState({ chatTree: [folder] });
      mockDeleteChatFolder.mockRejectedValueOnce(new Error("In use"));
      await useChatStore.getState().deleteFolder("f1");
      // Should not throw
    });
  });


  // -----------------------------------------------------------------------
  // toggleFolderPin
  // -----------------------------------------------------------------------
  describe("toggleFolderPin", () => {
    // The _meta.yaml rule itself is tested in storage.test.ts (toggleFolderPin).
    it("toggles the folder's pin on disk and reloads", async () => {
      const folder = makeFolderTreeNode({
        id: "f1",
        path: "/mock-data/chats/f1",
        isPinned: false,
      });
      useChatStore.setState({ chatTree: [folder] });

      await useChatStore.getState().toggleFolderPin("f1");

      expect(mockToggleChatFolderPin).toHaveBeenCalledWith("/mock-data/chats/f1");
      expect(mockLoadChatTree).toHaveBeenCalled();
    });

    it("does nothing if folder not found in tree", async () => {
      useChatStore.setState({ chatTree: [] });
      await useChatStore.getState().toggleFolderPin("nonexistent");
      expect(mockToggleChatFolderPin).not.toHaveBeenCalled();
    });

    it("does nothing if node is a chat, not a folder", async () => {
      const chatNode = makeChatTreeNode({ id: "c1" });
      useChatStore.setState({ chatTree: [chatNode] });
      await useChatStore.getState().toggleFolderPin("c1");
      expect(mockToggleChatFolderPin).not.toHaveBeenCalled();
    });

    it("handles errors gracefully", async () => {
      const folder = makeFolderTreeNode({ id: "f1", path: "/mock-data/chats/f1" });
      useChatStore.setState({ chatTree: [folder] });
      mockToggleChatFolderPin.mockRejectedValueOnce(new Error("Disk error"));
      await useChatStore.getState().toggleFolderPin("f1");
      // Should not throw
    });

    it("finds nested folders in tree", async () => {
      const nestedFolder = makeFolderTreeNode({
        id: "nested",
        name: "Nested",
        path: "/mock-data/chats/parent/nested",
        children: [],
      });
      const parentFolder = makeFolderTreeNode({
        id: "parent",
        name: "Parent",
        path: "/mock-data/chats/parent",
        children: [nestedFolder],
      });
      useChatStore.setState({ chatTree: [parentFolder] });

      await useChatStore.getState().toggleFolderPin("nested");

      expect(mockToggleChatFolderPin).toHaveBeenCalledWith("/mock-data/chats/parent/nested");
    });
  });


  // -----------------------------------------------------------------------
  // findNodeInTree (tested through store behavior)
  // -----------------------------------------------------------------------
  describe("findNodeInTree (via store behavior)", () => {
    it("finds a top-level folder", async () => {
      const folder = makeFolderTreeNode({
        id: "top-folder",
        path: "/mock-data/chats/top-folder",
      });
      useChatStore.setState({ chatTree: [folder] });

      await useChatStore.getState().renameFolder("top-folder", "Renamed");
      expect(mockRenameChatFolder).toHaveBeenCalledWith("/mock-data/chats/top-folder", "Renamed");
    });

    it("finds a deeply nested folder", async () => {
      const deepFolder = makeFolderTreeNode({
        id: "deep",
        name: "Deep",
        path: "/mock-data/chats/a/b/deep",
        children: [],
      });
      const midFolder = makeFolderTreeNode({
        id: "mid",
        name: "Mid",
        path: "/mock-data/chats/a/b",
        children: [deepFolder],
      });
      const topFolder = makeFolderTreeNode({
        id: "top",
        name: "Top",
        path: "/mock-data/chats/a",
        children: [midFolder],
      });
      useChatStore.setState({ chatTree: [topFolder] });

      await useChatStore.getState().deleteFolder("deep");
      expect(mockDeleteChatFolder).toHaveBeenCalledWith("/mock-data/chats/a/b/deep");
    });

    it("returns null when node not found (folder operations skip)", async () => {
      useChatStore.setState({ chatTree: [] });
      await useChatStore.getState().renameFolder("missing", "New Name");
      expect(mockRenameChatFolder).not.toHaveBeenCalled();
    });
  });
});
