import * as React from "react";
import {
  Plus,
  FolderPlus,
  MessageSquare,
  ChevronRight,
  MoreVertical,
  Pin,
  Pencil,
  Trash2,
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
import { useChatStore } from "@/stores/chat-store";
import { isTauri, type ChatTreeNode } from "@/lib/storage";

export function ChatSidebar() {
  const {
    chatTree,
    conversations,
    currentConversationId,
    expandedFolders,
    isGhostMode,
    ghostConversation,
    createConversation,
    selectConversation,
    deleteConversation,
    createFolder,
    renameFolder,
    deleteFolder,
    toggleFolderExpansion,
    toggleFolderPin,
    renameChat,
    loadChatsFromDisk,
  } = useChatStore();

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");
  const [editingType, setEditingType] = React.useState<"folder" | "chat" | null>(null);

  // Load chats on mount and set up polling
  React.useEffect(() => {
    loadChatsFromDisk();

    // Poll every 5 seconds for external changes
    const interval = setInterval(() => {
      loadChatsFromDisk();
    }, 5000);

    return () => clearInterval(interval);
  }, [loadChatsFromDisk]);

  const handleCreateFolder = async () => {
    console.log("[chat-sidebar] handleCreateFolder clicked, isTauri:", isTauri());
    try {
      const name = `New Folder`;
      await createFolder(name);
      console.log("[chat-sidebar] createFolder completed");
    } catch (error) {
      console.error("[chat-sidebar] createFolder error:", error);
    }
  };

  const handleCreateChat = async (folderId?: string) => {
    console.log("[chat-sidebar] handleCreateChat clicked, folderId:", folderId);
    await createConversation(folderId);
  };

  const startEditing = (id: string, name: string, type: "folder" | "chat") => {
    setEditingId(id);
    setEditingName(name);
    setEditingType(type);
  };

  const handleRenameSubmit = async () => {
    if (!editingId || !editingName.trim() || !editingType) return;

    if (editingType === "folder") {
      await renameFolder(editingId, editingName.trim());
    } else {
      await renameChat(editingId, editingName.trim());
    }

    setEditingId(null);
    setEditingName("");
    setEditingType(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRenameSubmit();
    } else if (e.key === "Escape") {
      setEditingId(null);
      setEditingName("");
      setEditingType(null);
    }
  };

  // Separate pinned items
  const pinnedFolders = chatTree.filter((n) => n.type === "folder" && n.isPinned);
  const unpinnedItems = chatTree.filter((n) => !(n.type === "folder" && n.isPinned));

  // Find conversations that are in memory but not yet in chatTree (for immediate UI feedback)
  const chatIdsInTree = new Set<string>();
  const collectChatIds = (nodes: ChatTreeNode[]) => {
    for (const node of nodes) {
      if (node.type === "chat") {
        chatIdsInTree.add(node.id);
      } else if (node.children) {
        collectChatIds(node.children);
      }
    }
  };
  collectChatIds(chatTree);

  const inMemoryOnlyChats = conversations.filter((c) => !chatIdsInTree.has(c.id) && !c.background);

  const hasAnyItems =
    pinnedFolders.length > 0 || unpinnedItems.length > 0 || inMemoryOnlyChats.length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-10 items-center justify-between border-b border-border px-2">
        <span className="text-sm font-medium">Chats</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleCreateFolder}
            title="New folder"
          >
            <FolderPlus className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => handleCreateChat()}
            title="New conversation"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Chat Tree */}
      <div className="flex-1 overflow-auto p-2">
        <div className="flex flex-col gap-0.5">
          {/* Ghost mode indicator */}
          {isGhostMode && ghostConversation && (
            <div
              className={cn(
                "group flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer",
                "bg-purple-500/10 border border-purple-500/20",
                currentConversationId === ghostConversation.id && "bg-purple-500/20"
              )}
              onClick={() => selectConversation(ghostConversation.id)}
            >
              <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-purple-400" />
              <span className="flex-1 truncate text-purple-300">Incognito Session</span>
            </div>
          )}

          {/* Pinned folders */}
          {pinnedFolders.length > 0 && (
            <>
              {pinnedFolders.map((node) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  currentConversationId={currentConversationId}
                  expandedFolders={expandedFolders}
                  editingId={editingId}
                  editingName={editingName}
                  onSelect={selectConversation}
                  onToggleExpand={toggleFolderExpansion}
                  onCreateChatInFolder={handleCreateChat}
                  onStartEditing={startEditing}
                  onEditingNameChange={setEditingName}
                  onKeyDown={handleKeyDown}
                  onRenameSubmit={handleRenameSubmit}
                  onDeleteFolder={deleteFolder}
                  onDeleteChat={deleteConversation}
                  onTogglePin={toggleFolderPin}
                />
              ))}
              <div className="my-1 border-b border-border" />
            </>
          )}

          {/* Rest of tree */}
          {!hasAnyItems ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No conversations yet
            </p>
          ) : (
            <>
              {unpinnedItems.map((node) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  currentConversationId={currentConversationId}
                  expandedFolders={expandedFolders}
                  editingId={editingId}
                  editingName={editingName}
                  onSelect={selectConversation}
                  onToggleExpand={toggleFolderExpansion}
                  onCreateChatInFolder={handleCreateChat}
                  onStartEditing={startEditing}
                  onEditingNameChange={setEditingName}
                  onKeyDown={handleKeyDown}
                  onRenameSubmit={handleRenameSubmit}
                  onDeleteFolder={deleteFolder}
                  onDeleteChat={deleteConversation}
                  onTogglePin={toggleFolderPin}
                />
              ))}

              {/* In-memory only chats (not yet on disk) */}
              {inMemoryOnlyChats.map((conv) => (
                <div
                  key={conv.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-muted",
                    currentConversationId === conv.id && "bg-muted"
                  )}
                  onClick={() => selectConversation(conv.id)}
                >
                  <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{conv.title || "New Chat"}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface TreeNodeProps {
  node: ChatTreeNode;
  depth: number;
  currentConversationId: string | null;
  expandedFolders: Set<string>;
  editingId: string | null;
  editingName: string;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onCreateChatInFolder: (folderId: string) => void;
  onStartEditing: (id: string, name: string, type: "folder" | "chat") => void;
  onEditingNameChange: (name: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onRenameSubmit: () => void;
  onDeleteFolder: (id: string) => Promise<void>;
  onDeleteChat: (id: string) => Promise<void>;
  onTogglePin: (id: string) => Promise<void>;
}

function TreeNode({
  node,
  depth,
  currentConversationId,
  expandedFolders,
  editingId,
  editingName,
  onSelect,
  onToggleExpand,
  onCreateChatInFolder,
  onStartEditing,
  onEditingNameChange,
  onKeyDown,
  onRenameSubmit,
  onDeleteFolder,
  onDeleteChat,
  onTogglePin,
}: TreeNodeProps) {
  const isFolder = node.type === "folder";
  const isExpanded = expandedFolders.has(node.id);
  const isEditing = editingId === node.id;
  const isSelected = !isFolder && currentConversationId === node.id;
  const baseIndent = 8;
  const indentStep = 24;
  const paddingLeft = `${baseIndent + depth * indentStep}px`;

  const displayName = isFolder ? node.name : (node.title || "Untitled");

  if (isFolder) {
    return (
      <div>
        <div
          className="group flex items-center gap-1 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-muted"
          style={{ paddingLeft }}
        >
          <button
            className="flex-shrink-0 p-0.5 hover:bg-muted-foreground/10 rounded"
            onClick={() => onToggleExpand(node.id)}
          >
            <ChevronRight
              className={cn(
                "h-3 w-3 transition-transform",
                isExpanded && "rotate-90"
              )}
            />
          </button>

          {isEditing ? (
            <input
              type="text"
              value={editingName}
              onChange={(e) => onEditingNameChange(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={onRenameSubmit}
              autoFocus
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 bg-transparent border-b border-primary outline-none text-sm"
            />
          ) : (
            <span
              className="flex-1 truncate"
              onClick={() => onToggleExpand(node.id)}
            >
              {displayName}
            </span>
          )}

          {/* Hover actions */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon-xs"
              className="h-5 w-5"
              onClick={(e) => {
                e.stopPropagation();
                if (!isExpanded) {
                  onToggleExpand(node.id);
                }
                onCreateChatInFolder(node.id);
              }}
              title="New chat in folder"
            >
              <Plus className="h-3 w-3" />
            </Button>
            <FolderContextMenu
              node={node}
              onRename={() => onStartEditing(node.id, node.name, "folder")}
              onDelete={() => onDeleteFolder(node.id)}
              onTogglePin={() => onTogglePin(node.id)}
            />
          </div>
        </div>

        {/* Children */}
        {isExpanded && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                currentConversationId={currentConversationId}
                expandedFolders={expandedFolders}
                editingId={editingId}
                editingName={editingName}
                onSelect={onSelect}
                onToggleExpand={onToggleExpand}
                onCreateChatInFolder={onCreateChatInFolder}
                onStartEditing={onStartEditing}
                onEditingNameChange={onEditingNameChange}
                onKeyDown={onKeyDown}
                onRenameSubmit={onRenameSubmit}
                onDeleteFolder={onDeleteFolder}
                onDeleteChat={onDeleteChat}
                onTogglePin={onTogglePin}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Chat item
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-muted",
        isSelected && "bg-muted"
      )}
      style={{ paddingLeft }}
      onClick={() => onSelect(node.id)}
    >
      <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />

      {isEditing ? (
        <input
          type="text"
          value={editingName}
          onChange={(e) => onEditingNameChange(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onRenameSubmit}
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="flex-1 bg-transparent border-b border-primary outline-none text-sm"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="flex-1 truncate">{displayName}</span>
      )}

      {/* Hover actions */}
      <div className="flex items-center opacity-0 group-hover:opacity-100">
        <ChatContextMenu
          node={node}
          onRename={() => onStartEditing(node.id, displayName, "chat")}
          onDelete={() => onDeleteChat(node.id)}
        />
      </div>
    </div>
  );
}

interface FolderContextMenuProps {
  node: ChatTreeNode;
  onRename: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}

function FolderContextMenu({ node, onRename, onDelete, onTogglePin }: FolderContextMenuProps) {
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
        <DropdownMenuItem onClick={onTogglePin}>
          <Pin className="mr-2 h-4 w-4" />
          {node.isPinned ? "Unpin" : "Pin"}
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

interface ChatContextMenuProps {
  node: ChatTreeNode;
  onRename: () => void;
  onDelete: () => void;
}

function ChatContextMenu({ onRename, onDelete }: ChatContextMenuProps) {
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
