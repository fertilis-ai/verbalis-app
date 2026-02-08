import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("lucide-react", () => ({
  ShieldAlert: (props: Record<string, unknown>) => <span data-testid="icon-ShieldAlert">ShieldAlert</span>,
  ShieldCheck: (props: Record<string, unknown>) => <span data-testid="icon-ShieldCheck">ShieldCheck</span>,
  Shield: (props: Record<string, unknown>) => <span data-testid="icon-Shield">Shield</span>,
  ShieldX: (props: Record<string, unknown>) => <span data-testid="icon-ShieldX">ShieldX</span>,
  CheckCircle2: (props: Record<string, unknown>) => <span data-testid="icon-CheckCircle2">CheckCircle2</span>,
  XCircle: (props: Record<string, unknown>) => <span data-testid="icon-XCircle">XCircle</span>,
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

vi.mock("@/lib/tools/categories", () => ({
  compareRiskLevels: (a: string, b: string) => {
    const order = ["low", "medium", "high", "critical"];
    return order.indexOf(a) - order.indexOf(b);
  },
  RISK_LEVEL_CONFIG: {
    low: { label: "Low Risk", color: "text-green-600", bgColor: "", borderColor: "", icon: "" },
    medium: { label: "Medium Risk", color: "text-yellow-600", bgColor: "", borderColor: "", icon: "" },
    high: { label: "High Risk", color: "text-orange-600", bgColor: "", borderColor: "", icon: "" },
    critical: { label: "Critical Risk", color: "text-red-600", bgColor: "", borderColor: "", icon: "" },
  },
}));

import { GuardrailConfirmationBar } from "./guardrail-confirmation-bar";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockToolCallState {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: string;
  riskLevel?: string;
  guardrailReason?: string;
}

function makePendingTool(overrides: Partial<MockToolCallState> = {}): MockToolCallState {
  return {
    id: "tool-1",
    name: "read_file",
    arguments: { path: "/etc/passwd" },
    status: "pending_confirmation",
    riskLevel: "medium",
    guardrailReason: "Sensitive file path",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GuardrailConfirmationBar", () => {
  const defaultProps = {
    pendingToolCalls: [makePendingTool()] as any[],
    onAcceptAll: vi.fn(),
    onDeclineAll: vi.fn(),
    onAcceptOne: vi.fn(),
    onDeclineOne: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Renders nothing when no pending calls
  // -------------------------------------------------------------------------

  it("returns null when pendingToolCalls is empty", () => {
    const { container } = render(
      <GuardrailConfirmationBar
        {...defaultProps}
        pendingToolCalls={[]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Single tool call
  // -------------------------------------------------------------------------

  it("renders summary text for a single pending tool", () => {
    render(<GuardrailConfirmationBar {...defaultProps} />);
    expect(screen.getByText('"read file" requires approval')).toBeInTheDocument();
  });

  it("renders guardrail reason for a single pending tool", () => {
    render(<GuardrailConfirmationBar {...defaultProps} />);
    expect(screen.getByText("Sensitive file path")).toBeInTheDocument();
  });

  it('shows "Accept" and "Decline" for a single tool', () => {
    render(<GuardrailConfirmationBar {...defaultProps} />);
    expect(screen.getByText("Accept")).toBeInTheDocument();
    expect(screen.getByText("Decline")).toBeInTheDocument();
  });

  it("calls onAcceptOne with tool id when Accept is clicked (single)", async () => {
    const user = userEvent.setup();
    render(<GuardrailConfirmationBar {...defaultProps} />);
    await user.click(screen.getByText("Accept"));
    expect(defaultProps.onAcceptOne).toHaveBeenCalledWith("tool-1");
  });

  it("calls onDeclineOne with tool id when Decline is clicked (single)", async () => {
    const user = userEvent.setup();
    render(<GuardrailConfirmationBar {...defaultProps} />);
    await user.click(screen.getByText("Decline"));
    expect(defaultProps.onDeclineOne).toHaveBeenCalledWith("tool-1");
  });

  it("does NOT call onAcceptAll or onDeclineAll for single tool", async () => {
    const user = userEvent.setup();
    render(<GuardrailConfirmationBar {...defaultProps} />);
    await user.click(screen.getByText("Accept"));
    expect(defaultProps.onAcceptAll).not.toHaveBeenCalled();
    expect(defaultProps.onDeclineAll).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Multiple tool calls
  // -------------------------------------------------------------------------

  it("renders count for multiple pending tools", () => {
    const tools = [
      makePendingTool({ id: "t1", name: "read_file" }),
      makePendingTool({ id: "t2", name: "write_file" }),
      makePendingTool({ id: "t3", name: "shell_execute" }),
    ];
    render(
      <GuardrailConfirmationBar {...defaultProps} pendingToolCalls={tools as any[]} />,
    );
    expect(screen.getByText("3 tools require approval")).toBeInTheDocument();
  });

  it('shows "Accept All" and "Decline All" for multiple tools', () => {
    const tools = [
      makePendingTool({ id: "t1" }),
      makePendingTool({ id: "t2" }),
    ];
    render(
      <GuardrailConfirmationBar {...defaultProps} pendingToolCalls={tools as any[]} />,
    );
    expect(screen.getByText("Accept All")).toBeInTheDocument();
    expect(screen.getByText("Decline All")).toBeInTheDocument();
  });

  it("calls onAcceptAll when Accept All is clicked (multiple)", async () => {
    const user = userEvent.setup();
    const tools = [
      makePendingTool({ id: "t1" }),
      makePendingTool({ id: "t2" }),
    ];
    render(
      <GuardrailConfirmationBar {...defaultProps} pendingToolCalls={tools as any[]} />,
    );
    await user.click(screen.getByText("Accept All"));
    expect(defaultProps.onAcceptAll).toHaveBeenCalledOnce();
  });

  it("calls onDeclineAll when Decline All is clicked (multiple)", async () => {
    const user = userEvent.setup();
    const tools = [
      makePendingTool({ id: "t1" }),
      makePendingTool({ id: "t2" }),
    ];
    render(
      <GuardrailConfirmationBar {...defaultProps} pendingToolCalls={tools as any[]} />,
    );
    await user.click(screen.getByText("Decline All"));
    expect(defaultProps.onDeclineAll).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Risk level display
  // -------------------------------------------------------------------------

  it("shows highest risk label for multiple tools with different risk levels", () => {
    const tools = [
      makePendingTool({ id: "t1", riskLevel: "low" }),
      makePendingTool({ id: "t2", riskLevel: "high" }),
      makePendingTool({ id: "t3", riskLevel: "medium" }),
    ];
    render(
      <GuardrailConfirmationBar {...defaultProps} pendingToolCalls={tools as any[]} />,
    );
    expect(screen.getByText("Highest risk: High Risk")).toBeInTheDocument();
  });

  it("shows critical risk label when any tool is critical", () => {
    const tools = [
      makePendingTool({ id: "t1", riskLevel: "low" }),
      makePendingTool({ id: "t2", riskLevel: "critical" }),
    ];
    render(
      <GuardrailConfirmationBar {...defaultProps} pendingToolCalls={tools as any[]} />,
    );
    expect(screen.getByText("Highest risk: Critical Risk")).toBeInTheDocument();
  });

  it("defaults risk to medium when riskLevel is undefined", () => {
    const tool = makePendingTool({ id: "t1", riskLevel: undefined });
    render(
      <GuardrailConfirmationBar {...defaultProps} pendingToolCalls={[tool] as any[]} />,
    );
    // Single tool, no "Highest risk" label - just guardrail reason
    expect(screen.getByText("Sensitive file path")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Tool name formatting
  // -------------------------------------------------------------------------

  it("replaces underscores with spaces in tool name", () => {
    const tool = makePendingTool({ name: "shell_execute_command" });
    render(
      <GuardrailConfirmationBar {...defaultProps} pendingToolCalls={[tool] as any[]} />,
    );
    expect(screen.getByText('"shell execute command" requires approval')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Guardrail reason
  // -------------------------------------------------------------------------

  it("does not render reason text when guardrailReason is undefined (single)", () => {
    const tool = makePendingTool({ guardrailReason: undefined });
    render(
      <GuardrailConfirmationBar {...defaultProps} pendingToolCalls={[tool] as any[]} />,
    );
    // Summary should be there
    expect(screen.getByText('"read file" requires approval')).toBeInTheDocument();
    // But no sub-text for reason
    expect(screen.queryByText("Sensitive file path")).not.toBeInTheDocument();
  });
});
