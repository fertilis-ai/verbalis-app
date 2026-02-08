import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));

const mockListToolboxItems = vi.fn().mockResolvedValue([]);
const mockLoadToolboxItem = vi.fn().mockResolvedValue(null);
const mockSaveToolboxItem = vi.fn().mockResolvedValue(undefined);
const mockDeleteToolboxItem = vi.fn().mockResolvedValue(undefined);
const mockRenameToolboxItem = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/storage", () => ({
  listToolboxItems: (...args: unknown[]) => mockListToolboxItems(...args),
  loadToolboxItem: (...args: unknown[]) => mockLoadToolboxItem(...args),
  saveToolboxItem: (...args: unknown[]) => mockSaveToolboxItem(...args),
  deleteToolboxItem: (...args: unknown[]) => mockDeleteToolboxItem(...args),
  renameToolboxItem: (...args: unknown[]) => mockRenameToolboxItem(...args),
}));

import { useToolboxStore, itemKey } from "./toolbox-store";
import type { ToolboxCategory, ToolboxItem } from "./toolbox-store";

function getState() {
  return useToolboxStore.getState();
}

function makeItem(overrides: Partial<ToolboxItem> = {}): ToolboxItem {
  return {
    name: "test-item",
    content: "test content",
    category: "prompts",
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useToolboxStore.setState({
    items: [],
    selectedItem: null,
    expandedFolders: new Set<ToolboxCategory>(["agents"]),
    isLoading: false,
    openItems: [],
    activeItemKey: null,
  });
});

