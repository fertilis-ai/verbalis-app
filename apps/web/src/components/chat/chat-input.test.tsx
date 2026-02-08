import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSetModel = vi.fn();
const mockChatStore = {
  model: "claude-sonnet-4-20250514",
  setModel: mockSetModel,
};

vi.mock("@/stores/chat-store", () => ({
  useChatStore: () => mockChatStore,
}));

vi.mock("@/stores/settings-store", () => ({
  useSettingsStore: () => ({
    localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
    selectedModels: [],
  }),
}));

vi.mock("@/lib/models", () => ({
  getActiveModels: () => [
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "anthropic" },
    { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
  ],
}));

vi.mock("lucide-react", () => ({
  Send: () => <span data-testid="icon-Send">Send</span>,
  Square: () => <span data-testid="icon-Square">Square</span>,
  Plus: () => <span data-testid="icon-Plus">Plus</span>,
  ChevronDown: () => <span data-testid="icon-ChevronDown">ChevronDown</span>,
  X: () => <span data-testid="icon-X">X</span>,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-menu">{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-content">{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-trigger">{children}</div>
  ),
  DropdownMenuRadioGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuRadioItem: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => (
    <div data-testid={`radio-item-${value}`}>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    variant,
    ...rest
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
    [k: string]: unknown;
  }) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant}>
      {children}
    </button>
  ),
}));

import { ChatInput } from "./chat-input";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ChatInput", () => {
  const defaultProps = {
    onSend: vi.fn(),
    disabled: false,
    isLoopActive: false,
    onStop: vi.fn(),
    contextFiles: [] as Array<{ path: string; name: string; content: string }>,
    onAddFiles: vi.fn(),
    onRemoveFile: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockChatStore.model = "claude-sonnet-4-20250514";
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  it("renders the textarea with placeholder", () => {
    render(<ChatInput {...defaultProps} />);
    expect(screen.getByPlaceholderText("Type a message...")).toBeInTheDocument();
  });

  it("renders the send button (not stop) when loop is not active", () => {
    render(<ChatInput {...defaultProps} />);
    expect(screen.getByTestId("icon-Send")).toBeInTheDocument();
    expect(screen.queryByTestId("icon-Square")).not.toBeInTheDocument();
  });

  it("renders the stop button when loop is active", () => {
    render(<ChatInput {...defaultProps} isLoopActive />);
    expect(screen.getByTestId("icon-Square")).toBeInTheDocument();
  });

  it("renders model label in the dropdown trigger", () => {
    render(<ChatInput {...defaultProps} />);
    const trigger = screen.getByTestId("dropdown-trigger");
    expect(trigger).toHaveTextContent("Claude Sonnet 4");
  });

  it("renders the plus button for adding files", () => {
    render(<ChatInput {...defaultProps} />);
    expect(screen.getByTestId("icon-Plus")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Textarea interaction
  // -------------------------------------------------------------------------

  it("updates textarea value on typing", async () => {
    const user = userEvent.setup();
    render(<ChatInput {...defaultProps} />);
    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "Hello world");
    expect(textarea).toHaveValue("Hello world");
  });

  it("calls onSend and clears input when Enter is pressed", async () => {
    const user = userEvent.setup();
    render(<ChatInput {...defaultProps} />);
    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "Test message");
    await user.keyboard("{Enter}");
    expect(defaultProps.onSend).toHaveBeenCalledWith("Test message");
    expect(textarea).toHaveValue("");
  });

  it("does NOT send on Shift+Enter (allows newline)", async () => {
    const user = userEvent.setup();
    render(<ChatInput {...defaultProps} />);
    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "Line 1");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(defaultProps.onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("Line 1\n");
  });

  it("does NOT send when input is empty whitespace", async () => {
    const user = userEvent.setup();
    render(<ChatInput {...defaultProps} />);
    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "   ");
    await user.keyboard("{Enter}");
    expect(defaultProps.onSend).not.toHaveBeenCalled();
  });

  it("trims message before sending", async () => {
    const user = userEvent.setup();
    render(<ChatInput {...defaultProps} />);
    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "  hello  ");
    await user.keyboard("{Enter}");
    expect(defaultProps.onSend).toHaveBeenCalledWith("hello");
  });

  it("disables the textarea when disabled prop is true", () => {
    render(<ChatInput {...defaultProps} disabled />);
    expect(screen.getByPlaceholderText("Type a message...")).toBeDisabled();
  });

  it("does not call onSend when disabled even if textarea has content", () => {
    render(<ChatInput {...defaultProps} disabled />);
    const textarea = screen.getByPlaceholderText("Type a message...");
    fireEvent.change(textarea, { target: { value: "hello" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(defaultProps.onSend).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Stop button
  // -------------------------------------------------------------------------

  it("calls onStop when the stop button is clicked", async () => {
    const user = userEvent.setup();
    render(<ChatInput {...defaultProps} isLoopActive />);
    const stopIcon = screen.getByTestId("icon-Square");
    const stopButton = stopIcon.closest("button")!;
    await user.click(stopButton);
    expect(defaultProps.onStop).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Context files
  // -------------------------------------------------------------------------

  it("renders context file chips when files are provided", () => {
    const files = [
      { path: "/a.ts", name: "a.ts", content: "" },
      { path: "/b.ts", name: "b.ts", content: "" },
    ];
    render(<ChatInput {...defaultProps} contextFiles={files} />);
    expect(screen.getByText("a.ts")).toBeInTheDocument();
    expect(screen.getByText("b.ts")).toBeInTheDocument();
  });

  it("calls onRemoveFile when X button on a chip is clicked", async () => {
    const user = userEvent.setup();
    const files = [{ path: "/a.ts", name: "a.ts", content: "" }];
    render(<ChatInput {...defaultProps} contextFiles={files} />);
    const xIcons = screen.getAllByTestId("icon-X");
    await user.click(xIcons[0]);
    expect(defaultProps.onRemoveFile).toHaveBeenCalledWith("/a.ts");
  });

  it("does not render context file section when no files", () => {
    render(<ChatInput {...defaultProps} contextFiles={[]} />);
    expect(screen.queryByText("a.ts")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Plus button
  // -------------------------------------------------------------------------

  it("calls onAddFiles when plus button is clicked", async () => {
    const user = userEvent.setup();
    render(<ChatInput {...defaultProps} />);
    const plusIcon = screen.getByTestId("icon-Plus");
    const plusButton = plusIcon.closest("button")!;
    await user.click(plusButton);
    expect(defaultProps.onAddFiles).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Send button states
  // -------------------------------------------------------------------------

  it("send button has ghost variant when no content", () => {
    render(<ChatInput {...defaultProps} />);
    const sendIcon = screen.getByTestId("icon-Send");
    const sendButton = sendIcon.closest("button")!;
    expect(sendButton).toHaveAttribute("data-variant", "ghost");
  });

  it("send button has default variant when there is content", async () => {
    const user = userEvent.setup();
    render(<ChatInput {...defaultProps} />);
    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "Hello");
    const sendIcon = screen.getByTestId("icon-Send");
    const sendButton = sendIcon.closest("button")!;
    expect(sendButton).toHaveAttribute("data-variant", "default");
  });

  // -------------------------------------------------------------------------
  // Model display
  // -------------------------------------------------------------------------

  it("shows local LLM disabled label when model is local", () => {
    mockChatStore.model = "local";
    render(<ChatInput {...defaultProps} />);
    const trigger = screen.getByTestId("dropdown-trigger");
    expect(trigger).toHaveTextContent("Local LLM (disabled)");
  });
});
