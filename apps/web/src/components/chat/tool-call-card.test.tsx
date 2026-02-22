import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ToolCallState } from "@/lib/tools";
import { ToolCallCard } from "./tool-call-card";

function makeToolCall(overrides: Partial<ToolCallState> = {}): ToolCallState {
  return {
    id: "tc-1",
    name: "delete_path",
    arguments: { path: "/tmp/file.txt" },
    status: "pending_confirmation",
    category: "file_system",
    riskLevel: "high",
    ...overrides,
  };
}

describe("ToolCallCard", () => {
  it("renders accept/decline actions for pending confirmation", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onReject = vi.fn();

    render(
      <ToolCallCard
        toolCall={makeToolCall()}
        onConfirm={onConfirm}
        onReject={onReject}
      />
    );

    await user.click(screen.getByRole("button", { name: "Accept" }));
    await user.click(screen.getByRole("button", { name: "Decline" }));

    expect(onConfirm).toHaveBeenCalledWith("tc-1");
    expect(onReject).toHaveBeenCalledWith("tc-1");
  });

  it("does not render accept/decline actions for terminal statuses", () => {
    render(<ToolCallCard toolCall={makeToolCall({ status: "success" })} />);

    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Decline" })).not.toBeInTheDocument();
  });

  it("maps legacy 'completed' status to completed UI state", () => {
    render(
      <ToolCallCard
        toolCall={makeToolCall({ status: "completed" as ToolCallState["status"] })}
      />
    );

    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.queryByText("Preparing...")).not.toBeInTheDocument();
  });

  it("maps unknown statuses to stopped instead of preparing", () => {
    render(
      <ToolCallCard
        toolCall={makeToolCall({ status: "unexpected_status" as ToolCallState["status"] })}
      />
    );

    expect(screen.getByText("Stopped")).toBeInTheDocument();
    expect(screen.queryByText("Preparing...")).not.toBeInTheDocument();
  });
});
