import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCreateConversation = vi.fn();
const mockSelectConversation = vi.fn();
const mockDeleteConversation = vi.fn();
const mockCreateFolder = vi.fn();
const mockRenameFolder = vi.fn();
const mockDeleteFolder = vi.fn();
const mockToggleFolderExpansion = vi.fn();
const mockToggleFolderPin = vi.fn();
const mockRenameChat = vi.fn();
const mockLoadChatsFromDisk = vi.fn();

const mockChatStore = {
  chatTree: [] as any[],
  conversations: [] as any[],
  currentConversationId: null as string | null,
  expandedFolders: new Set<string>(),
  isGhostMode: false,
  ghostConversation: null as any,
  createConversation: mockCreateConversation,
  selectConversation: mockSelectConversation,
  deleteConversation: mockDeleteConversation,
  createFolder: mockCreateFolder,
  renameFolder: mockRenameFolder,
  deleteFolder: mockDeleteFolder,
  toggleFolderExpansion: mockToggleFolderExpansion,
  toggleFolderPin: mockToggleFolderPin,
  renameChat: mockRenameChat,
  loadChatsFromDisk: mockLoadChatsFromDisk,
};

vi.mock("@/stores/chat-store", () => ({
  useChatStore: () => mockChatStore,
}));

vi.mock("@/lib/hooks/use-polling-loader", () => ({
  usePollingLoader: vi.fn(),
}));

vi.mock("@/lib/hooks/use-inline-editing", () => ({
  useInlineEditing: () => ({
    editingId: null,
    editingName: "",
    startEditing: vi.fn(),
    setEditingName: vi.fn(),
    handleRenameSubmit: vi.fn(),
    handleKeyDown: vi.fn(),
  }),
}));

vi.mock("@/lib/sidebar-utils", () => ({
  splitByPinned: (tree: any[]) => {
    const pinned = tree.filter((n: any) => n.type === "folder" && n.isPinned);
    const unpinned = tree.filter((n: any) => !(n.type === "folder" && n.isPinned));
    return { pinned, unpinned };
  },
  collectTreeIds: (nodes: any[], type: string) => {
    const ids = new Set<string>();
    const walk = (items: any[]) => {
      for (const node of items) {
        if (node.type === type) ids.add(node.id);
        else if (node.children) walk(node.children);
      }
    };
    walk(nodes);
    return ids;
  },
}));

// Mock SidebarTreeNode to avoid deep component tree
vi.mock("@/components/shared/sidebar-tree-node", () => ({
  SidebarTreeNode: ({ node, onSelect }: any) => (
    <div data-testid={`tree-node-${node.id}`} onClick={() => onSelect(node.id)}>
      {node.name || node.title || "Untitled"}
    </div>
  ),
}));

vi.mock("lucide-react", () => ({
  Plus: (props: any) => <span data-testid="icon-Plus" {...props} />,
  FolderPlus: (props: any) => <span data-testid="icon-FolderPlus" {...props} />,
  MessageSquare: (props: any) => <span data-testid="icon-MessageSquare" {...props} />,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    title,
    ...rest
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    title?: string;
    [k: string]: unknown;
  }) => (
    <button onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  ),
}));

