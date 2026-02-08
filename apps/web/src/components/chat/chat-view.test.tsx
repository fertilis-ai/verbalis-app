import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import * as React from "react";

// jsdom does not implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSendMessage = vi.fn();
const mockConfirmToolExecution = vi.fn();
const mockRejectToolExecution = vi.fn();
const mockAddContextFiles = vi.fn();
const mockRemoveContextFile = vi.fn();

const mockChatStoreState = {
  sendMessage: mockSendMessage,
  isStreaming: false,
  isGhostMode: false,
  confirmToolExecution: mockConfirmToolExecution,
  rejectToolExecution: mockRejectToolExecution,
  addContextFiles: mockAddContextFiles,
  removeContextFile: mockRemoveContextFile,
  contextFiles: [] as any[],
  currentConversation: null as any,
  getCurrentConversation: () => mockChatStoreState.currentConversation,
};

vi.mock("@/stores/chat-store", () => ({
  useChatStore: Object.assign(
    (selectorOrNothing?: any) => {
      if (typeof selectorOrNothing === "function") {
        return selectorOrNothing(mockChatStoreState);
      }
      return mockChatStoreState;
    },
    {
      getState: () => mockChatStoreState,
    }
  ),
}));

const mockAgenticLoopState = {
  currentStatus: "idle" as string,
  pendingToolCalls: [] as any[],
  confirmAllPending: vi.fn(),
  rejectAllPending: vi.fn(),
  stopLoop: vi.fn(),
};

vi.mock("@/stores/agentic-loop-store", () => ({
  useAgenticLoopStore: Object.assign(
    (selectorOrNothing?: any) => {
      if (typeof selectorOrNothing === "function") {
        return selectorOrNothing(mockAgenticLoopState);
      }
      return mockAgenticLoopState;
    },
    {
      getState: () => mockAgenticLoopState,
    }
  ),
}));

vi.mock("@/lib/hooks/use-elapsed-time", () => ({
  useElapsedTime: vi.fn(),
}));

vi.mock("@/lib/guardrails/undo-manager", () => ({
  getUndoManager: () => ({
    executeUndoByToolCallId: vi.fn(async () => true),
  }),
}));

vi.mock("@/lib/storage", () => ({
  isTauri: vi.fn(() => false),
}));

// Mock child components to isolate ChatView
vi.mock("./chat-input", () => ({
  ChatInput: ({ onSend, disabled }: any) => (
    <div data-testid="chat-input" data-disabled={disabled}>
      <button data-testid="mock-send" onClick={() => onSend("test message")}>
        Send
      </button>
    </div>
  ),
}));

vi.mock("./chat-header", () => ({
  ChatHeader: () => <div data-testid="chat-header">Header</div>,
}));

vi.mock("./tool-call-card", () => ({
  ToolCallCard: ({ toolCall }: any) => (
    <div data-testid={`tool-call-${toolCall.id}`}>{toolCall.name}</div>
  ),
}));

vi.mock("./markdown-content", () => ({
  MarkdownContent: ({ content }: any) => <div data-testid="markdown">{content}</div>,
}));

vi.mock("./guardrail-confirmation-bar", () => ({
  GuardrailConfirmationBar: ({ pendingToolCalls }: any) => (
    <div data-testid="guardrail-bar" data-count={pendingToolCalls.length} />
  ),
}));

