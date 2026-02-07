import * as React from "react";
import {
  Plus,
  ChevronRight,
  MoreVertical,
  Pencil,
  Trash2,
  MessageSquareText,
  Brain,
  Bot,
  Zap,
  GitBranch,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useToolboxStore, type ToolboxCategory, type ToolboxItem } from "@/stores/toolbox-store";

const CATEGORIES: { id: ToolboxCategory; label: string; icon: LucideIcon }[] = [
  { id: "agents", label: "Agents", icon: Bot },
  { id: "memories", label: "Memories", icon: Brain },
  { id: "prompts", label: "Prompts", icon: MessageSquareText },
  { id: "skills", label: "Skills", icon: Zap },
  { id: "workflows", label: "Workflows", icon: GitBranch },
];

export function ToolboxSidebar() {
  const {
    items,
    selectedItem,
    expandedFolders,
    toggleFolderExpansion,
    selectItem,
    createItem,
    deleteItem,
    renameItem,
    loadItemsFromDisk,
  } = useToolboxStore();

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");
  const editInputRef = React.useRef<HTMLInputElement>(null);

  // Load items from disk on mount
  React.useEffect(() => {
    loadItemsFromDisk();
  }, [loadItemsFromDisk]);

  React.useEffect(() => {
    if (editingId) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingId]);

  // Generate a unique name for a new item (e.g., "Untitled Prompt", "Untitled Prompt 2", etc.)
  const generateUniqueName = (baseName: string, category: ToolboxCategory) => {
    const categoryItems = items.filter((i) => i.category === category);
    const existingNames = new Set(categoryItems.map((i) => i.name));

    if (!existingNames.has(baseName)) return baseName;

    let counter = 2;
    while (existingNames.has(`${baseName} ${counter}`)) {
      counter++;
    }
    return `${baseName} ${counter}`;
  };

  const handleStartCreate = async (category: ToolboxCategory, singularLabel: string) => {
    // Expand the folder when creating
    if (!expandedFolders.has(category)) {
      toggleFolderExpansion(category);
    }

    // Generate default name (e.g., "Untitled Prompt", "Untitled Agent")
    const baseName = `Untitled ${singularLabel}`;
    const defaultName = generateUniqueName(baseName, category);

    // Create item immediately with default name
    await createItem(defaultName, category);

    // Put the new item in edit mode
    setEditingId(`${category}-${defaultName}`);
    setEditingName(defaultName);
  };

  const handleStartRename = (item: ToolboxItem) => {
    setEditingId(`${item.category}-${item.name}`);
    setEditingName(item.name);
  };

  const handleRenameSubmit = async (item: ToolboxItem) => {
    if (editingName.trim() && editingName !== item.name) {
      await renameItem(item.category, item.name, editingName.trim());
    }
    setEditingId(null);
    setEditingName("");
  };

  const handleDelete = async (item: ToolboxItem) => {
    await deleteItem(item.category, item.name);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-10 items-center justify-between border-b border-border px-2">
        <span className="text-sm font-medium">Toolbox</span>
      </div>

      {/* Category folders */}
      <div className="flex-1 overflow-auto p-2">
        <div className="flex flex-col gap-0.5">
          {CATEGORIES.map(({ id: category, label, icon: ItemIcon }) => {
            const isExpanded = expandedFolders.has(category);
            const categoryItems = items.filter((i) => i.category === category);

            return (
              <div key={category}>
                {/* Folder row */}
                <div
                  className="group flex items-center gap-1 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-muted"
                  style={{ paddingLeft: "8px" }}
                >
                  <button
                    className="flex-shrink-0 p-0.5 hover:bg-muted-foreground/10 rounded"
                    onClick={() => toggleFolderExpansion(category)}
                  >
                    <ChevronRight
                      className={cn(
                        "h-3 w-3 transition-transform",
                        isExpanded && "rotate-90"
                      )}
                    />
                  </button>

                  <span
                    className="flex-1 truncate"
                    onClick={() => toggleFolderExpansion(category)}
                  >
                    {label}
                  </span>

                  {/* Create button on hover */}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      const singularLabel = label.slice(0, -1); // "Prompts" → "Prompt"
                      handleStartCreate(category, singularLabel);
                    }}
                    title={`New ${label.slice(0, -1).toLowerCase()}`}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>

                {/* Children (items) */}
                {isExpanded && (
                  <div>
                    {/* Empty state */}
                    {categoryItems.length === 0 && (
                      <p
                        className="px-2 py-2 text-xs text-muted-foreground"
                        style={{ paddingLeft: "32px" }}
                      >
                        No {label.toLowerCase()} yet
                      </p>
                    )}

                    {/* Items */}
                    {categoryItems.map((item) => {
                      const itemKey = `${item.category}-${item.name}`;
                      const isEditing = editingId === itemKey;
                      const isSelected =
                        selectedItem?.name === item.name &&
                        selectedItem?.category === item.category;

                      return (
                        <div
                          key={itemKey}
                          className={cn(
                            "group flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-muted",
                            isSelected && "bg-muted"
                          )}
                          style={{ paddingLeft: "32px" }}
                          onClick={() => selectItem(item.category, item.name)}
                        >
                          <ItemIcon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                          {isEditing ? (
                            <input
                              ref={editInputRef}
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleRenameSubmit(item);
                                if (e.key === "Escape") {
                                  setEditingId(null);
                                  setEditingName("");
                                }
                              }}
                              onBlur={() => handleRenameSubmit(item)}
                              onClick={(e) => e.stopPropagation()}
                              autoCapitalize="off"
                              autoCorrect="off"
                              spellCheck={false}
                              className="flex-1 bg-transparent border-b border-primary outline-none text-sm"
                            />
                          ) : (
                            <span className="flex-1 truncate">{item.name}</span>
                          )}

                          {/* Context menu */}
                          <div className="flex items-center opacity-0 group-hover:opacity-100">
                            <ItemContextMenu
                              item={item}
                              onRename={() => handleStartRename(item)}
                              onDelete={() => handleDelete(item)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface ItemContextMenuProps {
  item: ToolboxItem;
  onRename: () => void;
  onDelete: () => void;
}

function ItemContextMenu({ onRename, onDelete }: ItemContextMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-xs" className="h-5 w-5" />}
        onClick={(e) => e.stopPropagation()}
      >
        <MoreVertical className="h-3 w-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={onRename}>
          <Pencil className="mr-2 h-4 w-4" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
