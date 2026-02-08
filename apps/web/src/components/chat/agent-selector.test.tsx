import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSetAgentId = vi.fn();
const mockChatStore = {
  agentId: "default",
  setAgentId: mockSetAgentId,
};

const mockAgentStore = {
  agents: [
    { name: "default", model: "claude-sonnet-4", temperature: 0.3, systemPrompt: "..." },
    { name: "coder", model: "gpt-4o", temperature: 0.1, systemPrompt: "..." },
    { name: "researcher", model: "gemini-1.5-pro", temperature: 0.5, systemPrompt: "..." },
  ],
};

vi.mock("@/stores/chat-store", () => ({
  useChatStore: () => mockChatStore,
}));

vi.mock("@/stores/agent-store", () => ({
  useAgentStore: () => mockAgentStore,
}));

vi.mock("lucide-react", () => ({
  Bot: () => <span data-testid="icon-Bot">Bot</span>,
  ChevronDown: () => <span data-testid="icon-ChevronDown">ChevronDown</span>,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-menu">{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-content">{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <button data-testid="dropdown-trigger">{children}</button>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button data-testid="dropdown-item" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...rest }: { children?: React.ReactNode; [k: string]: unknown }) => (
    <span>{children}</span>
  ),
}));

import { AgentSelector } from "./agent-selector";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AgentSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChatStore.agentId = "default";
    mockAgentStore.agents = [
      { name: "default", model: "claude-sonnet-4", temperature: 0.3, systemPrompt: "..." },
      { name: "coder", model: "gpt-4o", temperature: 0.1, systemPrompt: "..." },
      { name: "researcher", model: "gemini-1.5-pro", temperature: 0.5, systemPrompt: "..." },
    ];
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  it("renders the bot icon", () => {
    render(<AgentSelector />);
    expect(screen.getByTestId("icon-Bot")).toBeInTheDocument();
  });

  it("renders the chevron down icon", () => {
    render(<AgentSelector />);
    expect(screen.getByTestId("icon-ChevronDown")).toBeInTheDocument();
  });

  it("displays the selected agent name in the trigger", () => {
    render(<AgentSelector />);
    const trigger = screen.getByTestId("dropdown-trigger");
    expect(trigger).toHaveTextContent("default");
  });

  it("displays the first agent name when agentId does not match any agent", () => {
    mockChatStore.agentId = "nonexistent";
    render(<AgentSelector />);
    const trigger = screen.getByTestId("dropdown-trigger");
    expect(trigger).toHaveTextContent("default");
  });

  it('displays "Assistant" when no agents exist and agentId is unmatched', () => {
    mockChatStore.agentId = "nonexistent";
    mockAgentStore.agents = [];
    render(<AgentSelector />);
    expect(screen.getByText("Assistant")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Agent list
  // -------------------------------------------------------------------------

  it("renders all agents as dropdown items", () => {
    render(<AgentSelector />);
    const items = screen.getAllByTestId("dropdown-item");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("default");
    expect(items[1]).toHaveTextContent("coder");
    expect(items[2]).toHaveTextContent("researcher");
  });

  it('shows "No agents configured" when agents array is empty', () => {
    mockAgentStore.agents = [];
    render(<AgentSelector />);
    expect(screen.getByText("No agents configured")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Interactions
  // -------------------------------------------------------------------------

  it("calls setAgentId when an agent item is clicked", async () => {
    const user = userEvent.setup();
    render(<AgentSelector />);
    const items = screen.getAllByTestId("dropdown-item");
    await user.click(items[1]); // click "coder"
    expect(mockSetAgentId).toHaveBeenCalledWith("coder");
  });

  it("calls setAgentId with correct agent name for each item", async () => {
    const user = userEvent.setup();
    render(<AgentSelector />);
    const items = screen.getAllByTestId("dropdown-item");
    await user.click(items[2]); // click "researcher"
    expect(mockSetAgentId).toHaveBeenCalledWith("researcher");
  });

  // -------------------------------------------------------------------------
  // Display with different selected agents
  // -------------------------------------------------------------------------

  it("shows the correct agent name when a different agent is selected", () => {
    mockChatStore.agentId = "coder";
    render(<AgentSelector />);
    const trigger = screen.getByTestId("dropdown-trigger");
    expect(trigger).toHaveTextContent("coder");
  });
});