vi.mock("lucide-react", () => ({
  Bot: (props: any) => <span data-testid="icon-Bot" {...props} />,
  User: (props: any) => <span data-testid="icon-User" {...props} />,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, ...rest }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

// Import after mocks
import { ChatView } from "./chat-view";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ChatView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChatStoreState.isStreaming = false;
    mockChatStoreState.isGhostMode = false;
    mockChatStoreState.contextFiles = [];
    mockChatStoreState.currentConversation = null;
    mockAgenticLoopState.currentStatus = "idle";
    mockAgenticLoopState.pendingToolCalls = [];
  });

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  describe("layout", () => {
    it("renders the chat header", () => {
      render(<ChatView />);
      expect(screen.getByTestId("chat-header")).toBeInTheDocument();
    });

    it("renders the chat input", () => {
      render(<ChatView />);
      expect(screen.getByTestId("chat-input")).toBeInTheDocument();
    });

    it("renders the guardrail confirmation bar", () => {
      render(<ChatView />);
      expect(screen.getByTestId("guardrail-bar")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  describe("empty state", () => {
    it("shows 'Start a conversation' when no messages", () => {
      render(<ChatView />);
      expect(screen.getByText("Start a conversation")).toBeInTheDocument();
    });

    it("shows helper text for normal mode", () => {
      render(<ChatView />);
      expect(
        screen.getByText("Send a message to begin chatting with your AI assistant")
      ).toBeInTheDocument();
    });

    it("shows 'Incognito Session' heading in ghost mode", () => {
      mockChatStoreState.isGhostMode = true;
      render(<ChatView />);
      expect(screen.getByText("Incognito Session")).toBeInTheDocument();
    });

    it("shows ghost mode helper text", () => {
      mockChatStoreState.isGhostMode = true;
      render(<ChatView />);
      expect(screen.getByText("Messages won't be saved to disk")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Messages rendering
  // -------------------------------------------------------------------------

  describe("messages", () => {
    it("renders user messages", () => {
      mockChatStoreState.currentConversation = {
        id: "conv-1",
        title: "Test",
        messages: [
          { id: "msg-1", role: "user", content: "Hello world", createdAt: new Date() },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      render(<ChatView />);
      expect(screen.getByText("Hello world")).toBeInTheDocument();
    });

    it("renders assistant messages with markdown", () => {
      mockChatStoreState.currentConversation = {
        id: "conv-1",
        title: "Test",
        messages: [
          { id: "msg-1", role: "assistant", content: "Bot reply", createdAt: new Date() },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      render(<ChatView />);
      expect(screen.getByTestId("markdown")).toHaveTextContent("Bot reply");
    });

    it("renders user icon for user messages", () => {
      mockChatStoreState.currentConversation = {
        id: "conv-1",
        title: "Test",
        messages: [
          { id: "msg-1", role: "user", content: "Hi", createdAt: new Date() },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      render(<ChatView />);
      expect(screen.getByTestId("icon-User")).toBeInTheDocument();
    });

    it("renders bot icon for assistant messages", () => {
      mockChatStoreState.currentConversation = {
        id: "conv-1",
        title: "Test",
        messages: [
          { id: "msg-1", role: "assistant", content: "Hello", createdAt: new Date() },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      render(<ChatView />);
      // Two Bot icons: one in the avatar circle and one in empty state (not shown) - actually just the avatar
      const botIcons = screen.getAllByTestId("icon-Bot");
      expect(botIcons.length).toBeGreaterThanOrEqual(1);
    });

    it("renders tool call cards for messages with tool calls", () => {
      mockChatStoreState.currentConversation = {
        id: "conv-1",
        title: "Test",
        messages: [
          {
            id: "msg-1",
            role: "assistant",
            content: "Using a tool",
            toolCalls: [
              { id: "tc-1", name: "read_file", status: "completed", args: {}, result: "" },
              { id: "tc-2", name: "write_file", status: "pending", args: {}, result: "" },
            ],
            createdAt: new Date(),
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      render(<ChatView />);
      expect(screen.getByTestId("tool-call-tc-1")).toBeInTheDocument();
      expect(screen.getByTestId("tool-call-tc-2")).toBeInTheDocument();
    });

    it("renders multiple messages in order", () => {
      mockChatStoreState.currentConversation = {
        id: "conv-1",
        title: "Test",
        messages: [
          { id: "msg-1", role: "user", content: "Question", createdAt: new Date() },
          { id: "msg-2", role: "assistant", content: "Answer", createdAt: new Date() },
          { id: "msg-3", role: "user", content: "Follow-up", createdAt: new Date() },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      render(<ChatView />);
      expect(screen.getByText("Question")).toBeInTheDocument();
      expect(screen.getByTestId("markdown")).toHaveTextContent("Answer");
      expect(screen.getByText("Follow-up")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Input state
  // -------------------------------------------------------------------------

  describe("input state", () => {
    it("disables input when streaming", () => {
      mockChatStoreState.isStreaming = true;
      render(<ChatView />);
      expect(screen.getByTestId("chat-input")).toHaveAttribute("data-disabled", "true");
    });

    it("disables input when agentic loop is active (thinking)", () => {
      mockAgenticLoopState.currentStatus = "thinking";
      render(<ChatView />);
      expect(screen.getByTestId("chat-input")).toHaveAttribute("data-disabled", "true");
    });

    it("disables input when agentic loop is active (tool_executing)", () => {
      mockAgenticLoopState.currentStatus = "tool_executing";
      render(<ChatView />);
      expect(screen.getByTestId("chat-input")).toHaveAttribute("data-disabled", "true");
    });

    it("disables input when agentic loop is active (tool_pending)", () => {
      mockAgenticLoopState.currentStatus = "tool_pending";
      render(<ChatView />);
      expect(screen.getByTestId("chat-input")).toHaveAttribute("data-disabled", "true");
    });

    it("enables input when idle and not streaming", () => {
      mockChatStoreState.isStreaming = false;
      mockAgenticLoopState.currentStatus = "idle";
      render(<ChatView />);
      expect(screen.getByTestId("chat-input")).toHaveAttribute("data-disabled", "false");
    });
  });

  // -------------------------------------------------------------------------
  // Guardrail bar
  // -------------------------------------------------------------------------

  describe("guardrail bar", () => {
    it("passes pending tool calls to guardrail bar", () => {
      mockAgenticLoopState.pendingToolCalls = [
        { id: "tc-1", name: "shell", status: "pending_confirmation" },
        { id: "tc-2", name: "write_file", status: "pending_confirmation" },
      ];
      render(<ChatView />);
      expect(screen.getByTestId("guardrail-bar")).toHaveAttribute("data-count", "2");
    });

    it("passes zero pending calls when none exist", () => {
      mockAgenticLoopState.pendingToolCalls = [];
      render(<ChatView />);
      expect(screen.getByTestId("guardrail-bar")).toHaveAttribute("data-count", "0");
    });
  });

  // -------------------------------------------------------------------------
  // Ghost mode styling cues
  // -------------------------------------------------------------------------

  describe("ghost mode", () => {
    it("does not show empty state text for incognito when ghost mode is off", () => {
      render(<ChatView />);
      expect(screen.queryByText("Incognito Session")).not.toBeInTheDocument();
      expect(screen.queryByText("Messages won't be saved to disk")).not.toBeInTheDocument();
    });
  });
});
