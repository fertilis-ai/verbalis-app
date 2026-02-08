import { create } from "zustand";
import {
  saveToolboxItem,
  loadToolboxItem,
  listToolboxItems,
  deleteToolboxItem,
  renameToolboxItem,
  type ToolboxItemData,
} from "@/lib/storage";

export type ToolboxCategory = "prompts" | "memories" | "agents" | "skills" | "workflows";

export interface ToolboxItem {
  name: string;
  content: string;
  category: ToolboxCategory;
  updatedAt: Date;
}

export interface OpenToolboxItem {
  category: ToolboxCategory;
  name: string;
  originalContent: string;
  currentContent: string;
  isModified: boolean;
}

export function itemKey(category: ToolboxCategory, name: string): string {
  return `${category}/${name}`;
}

interface ToolboxState {
  items: ToolboxItem[];
  selectedItem: ToolboxItem | null;
  expandedFolders: Set<ToolboxCategory>;
  isLoading: boolean;
  openItems: OpenToolboxItem[];
  activeItemKey: string | null;

  setItems: (items: ToolboxItem[]) => void;
  selectItem: (category: ToolboxCategory, name: string | null) => void;
  toggleFolderExpansion: (category: ToolboxCategory) => void;
  loadItemsFromDisk: () => Promise<void>;
  createItem: (name: string, category: ToolboxCategory) => Promise<void>;
  updateItem: (category: ToolboxCategory, name: string, content: string) => Promise<void>;
  deleteItem: (category: ToolboxCategory, name: string) => Promise<void>;
  renameItem: (category: ToolboxCategory, oldName: string, newName: string) => Promise<void>;
  openItem: (category: ToolboxCategory, name: string) => void;
  closeItem: (category: ToolboxCategory, name: string) => void;
  setActiveItem: (category: ToolboxCategory, name: string) => void;
  updateOpenItemContent: (category: ToolboxCategory, name: string, content: string) => void;
  markOpenItemSaved: (category: ToolboxCategory, name: string, savedContent: string) => void;
}

const CATEGORIES: ToolboxCategory[] = ["prompts", "memories", "agents", "skills", "workflows"];

