import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiscoverableModelSelect, ModelDiscoveryHeader } from "./discoverable-model-select";

vi.mock("lucide-react", () => ({
  RefreshCw: () => <span data-testid="icon-RefreshCw" />,
  Loader2: () => <span data-testid="icon-Loader2" />,
}));

const baseProps = {
  label: "Image Model",
  onRefresh: vi.fn(),
  isFetching: false,
  error: null,
  canFetch: true,
  value: "",
  onChange: vi.fn(),
  options: [
    { id: "a", name: "Model A" },
    { id: "b", name: "Model B" },
  ],
  emptyHint: "Click Refresh to load models.",
  hint: "Enables the tool.",
  hasFetched: true,
};

describe("DiscoverableModelSelect", () => {
  it("lists a None option plus each model, and reports changes", async () => {
    const onChange = vi.fn();
    render(<DiscoverableModelSelect {...baseProps} onChange={onChange} />);

    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["None (disabled)", "Model A", "Model B"]);
    await userEvent.selectOptions(screen.getByRole("combobox"), "b");
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("shows the empty hint until models have been fetched", () => {
    const { rerender } = render(<DiscoverableModelSelect {...baseProps} hasFetched={false} />);
    expect(screen.getByText("Click Refresh to load models.")).toBeInTheDocument();

    rerender(<DiscoverableModelSelect {...baseProps} />);
    expect(screen.getByText("Enables the tool.")).toBeInTheDocument();
  });

  it("renders extra controls between the select and the hint", () => {
    render(
      <DiscoverableModelSelect {...baseProps}>
        <div data-testid="voice" />
      </DiscoverableModelSelect>
    );
    const voice = screen.getByTestId("voice");
    expect(voice.compareDocumentPosition(screen.getByText("Enables the tool.")))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});

describe("ModelDiscoveryHeader", () => {
  it("calls onRefresh with no arguments", async () => {
    const onRefresh = vi.fn();
    render(<ModelDiscoveryHeader {...baseProps} onRefresh={onRefresh} />);
    await userEvent.click(screen.getByRole("button", { name: /refresh/i }));
    expect(onRefresh).toHaveBeenCalledWith();
  });

  it("shows a spinner and disables Refresh while fetching", () => {
    render(<ModelDiscoveryHeader {...baseProps} isFetching />);
    expect(screen.getByTestId("icon-Loader2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /refresh/i })).toBeDisabled();
  });

  it("shows the fetch error", () => {
    render(<ModelDiscoveryHeader {...baseProps} error="Network down" />);
    expect(screen.getByText("Network down")).toBeInTheDocument();
  });

  it("disables Refresh outside the desktop app, with the hint only when asked", () => {
    const { rerender } = render(<ModelDiscoveryHeader {...baseProps} canFetch={false} />);
    expect(screen.getByRole("button", { name: /refresh/i })).toBeDisabled();
    expect(screen.queryByText("Desktop app required")).not.toBeInTheDocument();

    rerender(<ModelDiscoveryHeader {...baseProps} canFetch={false} showDesktopHint />);
    expect(screen.getByText("Desktop app required")).toBeInTheDocument();
  });
});
