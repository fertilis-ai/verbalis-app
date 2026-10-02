import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { highlightCode } = vi.hoisted(() => ({ highlightCode: vi.fn() }));

vi.mock("@/lib/highlighter", () => ({
  highlightCode,
  escapeHtml: (text: string) => text,
}));

import { CodeOverlayEditor } from "./code-overlay-editor";

describe("CodeOverlayEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    highlightCode.mockResolvedValue(null);
  });

  it("renders one gutter number per line", () => {
    render(<CodeOverlayEditor content={"a\nb\nc"} language="text" onChange={vi.fn()} />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("4")).not.toBeInTheDocument();
  });

  it("highlights with the given language and re-highlights when it changes", () => {
    const { rerender } = render(
      <CodeOverlayEditor content="x" language="yaml" onChange={vi.fn()} />,
    );
    expect(highlightCode).toHaveBeenLastCalledWith("x", "yaml");

    rerender(<CodeOverlayEditor content="x" language="markdown" onChange={vi.fn()} />);
    expect(highlightCode).toHaveBeenLastCalledWith("x", "markdown");
  });

  it("reports edits through onChange", () => {
    const onChange = vi.fn();
    render(<CodeOverlayEditor content="abc" language="text" onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "abcd" } });
    expect(onChange).toHaveBeenCalledWith("abcd");
  });

  it("replaces the selection with two spaces on Tab", () => {
    const onChange = vi.fn();
    render(<CodeOverlayEditor content="abcd" language="text" onChange={onChange} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(1, 3);

    fireEvent.keyDown(textarea, { key: "Tab" });

    expect(onChange).toHaveBeenCalledWith("a  d");
  });

  it("passes key events to onKeyDown before handling Tab", () => {
    const onChange = vi.fn();
    const onKeyDown = vi.fn();
    render(
      <CodeOverlayEditor
        content="x"
        language="text"
        onChange={onChange}
        onKeyDown={onKeyDown}
      />,
    );
    const textarea = screen.getByRole("textbox");

    fireEvent.keyDown(textarea, { key: "s", metaKey: true });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: "Tab" });
    expect(onKeyDown).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