export const useToolboxStore = create<ToolboxState>((set, get) => ({
  items: [],
  selectedItem: null,
  expandedFolders: new Set<ToolboxCategory>(["agents"]), // Default expanded
  isLoading: false,
  openItems: [],
  activeItemKey: null,

  setItems: (items) => set({ items }),

  selectItem: (category, name) => {
    if (name) {
      get().openItem(category, name);
    } else {
      set({ selectedItem: null });
    }
  },

  toggleFolderExpansion: (category) => {
    set((state) => {
      const newExpanded = new Set(state.expandedFolders);
      if (newExpanded.has(category)) {
        newExpanded.delete(category);
      } else {
        newExpanded.add(category);
      }
      return { expandedFolders: newExpanded };
    });
  },

  loadItemsFromDisk: async () => {
    set({ isLoading: true });
    try {
      const allItems: ToolboxItem[] = [];

      for (const category of CATEGORIES) {
        const names = await listToolboxItems(category);
        for (const name of names) {
          const item = await loadToolboxItem(category, name);
          if (item) {
            allItems.push({
              name: item.name,
              content: item.content,
              category: item.category,
              updatedAt: new Date(item.updatedAt),
            });
          }
        }
      }

      set({ items: allItems, isLoading: false });
    } catch (error) {
      console.error("Failed to load toolbox items from disk:", error);
      set({ isLoading: false });
    }
  },

  createItem: async (name, category) => {
    const defaultContent = getDefaultContent(category, name);
    const item: ToolboxItem = {
      name,
      content: defaultContent,
      category,
      updatedAt: new Date(),
    };

    // Save to disk
    const itemData: ToolboxItemData = {
      name: item.name,
      category: item.category,
      content: item.content,
      updatedAt: item.updatedAt.toISOString(),
    };
    await saveToolboxItem(itemData);

    set((state) => ({
      items: [...state.items, item],
      selectedItem: item,
    }));

    // Open as tab
    get().openItem(category, name);
  },

  updateItem: async (category, name, content) => {
    // Save to disk
    const itemData: ToolboxItemData = {
      name,
      category,
      content,
      updatedAt: new Date().toISOString(),
    };
    await saveToolboxItem(itemData);

    set((state) => {
      const items = state.items.map((i) =>
        i.name === name && i.category === category
          ? { ...i, content, updatedAt: new Date() }
          : i
      );
      return {
        items,
        selectedItem:
          state.selectedItem?.name === name && state.selectedItem?.category === category
            ? { ...state.selectedItem, content, updatedAt: new Date() }
            : state.selectedItem,
      };
    });
  },

  deleteItem: async (category, name) => {
    // Close tab if open
    const { openItems } = get();
    const key = itemKey(category, name);
    if (openItems.some((i) => itemKey(i.category, i.name) === key)) {
      get().closeItem(category, name);
    }

    // Delete from disk
    await deleteToolboxItem(category, name);

    set((state) => ({
      items: state.items.filter(
        (i) => !(i.name === name && i.category === category)
      ),
      selectedItem:
        state.selectedItem?.name === name && state.selectedItem?.category === category
          ? null
          : state.selectedItem,
    }));
  },

  renameItem: async (category, oldName, newName) => {
    // Rename on disk
    await renameToolboxItem(category, oldName, newName);

    set((state) => {
      const oldKey = itemKey(category, oldName);
      const newKey = itemKey(category, newName);

      return {
        items: state.items.map((i) =>
          i.name === oldName && i.category === category
            ? { ...i, name: newName, updatedAt: new Date() }
            : i
        ),
        selectedItem:
          state.selectedItem?.name === oldName && state.selectedItem?.category === category
            ? { ...state.selectedItem, name: newName, updatedAt: new Date() }
            : state.selectedItem,
        openItems: state.openItems.map((i) =>
          itemKey(i.category, i.name) === oldKey
            ? { ...i, name: newName }
            : i
        ),
        activeItemKey: state.activeItemKey === oldKey ? newKey : state.activeItemKey,
      };
    });
  },

  openItem: (category, name) => {
    const { items, openItems } = get();
    const key = itemKey(category, name);
    const alreadyOpen = openItems.some((i) => itemKey(i.category, i.name) === key);

    if (alreadyOpen) {
      const item = items.find((i) => i.name === name && i.category === category) ?? null;
      set({ activeItemKey: key, selectedItem: item });
      return;
    }

    const sourceItem = items.find((i) => i.name === name && i.category === category);
    if (!sourceItem) return;

    const openItem: OpenToolboxItem = {
      category,
      name,
      originalContent: sourceItem.content,
      currentContent: sourceItem.content,
      isModified: false,
    };

    set({
      openItems: [...openItems, openItem],
      activeItemKey: key,
      selectedItem: sourceItem,
    });
  },

  closeItem: (category, name) => {
    const { openItems, activeItemKey } = get();
    const key = itemKey(category, name);
    const closedIndex = openItems.findIndex((i) => itemKey(i.category, i.name) === key);
    const newOpenItems = openItems.filter((i) => itemKey(i.category, i.name) !== key);

    let newActiveKey = activeItemKey;
    if (activeItemKey === key) {
      if (newOpenItems.length > 0) {
        const nextItem = newOpenItems[Math.min(closedIndex, newOpenItems.length - 1)];
        newActiveKey = itemKey(nextItem.category, nextItem.name);
      } else {
        newActiveKey = null;
      }
    }

    // Update selectedItem to match new active tab
    let newSelectedItem = null;
    if (newActiveKey) {
      const activeOpen = newOpenItems.find((i) => itemKey(i.category, i.name) === newActiveKey);
      if (activeOpen) {
        newSelectedItem = get().items.find(
          (i) => i.name === activeOpen.name && i.category === activeOpen.category
        ) ?? null;
      }
    }

    set({
      openItems: newOpenItems,
      activeItemKey: newActiveKey,
      selectedItem: newSelectedItem,
    });
  },

  setActiveItem: (category, name) => {
    const key = itemKey(category, name);
    const item = get().items.find((i) => i.name === name && i.category === category) ?? null;
    set({ activeItemKey: key, selectedItem: item });
  },

  updateOpenItemContent: (category, name, content) => {
    const key = itemKey(category, name);
    set((state) => ({
      openItems: state.openItems.map((i) =>
        itemKey(i.category, i.name) === key
          ? { ...i, currentContent: content, isModified: content !== i.originalContent }
          : i
      ),
    }));
  },

  markOpenItemSaved: (category, name, savedContent) => {
    const key = itemKey(category, name);
    set((state) => ({
      openItems: state.openItems.map((i) =>
        itemKey(i.category, i.name) === key
          ? { ...i, originalContent: savedContent, currentContent: savedContent, isModified: false }
          : i
      ),
    }));
  },
}));

function getDefaultContent(category: ToolboxCategory, name: string): string {
  switch (category) {
    case "prompts":
      return `name: ${name}
description: Description here
template: |
  Your prompt template here

  {{input}}`;
    case "memories":
      return `# ${name}

Add your memories and context here.`;
    case "agents":
      return `---
name: ${name}
model: claude-sonnet-4-20250514
temperature: 0.7
---

You are a helpful AI assistant.`;
    case "skills":
      return `---
name: ${name}
trigger: "keyword|pattern"
---

# ${name}

Add skill content here.`;
    case "workflows":
      return `name: ${name}
trigger:
  schedule: "0 9 * * *"
steps:
  - agent: assistant
    prompt: "Your prompt here"`;
    default:
      return "";
  }
}
