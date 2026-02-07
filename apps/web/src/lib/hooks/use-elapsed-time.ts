import * as React from "react";

export function useElapsedTime(isRunning: boolean): number {
  const [elapsed, setElapsed] = React.useState(0);
  const startTimeRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (isRunning) {
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }

      const interval = setInterval(() => {
        if (startTimeRef.current) {
          setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [isRunning]);

  // Reset when starting fresh
  React.useEffect(() => {
    if (!isRunning) {
      startTimeRef.current = null;
      // Don't reset elapsed - keep showing final time
    }
  }, [isRunning]);

  return elapsed;
}