describe("toolbox-store", () => {
  describe("itemKey", () => {
    it("returns category/name format", () => {
      expect(itemKey("prompts", "hello")).toBe("prompts/hello");
      expect(itemKey("agents", "my-agent")).toBe("agents/my-agent");
    });
  });

  describe("initial state", () => {
    it("has correct defaults", () => {
      const state = getState();
      expect(state.items).toEqual([]);
      expect(state.selectedItem).toBeNull();
      expect(state.expandedFolders.has("agents")).toBe(true);
      expect(state.expandedFolders.size).toBe(1);
      expect(state.isLoading).toBe(false);
      expect(state.openItems).toEqual([]);
      expect(state.activeItemKey).toBeNull();
    });
  });

  describe("setItems", () => {
    it("replaces items array", () => {
      const items = [makeItem(), makeItem({ name: "second", category: "agents" })];
      getState().setItems(items);
      expect(getState().items).toEqual(items);
    });
  });

  describe("toggleFolderExpansion", () => {
    it("adds category when not expanded", () => {
      getState().toggleFolderExpansion("prompts");
      expect(getState().expandedFolders.has("prompts")).toBe(true);
      expect(getState().expandedFolders.has("agents")).toBe(true);
    });

    it("removes category when already expanded", () => {
      getState().toggleFolderExpansion("agents");
      expect(getState().expandedFolders.has("agents")).toBe(false);
    });

    it("toggles back and forth", () => {
      getState().toggleFolderExpansion("skills");
      expect(getState().expandedFolders.has("skills")).toBe(true);
      getState().toggleFolderExpansion("skills");
      expect(getState().expandedFolders.has("skills")).toBe(false);
    });
  });

  describe("loadItemsFromDisk", () => {
    it("sets isLoading during load", async () => {
      mockListToolboxItems.mockResolvedValue([]);
      const promise = getState().loadItemsFromDisk();
      expect(getState().isLoading).toBe(true);
      await promise;
      expect(getState().isLoading).toBe(false);
    });

    it("loads items from all categories", async () => {
      mockListToolboxItems.mockImplementation((category: string) => {
        if (category === "prompts") return Promise.resolve(["p1"]);
        if (category === "agents") return Promise.resolve(["a1"]);
        return Promise.resolve([]);
      });
      mockLoadToolboxItem.mockImplementation((category: string, name: string) => {
        return Promise.resolve({
          name,
          category,
          content: `${category}/${name} content`,
          updatedAt: "2026-01-01T00:00:00.000Z",
        });
      });

      await getState().loadItemsFromDisk();

      expect(getState().items).toHaveLength(2);
      expect(getState().items[0].name).toBe("p1");
      expect(getState().items[0].category).toBe("prompts");
      expect(getState().items[1].name).toBe("a1");
      expect(getState().items[1].category).toBe("agents");
      expect(getState().isLoading).toBe(false);
    });

    it("skips null items from loadToolboxItem", async () => {
      mockListToolboxItems.mockImplementation((category: string) =>
        category === "prompts" ? Promise.resolve(["exists", "missing"]) : Promise.resolve([])
      );
      mockLoadToolboxItem.mockImplementation((_cat: string, name: string) =>
        name === "exists"
          ? Promise.resolve({ name: "exists", category: "prompts", content: "c", updatedAt: "2026-01-01T00:00:00.000Z" })
          : Promise.resolve(null)
      );

      await getState().loadItemsFromDisk();
      expect(getState().items).toHaveLength(1);
      expect(getState().items[0].name).toBe("exists");
    });

    it("handles errors gracefully", async () => {
      mockListToolboxItems.mockRejectedValue(new Error("disk error"));

      await getState().loadItemsFromDisk();
      expect(getState().isLoading).toBe(false);
      expect(getState().items).toEqual([]);
    });
  });

  describe("createItem", () => {
    it("saves to disk and adds to items", async () => {
      await getState().createItem("new-prompt", "prompts");

      expect(mockSaveToolboxItem).toHaveBeenCalledOnce();
      const savedArg = mockSaveToolboxItem.mock.calls[0][0];
      expect(savedArg.name).toBe("new-prompt");
      expect(savedArg.category).toBe("prompts");
      expect(savedArg.content).toContain("new-prompt");

      const { items, selectedItem } = getState();
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe("new-prompt");
      expect(items[0].category).toBe("prompts");
      expect(selectedItem).not.toBeNull();
    });

    it("opens the item as a tab after creation", async () => {
      // Pre-populate items so openItem can find it
      // createItem adds the item to the store first, then calls openItem
      await getState().createItem("my-agent", "agents");

      const { openItems, activeItemKey } = getState();
      expect(openItems).toHaveLength(1);
      expect(openItems[0].name).toBe("my-agent");
      expect(openItems[0].category).toBe("agents");
      expect(activeItemKey).toBe("agents/my-agent");
    });

    it("generates correct default content for each category", async () => {
      await getState().createItem("test", "prompts");
      expect(mockSaveToolboxItem.mock.calls[0][0].content).toContain("{{input}}");

      vi.clearAllMocks();
      useToolboxStore.setState({ items: [], openItems: [] });
      await getState().createItem("test", "memories");
      expect(mockSaveToolboxItem.mock.calls[0][0].content).toContain("# test");

      vi.clearAllMocks();
      useToolboxStore.setState({ items: [], openItems: [] });
      await getState().createItem("test", "agents");
      expect(mockSaveToolboxItem.mock.calls[0][0].content).toContain("model:");

      vi.clearAllMocks();
      useToolboxStore.setState({ items: [], openItems: [] });
      await getState().createItem("test", "skills");
      expect(mockSaveToolboxItem.mock.calls[0][0].content).toContain("trigger:");

      vi.clearAllMocks();
      useToolboxStore.setState({ items: [], openItems: [] });
      await getState().createItem("test", "workflows");
      expect(mockSaveToolboxItem.mock.calls[0][0].content).toContain("schedule:");
    });
  });

  describe("updateItem", () => {
    it("saves to disk and updates items", async () => {
      const item = makeItem({ name: "edit-me", category: "prompts" });
      useToolboxStore.setState({ items: [item] });

      await getState().updateItem("prompts", "edit-me", "new content");

      expect(mockSaveToolboxItem).toHaveBeenCalledOnce();
      expect(getState().items[0].content).toBe("new content");
    });

    it("updates selectedItem if it matches", async () => {
      const item = makeItem({ name: "edit-me", category: "prompts" });
      useToolboxStore.setState({ items: [item], selectedItem: item });

      await getState().updateItem("prompts", "edit-me", "new content");

      expect(getState().selectedItem?.content).toBe("new content");
    });

    it("does not update selectedItem if different", async () => {
      const item = makeItem({ name: "edit-me", category: "prompts" });
      const other = makeItem({ name: "other", category: "agents" });
      useToolboxStore.setState({ items: [item, other], selectedItem: other });

      await getState().updateItem("prompts", "edit-me", "new content");

      expect(getState().selectedItem?.name).toBe("other");
      expect(getState().selectedItem?.content).toBe("test content");
    });
  });

  describe("deleteItem", () => {
    it("removes item from disk and store", async () => {
      const item = makeItem({ name: "del-me", category: "prompts" });
      useToolboxStore.setState({ items: [item] });

      await getState().deleteItem("prompts", "del-me");

      expect(mockDeleteToolboxItem).toHaveBeenCalledWith("prompts", "del-me");
      expect(getState().items).toHaveLength(0);
    });

    it("closes open tab when deleting an open item", async () => {
      const item = makeItem({ name: "del-me", category: "prompts" });
      useToolboxStore.setState({
        items: [item],
        openItems: [
          { category: "prompts", name: "del-me", originalContent: "c", currentContent: "c", isModified: false },
        ],
        activeItemKey: "prompts/del-me",
      });

      await getState().deleteItem("prompts", "del-me");

      expect(getState().openItems).toHaveLength(0);
      expect(getState().activeItemKey).toBeNull();
    });

    it("clears selectedItem if it matches the deleted item", async () => {
      const item = makeItem({ name: "del-me", category: "prompts" });
      useToolboxStore.setState({ items: [item], selectedItem: item });

      await getState().deleteItem("prompts", "del-me");

      expect(getState().selectedItem).toBeNull();
    });
  });

  describe("renameItem", () => {
    it("renames on disk and updates store", async () => {
      const item = makeItem({ name: "old-name", category: "agents" });
      useToolboxStore.setState({ items: [item] });

      await getState().renameItem("agents", "old-name", "new-name");

      expect(mockRenameToolboxItem).toHaveBeenCalledWith("agents", "old-name", "new-name");
      expect(getState().items[0].name).toBe("new-name");
    });

    it("updates selectedItem if it matches", async () => {
      const item = makeItem({ name: "old-name", category: "agents" });
      useToolboxStore.setState({ items: [item], selectedItem: item });

      await getState().renameItem("agents", "old-name", "new-name");

      expect(getState().selectedItem?.name).toBe("new-name");
    });

    it("updates open items and activeItemKey", async () => {
      const item = makeItem({ name: "old-name", category: "agents" });
      useToolboxStore.setState({
        items: [item],
        openItems: [
          { category: "agents", name: "old-name", originalContent: "c", currentContent: "c", isModified: false },
        ],
        activeItemKey: "agents/old-name",
      });

      await getState().renameItem("agents", "old-name", "new-name");

      expect(getState().openItems[0].name).toBe("new-name");
      expect(getState().activeItemKey).toBe("agents/new-name");
    });
  });

  describe("openItem", () => {
    it("opens an item as a new tab", () => {
      const item = makeItem({ name: "open-me", category: "prompts", content: "hello" });
      useToolboxStore.setState({ items: [item] });

      getState().openItem("prompts", "open-me");

      const { openItems, activeItemKey, selectedItem } = getState();
      expect(openItems).toHaveLength(1);
      expect(openItems[0].name).toBe("open-me");
      expect(openItems[0].originalContent).toBe("hello");
      expect(openItems[0].currentContent).toBe("hello");
      expect(openItems[0].isModified).toBe(false);
      expect(activeItemKey).toBe("prompts/open-me");
      expect(selectedItem?.name).toBe("open-me");
    });

    it("activates already-open item without duplicating", () => {
      const item = makeItem({ name: "open-me", category: "prompts" });
      useToolboxStore.setState({
        items: [item],
        openItems: [
          { category: "prompts", name: "open-me", originalContent: "c", currentContent: "c", isModified: false },
        ],
        activeItemKey: null,
      });

      getState().openItem("prompts", "open-me");

      expect(getState().openItems).toHaveLength(1);
      expect(getState().activeItemKey).toBe("prompts/open-me");
    });

    it("does nothing if item not found in items", () => {
      useToolboxStore.setState({ items: [] });

      getState().openItem("prompts", "nonexistent");

      expect(getState().openItems).toHaveLength(0);
      expect(getState().activeItemKey).toBeNull();
    });
  });

  describe("closeItem", () => {
    it("removes the tab and selects next item", () => {
      const items = [
        makeItem({ name: "a", category: "prompts" }),
        makeItem({ name: "b", category: "prompts" }),
      ];
      useToolboxStore.setState({
        items,
        openItems: [
          { category: "prompts", name: "a", originalContent: "c", currentContent: "c", isModified: false },
          { category: "prompts", name: "b", originalContent: "c", currentContent: "c", isModified: false },
        ],
        activeItemKey: "prompts/a",
      });

      getState().closeItem("prompts", "a");

      expect(getState().openItems).toHaveLength(1);
      expect(getState().openItems[0].name).toBe("b");
      expect(getState().activeItemKey).toBe("prompts/b");
    });

    it("sets null activeItemKey when closing last tab", () => {
      const item = makeItem({ name: "only", category: "prompts" });
      useToolboxStore.setState({
        items: [item],
        openItems: [
          { category: "prompts", name: "only", originalContent: "c", currentContent: "c", isModified: false },
        ],
        activeItemKey: "prompts/only",
      });

      getState().closeItem("prompts", "only");

      expect(getState().openItems).toHaveLength(0);
      expect(getState().activeItemKey).toBeNull();
      expect(getState().selectedItem).toBeNull();
    });

    it("keeps activeItemKey if closing a non-active tab", () => {
      const items = [
        makeItem({ name: "a", category: "prompts" }),
        makeItem({ name: "b", category: "prompts" }),
      ];
      useToolboxStore.setState({
        items,
        openItems: [
          { category: "prompts", name: "a", originalContent: "c", currentContent: "c", isModified: false },
          { category: "prompts", name: "b", originalContent: "c", currentContent: "c", isModified: false },
        ],
        activeItemKey: "prompts/a",
      });

      getState().closeItem("prompts", "b");

      expect(getState().openItems).toHaveLength(1);
      expect(getState().activeItemKey).toBe("prompts/a");
    });
  });

  describe("selectItem", () => {
    it("opens the item when name is provided", () => {
      const item = makeItem({ name: "sel", category: "prompts" });
      useToolboxStore.setState({ items: [item] });

      getState().selectItem("prompts", "sel");

      expect(getState().openItems).toHaveLength(1);
      expect(getState().activeItemKey).toBe("prompts/sel");
    });

    it("sets selectedItem to null when name is null", () => {
      useToolboxStore.setState({ selectedItem: makeItem() });

      getState().selectItem("prompts", null);

      expect(getState().selectedItem).toBeNull();
    });
  });

  describe("setActiveItem", () => {
    it("sets activeItemKey and selectedItem", () => {
      const item = makeItem({ name: "act", category: "agents" });
      useToolboxStore.setState({ items: [item] });

      getState().setActiveItem("agents", "act");

      expect(getState().activeItemKey).toBe("agents/act");
      expect(getState().selectedItem?.name).toBe("act");
    });

    it("sets selectedItem to null if not found", () => {
      useToolboxStore.setState({ items: [] });

      getState().setActiveItem("agents", "nonexistent");

      expect(getState().activeItemKey).toBe("agents/nonexistent");
      expect(getState().selectedItem).toBeNull();
    });
  });

  describe("updateOpenItemContent", () => {
    it("updates content and sets isModified", () => {
      useToolboxStore.setState({
        openItems: [
          { category: "prompts", name: "edit", originalContent: "original", currentContent: "original", isModified: false },
        ],
      });

      getState().updateOpenItemContent("prompts", "edit", "modified");

      const open = getState().openItems[0];
      expect(open.currentContent).toBe("modified");
      expect(open.isModified).toBe(true);
    });

    it("clears isModified when content matches original", () => {
      useToolboxStore.setState({
        openItems: [
          { category: "prompts", name: "edit", originalContent: "original", currentContent: "modified", isModified: true },
        ],
      });

      getState().updateOpenItemContent("prompts", "edit", "original");

      expect(getState().openItems[0].isModified).toBe(false);
    });
  });

  describe("markOpenItemSaved", () => {
    it("resets isModified and updates both content fields", () => {
      useToolboxStore.setState({
        openItems: [
          { category: "prompts", name: "save", originalContent: "old", currentContent: "new", isModified: true },
        ],
      });

      getState().markOpenItemSaved("prompts", "save", "new");

      const open = getState().openItems[0];
      expect(open.originalContent).toBe("new");
      expect(open.currentContent).toBe("new");
      expect(open.isModified).toBe(false);
    });
  });
});
