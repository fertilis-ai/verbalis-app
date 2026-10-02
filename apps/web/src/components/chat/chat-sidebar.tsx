import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import { useShallow } from "zustand/react/shallow";
import { FolderTreeSidebar } from "@/components/shared/folder-tree-sidebar";
import type { SidebarTreeNodeData } from "@/components/shared/sidebar-tree-node";

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
    moveConversation,
    loadChatsFromDisk,
  } = useChatStore(
    useShallow((s) => ({
      chatTree: s.chatTree,
      conversations: s.conversations,
      currentConversationId: s.currentConversationId,
      expandedFolders: s.expandedFolders,
      isGhostMode: s.isGhostMode,
      ghostConversation: s.ghostConversation,
      createConversation: s.createConversation,
      selectConversation: s.selectConversation,
      deleteConversation: s.deleteConversation,
      createFolder: s.createFolder,
      renameFolder: s.renameFolder,
      deleteFolder: s.deleteFolder,
      toggleFolderExpansion: s.toggleFolderExpansion,
      toggleFolderPin: s.toggleFolderPin,
      renameChat: s.renameChat,
      moveConversation: s.moveConversation,
      loadChatsFromDisk: s.loadChatsFromDisk,
    }))
  );

  const handleCreateFolder = async () => {
    try {
      await createFolder("New Folder");
    } catch (error) {
      console.error("[chat-sidebar] createFolder error:", error);
    }
  };

  const items = conversations
    .filter((c) => !c.background)
    .map((c) => ({ id: c.id, label: c.title || "New Chat" }));

  return (
    <FolderTreeSidebar
      title="Chat"
      rootFolderName="Chats"
      tree={chatTree}
      leafType="chat"
      leafIcon={MessageSquare}
      items={items}
      selectedItemId={currentConversationId}
      expandedFolders={expandedFolders}
      getDisplayName={getChatDisplayName}
      emptyText="No conversations yet"
      newItemTitle="New conversation"
      createInFolderTitle="New chat in folder"
      loadFromDisk={loadChatsFromDisk}
      onCreateFolder={handleCreateFolder}
      onCreateItem={(folderId) => createConversation(folderId)}
      onSelect={selectConversation}
      onToggleExpand={toggleFolderExpansion}
      onTogglePin={toggleFolderPin}
      onRenameFolder={renameFolder}
      onRenameLeaf={renameChat}
      onDeleteFolder={deleteFolder}
      onDeleteLeaf={deleteConversation}
      onMoveLeaf={moveConversation}
      header={
        isGhostMode &&
        ghostConversation && (
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
        )
      }
    />
  );
}
