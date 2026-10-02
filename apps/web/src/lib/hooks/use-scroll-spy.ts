import * as React from "react";

/**
 * Two-way sync between a scrolling list of `section-${id}` elements and a
 * sidebar selection. Selecting an id scrolls its section into view; scrolling
 * manually reports the topmost visible section through `onSelect`.
 *
 * `ids` should be a stable (module-level) array. Returns the ref to attach to
 * the scroll container.
 */
export function useScrollSpy<T extends string>(
  ids: readonly T[],
  selected: T | undefined,
  onSelect: ((id: T) => void) | undefined
): React.RefObject<HTMLDivElement | null> {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const isScrollingFromClick = React.useRef(false);

  // Scroll to section when the selection changes from a sidebar click
  React.useEffect(() => {
    if (!selected) return;
    const el = document.getElementById(`section-${selected}`);
    if (el) {
      isScrollingFromClick.current = true;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      // Reset flag after scroll animation completes, so the observer doesn't
      // report the sections scrolled past on the way.
      const timer = setTimeout(() => {
        isScrollingFromClick.current = false;
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [selected]);

  // IntersectionObserver to sync the sidebar highlight on manual scroll
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || !onSelect) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isScrollingFromClick.current) return;
        // Find the topmost visible section
        let topSection: T | null = null;
        let topY = Infinity;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const rect = entry.boundingClientRect;
            if (rect.top < topY) {
              topY = rect.top;
              topSection = entry.target.id.replace("section-", "") as T;
            }
          }
        }
        if (topSection) {
          onSelect(topSection);
        }
      },
      {
        root: container,
        rootMargin: "-10% 0px -80% 0px",
        threshold: 0,
      }
    );

    for (const id of ids) {
      const el = document.getElementById(`section-${id}`);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [ids, onSelect]);

  return containerRef;
}
