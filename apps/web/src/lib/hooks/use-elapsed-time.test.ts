import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useElapsedTime } from "./use-elapsed-time";

describe("useElapsedTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at 0", () => {
    const { result } = renderHook(() => useElapsedTime(false));
    expect(result.current).toBe(0);
  });

  it("stays at 0 when not running", () => {
    const { result } = renderHook(() => useElapsedTime(false));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(0);
  });

  it("increments elapsed time every second when running", () => {
    const { result } = renderHook(() => useElapsedTime(true));
    expect(result.current).toBe(0);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(1);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(3);
  });

  it("stops incrementing when isRunning becomes false", () => {
    const { result, rerender } = renderHook(
      ({ running }) => useElapsedTime(running),
      { initialProps: { running: true } }
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current).toBe(3);

    // Stop
    rerender({ running: false });

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    // Should keep showing last elapsed time (not reset, not increment)
    expect(result.current).toBe(3);
  });

  it("resets start time when restarted after stopping", () => {
    const { result, rerender } = renderHook(
      ({ running }) => useElapsedTime(running),
      { initialProps: { running: true } }
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(2);

    // Stop
    rerender({ running: false });

    // Start again — startTimeRef is reset to null, so it picks up a new Date.now()
    rerender({ running: true });

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(1);
  });

  it("handles rapid start/stop toggling", () => {
    const { result, rerender } = renderHook(
      ({ running }) => useElapsedTime(running),
      { initialProps: { running: false } }
    );

    rerender({ running: true });
    rerender({ running: false });
    rerender({ running: true });

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(2);
  });
});
