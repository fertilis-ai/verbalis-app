import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DEFAULT_AGENT_NAME } from "@/stores/agent-store";
import type { ScheduleData } from "@/stores/scheduler-store";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function makeSchedule(overrides: Partial<ScheduleData> = {}): ScheduleData {
  return {
    id: "sched-1",
    name: "Morning Briefing",
    cron: "0 9 * * *",
    agentId: "researcher",
    prompt: "Summarize the news",
    enabled: true,
    hasError: false,
    lastRun: null,
    nextRun: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const mockSchedulerStore = {
  selectedSchedule: makeSchedule() as ScheduleData | null,
  getSelectedSchedule: vi.fn(() => mockSchedulerStore.selectedSchedule),
  updateSchedule: vi.fn().mockResolvedValue(undefined),
  runScheduleNow: vi.fn().mockResolvedValue(undefined),
  stopScheduleRun: vi.fn(),
  runningScheduleId: null as string | null,
  schedulerLog: "",
  schedulerLogScheduleId: null as string | null,
};

const mockToolboxItems = [
  { name: DEFAULT_AGENT_NAME, category: "agents" },
  { name: "researcher", category: "agents" },
  { name: "notes", category: "memories" },
];

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/stores/scheduler-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/stores/scheduler-store")>()),
  useSchedulerStore: () => mockSchedulerStore,
}));

vi.mock("@/stores/toolbox-store", () => ({
  useToolboxStore: (selector: (s: { items: typeof mockToolboxItems }) => unknown) =>
    selector({ items: mockToolboxItems }),
}));

import { SchedulerView } from "./scheduler-view";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SchedulerView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSchedulerStore.selectedSchedule = makeSchedule();
    mockSchedulerStore.runningScheduleId = null;
    mockSchedulerStore.schedulerLog = "";
    mockSchedulerStore.schedulerLogScheduleId = null;
  });

  it("shows the empty state when no schedule is selected", () => {
    mockSchedulerStore.selectedSchedule = null;
    render(<SchedulerView />);
    expect(screen.getByText("No schedule selected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /run now/i })).not.toBeInTheDocument();
  });

  it("renders the selected schedule's fields", () => {
    render(<SchedulerView />);
    expect(screen.getByText("Morning Briefing")).toBeInTheDocument();
    expect(screen.getByDisplayValue("0 9 * * *")).toBeInTheDocument();
    expect(screen.getByText("At 09:00 AM")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Summarize the news")).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
    expect(screen.getByText("Not scheduled")).toBeInTheDocument();
  });

  it("lists only agents in the agent select", () => {
    render(<SchedulerView />);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual([DEFAULT_AGENT_NAME, "researcher"]);
    expect(screen.getByRole("combobox")).toHaveValue("researcher");
  });

  it("maps the legacy Assistant agent id to the default agent", () => {
    mockSchedulerStore.selectedSchedule = makeSchedule({ agentId: "Assistant" });
    render(<SchedulerView />);
    expect(screen.getByRole("combobox")).toHaveValue(DEFAULT_AGENT_NAME);
  });

  it("runs the schedule from Run now", () => {
    render(<SchedulerView />);
    fireEvent.click(screen.getByRole("button", { name: /run now/i }));
    expect(mockSchedulerStore.runScheduleNow).toHaveBeenCalledWith("sched-1");
  });

  it("disables Run now when the prompt is blank", () => {
    mockSchedulerStore.selectedSchedule = makeSchedule({ prompt: "   " });
    render(<SchedulerView />);
    expect(screen.getByRole("button", { name: /run now/i })).toBeDisabled();
  });

  it("disables Run now while another schedule is running", () => {
    mockSchedulerStore.runningScheduleId = "sched-2";
    render(<SchedulerView />);
    expect(screen.getByRole("button", { name: /run now/i })).toBeDisabled();
  });

  it("shows Stop and a running preview while this schedule runs", () => {
    mockSchedulerStore.runningScheduleId = "sched-1";
    mockSchedulerStore.schedulerLogScheduleId = "sched-1";
    render(<SchedulerView />);
    expect(screen.getByText("Running...")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /stop/i }));
    expect(mockSchedulerStore.stopScheduleRun).toHaveBeenCalled();
  });

  it("shows the run log for this schedule only", () => {
    mockSchedulerStore.schedulerLog = "Done: 3 headlines";
    mockSchedulerStore.schedulerLogScheduleId = "sched-1";
    const { unmount } = render(<SchedulerView />);
    expect(screen.getByText("Done: 3 headlines")).toBeInTheDocument();
    unmount();

    mockSchedulerStore.schedulerLogScheduleId = "sched-2";
    render(<SchedulerView />);
    expect(screen.queryByText("Done: 3 headlines")).not.toBeInTheDocument();
  });

  it("toggles enabled immediately", () => {
    render(<SchedulerView />);
    fireEvent.click(screen.getByRole("switch"));
    expect(mockSchedulerStore.updateSchedule).toHaveBeenCalledWith("sched-1", { enabled: false });
  });

  it("updates the agent immediately", () => {
    render(<SchedulerView />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: DEFAULT_AGENT_NAME } });
    expect(mockSchedulerStore.updateSchedule).toHaveBeenCalledWith("sched-1", {
      agentId: DEFAULT_AGENT_NAME,
    });
  });

  it("debounces name edits", async () => {
    render(<SchedulerView />);
    fireEvent.change(screen.getByDisplayValue("Morning Briefing"), {
      target: { value: "Evening Briefing" },
    });
    expect(mockSchedulerStore.updateSchedule).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mockSchedulerStore.updateSchedule).toHaveBeenCalledWith("sched-1", {
        name: "Evening Briefing",
      })
    );
  });

  it("shows the error indicator after a failed run", () => {
    mockSchedulerStore.selectedSchedule = makeSchedule({ hasError: true });
    render(<SchedulerView />);
    expect(screen.getByText(/last execution encountered an error/i)).toBeInTheDocument();
  });
});
