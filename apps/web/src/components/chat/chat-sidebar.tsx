import * as React from "react";
import {
  Plus,
  FolderPlus,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import { usePollingLoader } from "@/lib/hooks/use-polling-loader";
import { useInlineEditing } from "@/lib/hooks/use-inline-editing";
import { splitByPinned, collectTreeIds } from "@/lib/sidebar-utils";
import { SidebarTreeNode, type SidebarTreeNodeData } from "@/components/shared/sidebar-tree-node";

const chatLeafIcon = <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />;

function getChatDisplayName(node: SidebarTreeNodeData) {
  return node.type === "folder" ? node.name : (node.title || "Untitled");
}

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

  usePollingLoader(loadChatsFromDisk);

  const { editingId, editingName, startEditing, setEditingName, handleRenameSubmit, handleKeyDown } =
    useInlineEditing({
      onRename: async (id, name, type) => {
        if (type === "folder") {
          await renameFolder(id, name);
        } else {
          await renameChat(id, name);
        }
      },
    });

  const handleCreateFolder = async () => {
    try {
      const name = `New Folder`;
      await createFolder(name);
    } catch (error) {
      console.error("[chat-sidebar] createFolder error:", error);
    }
  };

  const handleCreateChat = async (folderId?: string) => {
    await createConversation(folderId);
  };

  const { pinned: pinnedFolders, unpinned: unpinnedItems } = splitByPinned(chatTree);

  const chatIdsInTree = collectTreeIds(chatTree, "chat");
  const inMemoryOnlyChats = conversations.filter((c) => !chatIdsInTree.has(c.id) && !c.background);

  const hasAnyItems =
    pinnedFolders.length > 0 || unpinnedItems.length > 0 || inMemoryOnlyChats.length > 0;

  const treeNodeProps = {
    expandedFolders,
    editingId,
    editingName,
    leafIcon: chatLeafIcon,
    leafType: "chat" as const,
    createInFolderTitle: "New chat in folder",
    selectedItemId: currentConversationId,
    onSelect: selectConversation,
    onToggleExpand: toggleFolderExpansion,
    onCreateInFolder: handleCreateChat,
    onStartEditing: startEditing,
    onEditingNameChange: setEditingName,
    onKeyDown: handleKeyDown,
    onRenameSubmit: handleRenameSubmit,
    onDeleteFolder: deleteFolder,
    onDeleteLeaf: deleteConversation,
    onTogglePin: toggleFolderPin,
    getDisplayName: getChatDisplayName,
  };

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
                <SidebarTreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  {...treeNodeProps}
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
                <SidebarTreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  {...treeNodeProps}
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
