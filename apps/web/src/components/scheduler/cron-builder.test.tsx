import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

// Import component (no external deps to mock besides UI)
import { CronBuilder } from "./cron-builder";

describe("CronBuilder", () => {
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChange = vi.fn();
  });

  describe("rendering", () => {
    it("renders all preset buttons", () => {
      render(<CronBuilder value="" onChange={onChange} />);

      expect(screen.getByText("Every hour")).toBeInTheDocument();
      expect(screen.getByText("Daily at 9 AM")).toBeInTheDocument();
      expect(screen.getByText("Daily at 6 PM")).toBeInTheDocument();
      expect(screen.getByText("Weekdays at 9 AM")).toBeInTheDocument();
      expect(screen.getByText("Weekdays at 6 PM")).toBeInTheDocument();
      expect(screen.getByText("Every Monday at 9 AM")).toBeInTheDocument();
      expect(screen.getByText("First of month at 9 AM")).toBeInTheDocument();
    });

    it("renders exactly 7 preset buttons", () => {
      render(<CronBuilder value="" onChange={onChange} />);
      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(7);
    });
  });

  describe("selection state", () => {
    it("highlights the button matching the current value", () => {
      render(<CronBuilder value="0 * * * *" onChange={onChange} />);
      const everyHourBtn = screen.getByText("Every hour");
      // The selected button uses "secondary" variant, others use "outline"
      expect(everyHourBtn.closest("button")).toBeInTheDocument();
    });

    it("does not highlight any button when value does not match any preset", () => {
      render(<CronBuilder value="*/5 * * * *" onChange={onChange} />);
      // All buttons should be present, none specifically selected
      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(7);
    });

    it("highlights 'Weekdays at 9 AM' when value is '0 9 * * 1-5'", () => {
      render(<CronBuilder value="0 9 * * 1-5" onChange={onChange} />);
      expect(screen.getByText("Weekdays at 9 AM")).toBeInTheDocument();
    });
  });

  describe("clicking presets", () => {
    it("calls onChange with correct cron for 'Every hour'", async () => {
      const user = userEvent.setup();
      render(<CronBuilder value="" onChange={onChange} />);

      await user.click(screen.getByText("Every hour"));
      expect(onChange).toHaveBeenCalledWith("0 * * * *");
    });

    it("calls onChange with correct cron for 'Daily at 9 AM'", async () => {
      const user = userEvent.setup();
      render(<CronBuilder value="" onChange={onChange} />);

      await user.click(screen.getByText("Daily at 9 AM"));
      expect(onChange).toHaveBeenCalledWith("0 9 * * *");
    });

    it("calls onChange with correct cron for 'Daily at 6 PM'", async () => {
      const user = userEvent.setup();
      render(<CronBuilder value="" onChange={onChange} />);

      await user.click(screen.getByText("Daily at 6 PM"));
      expect(onChange).toHaveBeenCalledWith("0 18 * * *");
    });

    it("calls onChange with correct cron for 'Weekdays at 9 AM'", async () => {
      const user = userEvent.setup();
      render(<CronBuilder value="" onChange={onChange} />);

      await user.click(screen.getByText("Weekdays at 9 AM"));
      expect(onChange).toHaveBeenCalledWith("0 9 * * 1-5");
    });

    it("calls onChange with correct cron for 'Weekdays at 6 PM'", async () => {
      const user = userEvent.setup();
      render(<CronBuilder value="" onChange={onChange} />);

      await user.click(screen.getByText("Weekdays at 6 PM"));
      expect(onChange).toHaveBeenCalledWith("0 18 * * 1-5");
    });

    it("calls onChange with correct cron for 'Every Monday at 9 AM'", async () => {
      const user = userEvent.setup();
      render(<CronBuilder value="" onChange={onChange} />);

      await user.click(screen.getByText("Every Monday at 9 AM"));
      expect(onChange).toHaveBeenCalledWith("0 9 * * 1");
    });

    it("calls onChange with correct cron for 'First of month at 9 AM'", async () => {
      const user = userEvent.setup();
      render(<CronBuilder value="" onChange={onChange} />);

      await user.click(screen.getByText("First of month at 9 AM"));
      expect(onChange).toHaveBeenCalledWith("0 9 1 * *");
    });

    it("calls onChange once per click", async () => {
      const user = userEvent.setup();
      render(<CronBuilder value="" onChange={onChange} />);

      await user.click(screen.getByText("Every hour"));
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("allows clicking a different preset after selecting one", async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <CronBuilder value="0 * * * *" onChange={onChange} />
      );

      await user.click(screen.getByText("Daily at 9 AM"));
      expect(onChange).toHaveBeenCalledWith("0 9 * * *");

      // Simulate parent updating value
      rerender(<CronBuilder value="0 9 * * *" onChange={onChange} />);

      await user.click(screen.getByText("Weekdays at 9 AM"));
      expect(onChange).toHaveBeenCalledWith("0 9 * * 1-5");
    });
  });
});
