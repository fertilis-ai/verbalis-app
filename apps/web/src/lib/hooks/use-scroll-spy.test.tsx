import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { useScrollSpy } from "./use-scroll-spy";

const IDS = ["one", "two", "three"] as const;
type Id = (typeof IDS)[number];

let observerCallback: IntersectionObserverCallback;
const observe = vi.fn();
const disconnect = vi.fn();

function Spy({ selected, onSelect }: { selected?: Id; onSelect?: (id: Id) => void }) {
  const ref = useScrollSpy(IDS, selected, onSelect);
  return (
    <div ref={ref}>
      {IDS.map((id) => (
        <section key={id} id={`section-${id}`} />
      ))}
    </div>
  );
}

/** Report the given sections as intersecting at the given top offsets. */
function intersect(entries: Array<[Id, number]>) {
  act(() => {
    observerCallback(
      entries.map(([id, top]) => ({
        isIntersecting: true,
        boundingClientRect: { top } as DOMRect,
        target: document.getElementById(`section-${id}`)!,
      })) as unknown as IntersectionObserverEntry[],
      {} as IntersectionObserver
    );
  });
}

describe("useScrollSpy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    observe.mockClear();
    disconnect.mockClear();
    vi.stubGlobal(
      "IntersectionObserver",
      vi.fn(function (this: unknown, cb: IntersectionObserverCallback) {
        observerCallback = cb;
        return { observe, disconnect };
      })
    );
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("observes every section and reports the topmost visible one", () => {
    const onSelect = vi.fn();
    render(<Spy onSelect={onSelect} />);

    expect(observe).toHaveBeenCalledTimes(3);
    intersect([["three", 300], ["two", 120]]);
    expect(onSelect).toHaveBeenCalledWith("two");
  });

  it("scrolls the selected section into view and ignores the scroll it causes", () => {
    const onSelect = vi.fn();
    render(<Spy selected="three" onSelect={onSelect} />);

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    intersect([["two", 50]]);
    expect(onSelect).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(800);
    });
    intersect([["two", 50]]);
    expect(onSelect).toHaveBeenCalledWith("two");
  });

  it("does not observe without an onSelect callback, and disconnects on unmount", () => {
    const { unmount } = render(<Spy />);
    expect(observe).not.toHaveBeenCalled();
    unmount();

    const second = render(<Spy onSelect={vi.fn()} />);
    second.unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
