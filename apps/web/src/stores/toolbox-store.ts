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

interface ToolboxState {
  items: ToolboxItem[];
  selectedItem: ToolboxItem | null;
  expandedFolders: Set<ToolboxCategory>;
  isLoading: boolean;

  setItems: (items: ToolboxItem[]) => void;
  selectItem: (category: ToolboxCategory, name: string | null) => void;
  toggleFolderExpansion: (category: ToolboxCategory) => void;
  loadItemsFromDisk: () => Promise<void>;
  createItem: (name: string, category: ToolboxCategory) => Promise<void>;
  updateItem: (category: ToolboxCategory, name: string, content: string) => Promise<void>;
  deleteItem: (category: ToolboxCategory, name: string) => Promise<void>;
  renameItem: (category: ToolboxCategory, oldName: string, newName: string) => Promise<void>;
}

const CATEGORIES: ToolboxCategory[] = ["prompts", "memories", "agents", "skills", "workflows"];

export const useToolboxStore = create<ToolboxState>((set, get) => ({
  items: [],
  selectedItem: null,
  expandedFolders: new Set<ToolboxCategory>(["agents"]), // Default expanded
  isLoading: false,

  setItems: (items) => set({ items }),

  selectItem: (category, name) => {
    const item = name
      ? get().items.find((i) => i.name === name && i.category === category) ?? null
      : null;
    set({ selectedItem: item });
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

    set((state) => ({
      items: state.items.map((i) =>
        i.name === oldName && i.category === category
          ? { ...i, name: newName, updatedAt: new Date() }
          : i
      ),
      selectedItem:
        state.selectedItem?.name === oldName && state.selectedItem?.category === category
          ? { ...state.selectedItem, name: newName, updatedAt: new Date() }
          : state.selectedItem,
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