// Import after mocks
import { ChatSidebar } from "./chat-sidebar";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ChatSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChatStore.chatTree = [];
    mockChatStore.conversations = [];
    mockChatStore.currentConversationId = null;
    mockChatStore.expandedFolders = new Set();
    mockChatStore.isGhostMode = false;
    mockChatStore.ghostConversation = null;
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  describe("rendering", () => {
    it("renders the header with 'Chat' label", () => {
      render(<ChatSidebar />);
      expect(screen.getByText("Chat")).toBeInTheDocument();
    });

    it("renders the 'New folder' button", () => {
      render(<ChatSidebar />);
      expect(screen.getByTitle("New folder")).toBeInTheDocument();
    });

    it("renders the 'New conversation' button", () => {
      render(<ChatSidebar />);
      expect(screen.getByTitle("New conversation")).toBeInTheDocument();
    });

    it("shows 'No conversations yet' when there are no items", () => {
      render(<ChatSidebar />);
      expect(screen.getByText("No conversations yet")).toBeInTheDocument();
    });

    it("does not show empty message when there are tree items", () => {
      mockChatStore.chatTree = [
        { type: "chat", id: "chat-1", name: "Chat 1", title: "Hello" },
      ];
      render(<ChatSidebar />);
      expect(screen.queryByText("No conversations yet")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Tree rendering
  // -------------------------------------------------------------------------

  describe("tree rendering", () => {
    it("renders unpinned tree nodes", () => {
      mockChatStore.chatTree = [
        { type: "chat", id: "chat-1", name: "Chat 1", title: "First Chat" },
        { type: "chat", id: "chat-2", name: "Chat 2", title: "Second Chat" },
      ];
      render(<ChatSidebar />);
      expect(screen.getByTestId("tree-node-chat-1")).toBeInTheDocument();
      expect(screen.getByTestId("tree-node-chat-2")).toBeInTheDocument();
    });

    it("renders pinned folders separately with a divider", () => {
      mockChatStore.chatTree = [
        { type: "folder", id: "folder-1", name: "Pinned Folder", isPinned: true, children: [] },
        { type: "chat", id: "chat-1", name: "Chat 1", title: "Some Chat" },
      ];
      render(<ChatSidebar />);
      expect(screen.getByTestId("tree-node-folder-1")).toBeInTheDocument();
      expect(screen.getByTestId("tree-node-chat-1")).toBeInTheDocument();
    });

    it("renders in-memory only chats not present in the tree", () => {
      mockChatStore.chatTree = [];
      mockChatStore.conversations = [
        { id: "mem-1", title: "Memory Chat", messages: [], createdAt: new Date(), updatedAt: new Date(), background: false },
      ];
      render(<ChatSidebar />);
      expect(screen.getByText("Memory Chat")).toBeInTheDocument();
    });

    it("renders in-memory chat with 'New Chat' when title is empty", () => {
      mockChatStore.chatTree = [];
      mockChatStore.conversations = [
        { id: "mem-1", title: "", messages: [], createdAt: new Date(), updatedAt: new Date() },
      ];
      render(<ChatSidebar />);
      expect(screen.getByText("New Chat")).toBeInTheDocument();
    });

    it("does not render background conversations in the sidebar", () => {
      mockChatStore.chatTree = [];
      mockChatStore.conversations = [
        { id: "bg-1", title: "Background Task", messages: [], createdAt: new Date(), updatedAt: new Date(), background: true },
      ];
      render(<ChatSidebar />);
      // Background convos are filtered out, so the empty message should show
      expect(screen.getByText("No conversations yet")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Ghost mode
  // -------------------------------------------------------------------------

  describe("ghost mode", () => {
    it("shows incognito session when ghost mode is active", () => {
      mockChatStore.isGhostMode = true;
      mockChatStore.ghostConversation = {
        id: "ghost-1",
        title: "Ghost",
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      render(<ChatSidebar />);
      expect(screen.getByText("Incognito Session")).toBeInTheDocument();
    });

    it("does not show incognito session when ghost mode is inactive", () => {
      mockChatStore.isGhostMode = false;
      render(<ChatSidebar />);
      expect(screen.queryByText("Incognito Session")).not.toBeInTheDocument();
    });

    it("selects ghost conversation when clicking the incognito row", async () => {
      const user = userEvent.setup();
      mockChatStore.isGhostMode = true;
      mockChatStore.ghostConversation = {
        id: "ghost-1",
        title: "Ghost",
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      render(<ChatSidebar />);
      await user.click(screen.getByText("Incognito Session"));
      expect(mockSelectConversation).toHaveBeenCalledWith("ghost-1");
    });
  });

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  describe("actions", () => {
    it("calls createFolder when 'New folder' button is clicked", async () => {
      const user = userEvent.setup();
      render(<ChatSidebar />);
      await user.click(screen.getByTitle("New folder"));
      expect(mockCreateFolder).toHaveBeenCalledWith("New Folder");
    });

    it("calls createConversation when 'New conversation' button is clicked", async () => {
      const user = userEvent.setup();
      render(<ChatSidebar />);
      await user.click(screen.getByTitle("New conversation"));
      expect(mockCreateConversation).toHaveBeenCalledWith(undefined);
    });

    it("selects an in-memory chat on click", async () => {
      const user = userEvent.setup();
      mockChatStore.chatTree = [];
      mockChatStore.conversations = [
        { id: "mem-1", title: "Click Me", messages: [], createdAt: new Date(), updatedAt: new Date() },
      ];
      render(<ChatSidebar />);
      await user.click(screen.getByText("Click Me"));
      expect(mockSelectConversation).toHaveBeenCalledWith("mem-1");
    });
  });
});
