import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as React from "react";

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  Play: (props: any) => <span data-testid="icon-Play" {...props}>Play</span>,
  Square: (props: any) => (
    <span data-testid="icon-Square" {...props}>Square</span>
  ),
  RotateCcw: (props: any) => (
    <span data-testid="icon-RotateCcw" {...props}>RotateCcw</span>
  ),
  Plus: (props: any) => <span data-testid="icon-Plus" {...props}>Plus</span>,
  Loader2: (props: any) => (
    <span data-testid="icon-Loader2" {...props}>Loader2</span>
  ),
  Trash2: (props: any) => (
    <span data-testid="icon-Trash2" {...props}>Trash2</span>
  ),
  X: (props: any) => <span data-testid="icon-X" {...props}>X</span>,
  AlertTriangle: (props: any) => (
    <span data-testid="icon-AlertTriangle" {...props}>AlertTriangle</span>
  ),
  KanbanSquare: (props: any) => (
    <span data-testid="icon-KanbanSquare" {...props}>KanbanSquare</span>
  ),
}));

// Mock Button
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, title, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} title={title} {...props}>
      {children}
    </button>
  ),
}));

// Mock Input
vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

// Task store mock data
interface MockTaskData {
  id: string;
  title: string;
  description: string;
  agent: string;
  outputFolder: string;
  resultStatus: string | null;
  stage: "backlog" | "in_progress" | "done";
  createdAt: string;
  updatedAt: string;
}

const mockBacklogTasks: MockTaskData[] = [
  {
    id: "task-1",
    title: "Backlog Task 1",
    description: "Description 1",
    agent: "default",
    outputFolder: "/out",
    resultStatus: null,
    stage: "backlog",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "task-2",
    title: "Backlog Task 2",
    description: "Description 2",
    agent: "default",
    outputFolder: "/out",
    resultStatus: null,
    stage: "backlog",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const mockInProgressTasks: MockTaskData[] = [
  {
    id: "task-3",
    title: "In Progress Task",
    description: "Running",
    agent: "default",
    outputFolder: "/out",
    resultStatus: null,
    stage: "in_progress",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const mockDoneTasks: MockTaskData[] = [
  {
    id: "task-4",
    title: "Done Task",
    description: "Completed",
    agent: "default",
    outputFolder: "/out",
    resultStatus: "success",
    stage: "done",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const mockTaskStore = {
  selectedFolderId: "folder-1" as string | null,
  getTasksByStage: vi.fn((stage: string) => {
    switch (stage) {
      case "backlog":
        return mockBacklogTasks;
      case "in_progress":
        return mockInProgressTasks;
      case "done":
        return mockDoneTasks;
      default:
        return [];
    }
  }),
  confirmModalAction: null as string | null,
  setConfirmModalAction: vi.fn(),
  playAll: vi.fn().mockResolvedValue(undefined),
  stopAll: vi.fn().mockResolvedValue(undefined),
  redoAll: vi.fn().mockResolvedValue(undefined),
  taskTree: [{ id: "folder-1", name: "My Tasks", type: "folder", path: "/tasks/my-tasks", isPinned: false }],
  runningTaskIds: new Set<string>(),
  startTask: vi.fn().mockResolvedValue(undefined),
  stopTask: vi.fn().mockResolvedValue(undefined),
  redoTask: vi.fn().mockResolvedValue(undefined),
  openTaskModal: vi.fn(),
  selectedFolderPath: "/tasks/my-tasks",
  isTaskModalOpen: false,
  editingTask: null,
  closeTaskModal: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  createTask: vi.fn(),
};

vi.mock("@/stores/task-store", () => ({
  useTaskStore: (selector?: any) => {
    if (typeof selector === "function") {
      return selector(mockTaskStore);
    }
    return mockTaskStore;
  },
}));

vi.mock("@/stores/agent-store", () => ({
  useAgentStore: (selector?: any) => {
    const state = { agents: [{ name: "default" }] };
    if (typeof selector === "function") {
      return selector(state);
    }
    return state;
  },
}));

vi.mock("@/stores/settings-store", () => ({
  useSettingsStore: (selector?: any) => {
    const state = { workingDirectory: "/workspace" };
    if (typeof selector === "function") {
      return selector(state);
    }
    return state;
  },
}));

// Mock child components to isolate KanbanBoard tests
vi.mock("./kanban-column", () => ({
  KanbanColumn: ({ title, count, children, loading }: any) => (
    <div data-testid={`column-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <span data-testid={`column-title-${title.toLowerCase().replace(/\s+/g, "-")}`}>
        {title}
      </span>
      <span data-testid={`column-count-${title.toLowerCase().replace(/\s+/g, "-")}`}>
        {count}
      </span>
      {loading && <span data-testid="column-loading">loading</span>}
      {children}
    </div>
  ),
}));

vi.mock("./task-card", () => ({
  TaskCard: ({ task }: any) => (
    <div data-testid={`task-card-${task.id}`}>{task.title}</div>
  ),
}));

vi.mock("./new-task-card", () => ({
  NewTaskCard: () => <div data-testid="new-task-card">New Task</div>,
}));

vi.mock("./confirm-modal", () => ({
  ConfirmModal: ({ open, action, taskCount, onConfirm, onCancel }: any) =>
    open ? (
      <div data-testid="confirm-modal">
        <span data-testid="confirm-action">{action}</span>
        <span data-testid="confirm-count">{taskCount}</span>
        <button data-testid="confirm-btn" onClick={onConfirm}>
          Confirm
        </button>
        <button data-testid="cancel-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    ) : null,
}));

vi.mock("./task-modal", () => ({
  TaskModal: () => <div data-testid="task-modal">TaskModal</div>,
}));

// Mock @base-ui/react/dialog
vi.mock("@base-ui/react/dialog", () => ({
  Dialog: {
    Root: ({ children }: any) => <div>{children}</div>,
    Portal: ({ children }: any) => <div>{children}</div>,
    Backdrop: () => null,
    Popup: ({ children }: any) => <div>{children}</div>,
    Title: ({ children }: any) => <div>{children}</div>,
    Close: ({ children }: any) => <div>{children}</div>,
  },
}));

import { KanbanBoard } from "./kanban-board";

describe("KanbanBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskStore.selectedFolderId = "folder-1";
    mockTaskStore.confirmModalAction = null;
    mockTaskStore.runningTaskIds = new Set<string>();
    mockTaskStore.getTasksByStage.mockImplementation((stage: string) => {
      switch (stage) {
        case "backlog":
          return mockBacklogTasks;
        case "in_progress":
          return mockInProgressTasks;
        case "done":
          return mockDoneTasks;
        default:
          return [];
      }
    });
  });

  describe("header", () => {
    it("displays the selected folder name", () => {
      render(<KanbanBoard />);

      expect(screen.getByText("My Tasks")).toBeInTheDocument();
    });

    it("displays 'Tasks' when no folder is found", () => {
      mockTaskStore.taskTree = [];
      render(<KanbanBoard />);

      expect(screen.getByText("Tasks")).toBeInTheDocument();
    });

    it("renders play, stop, and redo buttons", () => {
      render(<KanbanBoard />);

      expect(screen.getByTitle("Start all backlog tasks")).toBeInTheDocument();
      expect(screen.getByTitle("Stop all in-progress tasks")).toBeInTheDocument();
      expect(screen.getByTitle("Redo all done tasks")).toBeInTheDocument();
    });
  });

  describe("no folder selected", () => {
    it("shows placeholder when no folder is selected", () => {
      mockTaskStore.selectedFolderId = null;
      render(<KanbanBoard />);

      expect(screen.getByText("No folder selected")).toBeInTheDocument();
    });

    it("disables all action buttons when no folder selected", () => {
      mockTaskStore.selectedFolderId = null;
      render(<KanbanBoard />);

      expect(screen.getByTitle("Start all backlog tasks")).toBeDisabled();
      expect(screen.getByTitle("Stop all in-progress tasks")).toBeDisabled();
      expect(screen.getByTitle("Redo all done tasks")).toBeDisabled();
    });
  });

  describe("kanban columns", () => {
    it("renders all three columns", () => {
      render(<KanbanBoard />);

      expect(screen.getByTestId("column-backlog")).toBeInTheDocument();
      expect(screen.getByTestId("column-in-progress")).toBeInTheDocument();
      expect(screen.getByTestId("column-done")).toBeInTheDocument();
    });

    it("passes correct count to backlog column", () => {
      render(<KanbanBoard />);

      expect(screen.getByTestId("column-count-backlog")).toHaveTextContent("2");
    });

    it("passes correct count to in-progress column", () => {
      render(<KanbanBoard />);

      expect(screen.getByTestId("column-count-in-progress")).toHaveTextContent("1");
    });

    it("passes correct count to done column", () => {
      render(<KanbanBoard />);

      expect(screen.getByTestId("column-count-done")).toHaveTextContent("1");
    });

    it("renders task cards for each task", () => {
      render(<KanbanBoard />);

      expect(screen.getByTestId("task-card-task-1")).toBeInTheDocument();
      expect(screen.getByTestId("task-card-task-2")).toBeInTheDocument();
      expect(screen.getByTestId("task-card-task-3")).toBeInTheDocument();
      expect(screen.getByTestId("task-card-task-4")).toBeInTheDocument();
    });

    it("renders NewTaskCard in backlog column", () => {
      render(<KanbanBoard />);

      expect(screen.getByTestId("new-task-card")).toBeInTheDocument();
    });

    it("passes loading prop to in-progress column when tasks are running", () => {
      mockTaskStore.runningTaskIds = new Set(["task-3"]);
      render(<KanbanBoard />);

      expect(screen.getByTestId("column-loading")).toBeInTheDocument();
    });

    it("does not pass loading when no tasks are running", () => {
      mockTaskStore.runningTaskIds = new Set<string>();
      render(<KanbanBoard />);

      expect(screen.queryByTestId("column-loading")).not.toBeInTheDocument();
    });
  });

  describe("bulk action buttons", () => {
    it("play button is enabled when there are backlog tasks", () => {
      render(<KanbanBoard />);

      expect(screen.getByTitle("Start all backlog tasks")).not.toBeDisabled();
    });

    it("play button is disabled when no backlog tasks", () => {
      mockTaskStore.getTasksByStage.mockImplementation((stage: string) => {
        if (stage === "backlog") return [];
        if (stage === "in_progress") return mockInProgressTasks;
        if (stage === "done") return mockDoneTasks;
        return [];
      });
      render(<KanbanBoard />);

      expect(screen.getByTitle("Start all backlog tasks")).toBeDisabled();
    });

    it("stop button is enabled when there are in-progress tasks", () => {
      render(<KanbanBoard />);

      expect(screen.getByTitle("Stop all in-progress tasks")).not.toBeDisabled();
    });

    it("stop button is disabled when no in-progress tasks", () => {
      mockTaskStore.getTasksByStage.mockImplementation((stage: string) => {
        if (stage === "backlog") return mockBacklogTasks;
        if (stage === "in_progress") return [];
        if (stage === "done") return mockDoneTasks;
        return [];
      });
      render(<KanbanBoard />);

      expect(screen.getByTitle("Stop all in-progress tasks")).toBeDisabled();
    });

    it("redo button is enabled when there are done tasks", () => {
      render(<KanbanBoard />);

      expect(screen.getByTitle("Redo all done tasks")).not.toBeDisabled();
    });

    it("redo button is disabled when no done tasks", () => {
      mockTaskStore.getTasksByStage.mockImplementation((stage: string) => {
        if (stage === "backlog") return mockBacklogTasks;
        if (stage === "in_progress") return mockInProgressTasks;
        if (stage === "done") return [];
        return [];
      });
      render(<KanbanBoard />);

      expect(screen.getByTitle("Redo all done tasks")).toBeDisabled();
    });

    it("clicking play opens confirm modal with 'play' action", () => {
      render(<KanbanBoard />);

      fireEvent.click(screen.getByTitle("Start all backlog tasks"));
      expect(mockTaskStore.setConfirmModalAction).toHaveBeenCalledWith("play");
    });

    it("clicking stop opens confirm modal with 'stop' action", () => {
      render(<KanbanBoard />);

      fireEvent.click(screen.getByTitle("Stop all in-progress tasks"));
      expect(mockTaskStore.setConfirmModalAction).toHaveBeenCalledWith("stop");
    });

    it("clicking redo opens confirm modal with 'redo' action", () => {
      render(<KanbanBoard />);

      fireEvent.click(screen.getByTitle("Redo all done tasks"));
      expect(mockTaskStore.setConfirmModalAction).toHaveBeenCalledWith("redo");
    });

    it("does not open play confirm when no backlog tasks", () => {
      mockTaskStore.getTasksByStage.mockImplementation((stage: string) => {
        if (stage === "backlog") return [];
        if (stage === "in_progress") return mockInProgressTasks;
        if (stage === "done") return mockDoneTasks;
        return [];
      });
      render(<KanbanBoard />);

      fireEvent.click(screen.getByTitle("Start all backlog tasks"));
      expect(mockTaskStore.setConfirmModalAction).not.toHaveBeenCalled();
    });
  });

  describe("confirm modal", () => {
    it("renders confirm modal when confirmModalAction is set", () => {
      mockTaskStore.confirmModalAction = "play";
      render(<KanbanBoard />);

      expect(screen.getByTestId("confirm-modal")).toBeInTheDocument();
      expect(screen.getByTestId("confirm-action")).toHaveTextContent("play");
    });

    it("passes backlog count for play action", () => {
      mockTaskStore.confirmModalAction = "play";
      render(<KanbanBoard />);

      expect(screen.getByTestId("confirm-count")).toHaveTextContent("2");
    });

    it("passes in-progress count for stop action", () => {
      mockTaskStore.confirmModalAction = "stop";
      render(<KanbanBoard />);

      expect(screen.getByTestId("confirm-count")).toHaveTextContent("1");
    });

    it("passes done count for redo action", () => {
      mockTaskStore.confirmModalAction = "redo";
      render(<KanbanBoard />);

      expect(screen.getByTestId("confirm-count")).toHaveTextContent("1");
    });

    it("calls playAll on confirm when action is play", async () => {
      mockTaskStore.confirmModalAction = "play";
      render(<KanbanBoard />);

      fireEvent.click(screen.getByTestId("confirm-btn"));
      // Wait for async handler
      await vi.waitFor(() => {
        expect(mockTaskStore.playAll).toHaveBeenCalled();
      });
      expect(mockTaskStore.setConfirmModalAction).toHaveBeenCalledWith(null);
    });

    it("calls stopAll on confirm when action is stop", async () => {
      mockTaskStore.confirmModalAction = "stop";
      render(<KanbanBoard />);

      fireEvent.click(screen.getByTestId("confirm-btn"));
      await vi.waitFor(() => {
        expect(mockTaskStore.stopAll).toHaveBeenCalled();
      });
    });

    it("calls redoAll on confirm when action is redo", async () => {
      mockTaskStore.confirmModalAction = "redo";
      render(<KanbanBoard />);

      fireEvent.click(screen.getByTestId("confirm-btn"));
      await vi.waitFor(() => {
        expect(mockTaskStore.redoAll).toHaveBeenCalled();
      });
    });

    it("clears confirm modal on cancel", () => {
      mockTaskStore.confirmModalAction = "play";
      render(<KanbanBoard />);

      fireEvent.click(screen.getByTestId("cancel-btn"));
      expect(mockTaskStore.setConfirmModalAction).toHaveBeenCalledWith(null);
    });

    it("does not show confirm modal when confirmModalAction is null", () => {
      mockTaskStore.confirmModalAction = null;
      render(<KanbanBoard />);

      expect(screen.queryByTestId("confirm-modal")).not.toBeInTheDocument();
    });
  });

  describe("task modal", () => {
    it("renders task modal", () => {
      render(<KanbanBoard />);

      expect(screen.getByTestId("task-modal")).toBeInTheDocument();
    });
  });
});
