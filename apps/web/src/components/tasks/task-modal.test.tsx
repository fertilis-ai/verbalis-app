import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockEditingTask = {
  id: "task-1",
  title: "Existing Task",
  description: "Existing description",
  agent: "custom-agent",
  outputFolder: "/custom/output",
  resultStatus: null,
  stage: "backlog" as const,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockTaskStore = {
  editingTask: null as typeof mockEditingTask | null,
  isTaskModalOpen: true,
  closeTaskModal: vi.fn(),
  updateTask: vi.fn().mockResolvedValue(undefined),
  deleteTask: vi.fn().mockResolvedValue(undefined),
  createTask: vi.fn().mockResolvedValue(undefined),
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/stores/task-store", () => ({
  useTaskStore: () => mockTaskStore,
}));

vi.mock("@/stores/agent-store", () => ({
  useAgentStore: (selector?: any) => {
    const state = { agents: [{ name: "default" }, { name: "custom-agent" }] };
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

vi.mock("lucide-react", () =>
  new Proxy(
    {},
    {
      get: (_, name) => {
        if (name === "__esModule") return true;
        return (props: any) => (
          <div data-testid={`icon-${String(name)}`} {...props} />
        );
      },
    }
  )
);

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, variant, render: renderProp, ...rest }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: ({ className, ...props }: any) => <input {...props} />,
}));

vi.mock("@base-ui/react/dialog", () => ({
  Dialog: {
    Root: ({ children, open }: any) => (open ? <div data-testid="dialog-root">{children}</div> : null),
    Portal: ({ children }: any) => <div data-testid="dialog-portal">{children}</div>,
    Backdrop: () => <div data-testid="dialog-backdrop" />,
    Popup: ({ children }: any) => <div data-testid="dialog-popup">{children}</div>,
    Title: ({ children }: any) => <h2 data-testid="dialog-title">{children}</h2>,
    Close: ({ children, render: renderProp }: any) => (
      <div data-testid="dialog-close">{renderProp || children}</div>
    ),
  },
}));

import { TaskModal } from "./task-modal";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TaskModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskStore.editingTask = null;
    mockTaskStore.isTaskModalOpen = true;
  });

  // -------------------------------------------------------------------------
  // Create mode
  // -------------------------------------------------------------------------

  describe("create mode", () => {
    it("renders with 'New Task' title in create mode", () => {
      render(<TaskModal />);
      expect(screen.getByTestId("dialog-title")).toHaveTextContent("New Task");
    });

    it("renders Create button in create mode", () => {
      render(<TaskModal />);
      expect(screen.getByText("Create")).toBeInTheDocument();
    });

    it("does not render Delete button in create mode", () => {
      render(<TaskModal />);
      expect(screen.queryByText("Delete")).not.toBeInTheDocument();
    });

    it("renders Cancel button", () => {
      render(<TaskModal />);
      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });

    it("renders empty title input", () => {
      render(<TaskModal />);
      const titleInput = screen.getByPlaceholderText("Task title...");
      expect(titleInput).toHaveValue("");
    });

    it("renders agent selector with default value", () => {
      render(<TaskModal />);
      const agentSelect = screen.getByDisplayValue("default");
      expect(agentSelect).toBeInTheDocument();
    });

    it("renders all available agents in selector", () => {
      render(<TaskModal />);
      const options = screen.getAllByRole("option");
      expect(options).toHaveLength(2);
      expect(options[0]).toHaveTextContent("default");
      expect(options[1]).toHaveTextContent("custom-agent");
    });

    it("renders output folder input with workspace default", () => {
      render(<TaskModal />);
      const outputInput = screen.getByPlaceholderText("/path/to/output...");
      expect(outputInput).toHaveValue("/workspace");
    });

    it("disables Create button when title is empty", () => {
      render(<TaskModal />);
      const createButton = screen.getByText("Create");
      expect(createButton).toBeDisabled();
    });

    it("enables Create button when title is provided", async () => {
      const user = userEvent.setup();
      render(<TaskModal />);
      const titleInput = screen.getByPlaceholderText("Task title...");
      await user.type(titleInput, "New task title");
      const createButton = screen.getByText("Create");
      expect(createButton).not.toBeDisabled();
    });

    it("calls createTask and closeTaskModal on submit", async () => {
      const user = userEvent.setup();
      render(<TaskModal />);

      const titleInput = screen.getByPlaceholderText("Task title...");
      await user.type(titleInput, "My New Task");

      const descTextarea = screen.getByPlaceholderText("Task description...");
      await user.type(descTextarea, "Some description");

      fireEvent.click(screen.getByText("Create"));

      await vi.waitFor(() => {
        expect(mockTaskStore.createTask).toHaveBeenCalledWith(
          "My New Task",
          "Some description",
          "default",
          "/workspace"
        );
      });
      expect(mockTaskStore.closeTaskModal).toHaveBeenCalled();
    });

    it("does not call createTask when title is only whitespace", async () => {
      const user = userEvent.setup();
      render(<TaskModal />);
      const titleInput = screen.getByPlaceholderText("Task title...");
      await user.type(titleInput, "   ");

      // Button should be disabled for whitespace-only title
      const createButton = screen.getByText("Create");
      expect(createButton).toBeDisabled();
    });

    it("calls closeTaskModal when Cancel is clicked", () => {
      render(<TaskModal />);
      fireEvent.click(screen.getByText("Cancel"));
      expect(mockTaskStore.closeTaskModal).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Edit mode
  // -------------------------------------------------------------------------

  describe("edit mode", () => {
    beforeEach(() => {
      mockTaskStore.editingTask = { ...mockEditingTask };
    });

    it("renders with 'Edit Task' title in edit mode", () => {
      render(<TaskModal />);
      expect(screen.getByTestId("dialog-title")).toHaveTextContent("Edit Task");
    });

    it("renders Update button in edit mode", () => {
      render(<TaskModal />);
      expect(screen.getByText("Update")).toBeInTheDocument();
    });

    it("renders Delete button in edit mode", () => {
      render(<TaskModal />);
      expect(screen.getByText("Delete")).toBeInTheDocument();
    });

    it("populates form with editing task data", () => {
      render(<TaskModal />);
      expect(screen.getByPlaceholderText("Task title...")).toHaveValue("Existing Task");
      expect(screen.getByPlaceholderText("Task description...")).toHaveValue("Existing description");
      expect(screen.getByDisplayValue("custom-agent")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("/path/to/output...")).toHaveValue("/custom/output");
    });

    it("calls updateTask and closeTaskModal on submit", async () => {
      const user = userEvent.setup();
      render(<TaskModal />);

      const titleInput = screen.getByPlaceholderText("Task title...");
      await user.clear(titleInput);
      await user.type(titleInput, "Updated Title");

      fireEvent.click(screen.getByText("Update"));

      await vi.waitFor(() => {
        expect(mockTaskStore.updateTask).toHaveBeenCalledWith("task-1", {
          title: "Updated Title",
          description: "Existing description",
          agent: "custom-agent",
          outputFolder: "/custom/output",
        });
      });
      expect(mockTaskStore.closeTaskModal).toHaveBeenCalled();
    });

    it("calls deleteTask and closeTaskModal when Delete clicked", async () => {
      render(<TaskModal />);
      fireEvent.click(screen.getByText("Delete"));

      await vi.waitFor(() => {
        expect(mockTaskStore.deleteTask).toHaveBeenCalledWith("task-1");
      });
      expect(mockTaskStore.closeTaskModal).toHaveBeenCalled();
    });

    it("updates agent field", async () => {
      render(<TaskModal />);
      const agentSelect = screen.getByDisplayValue("custom-agent");
      fireEvent.change(agentSelect, { target: { value: "default" } });

      fireEvent.click(screen.getByText("Update"));

      await vi.waitFor(() => {
        expect(mockTaskStore.updateTask).toHaveBeenCalledWith("task-1", expect.objectContaining({
          agent: "default",
        }));
      });
    });
  });

  // -------------------------------------------------------------------------
  // Closed state
  // -------------------------------------------------------------------------

  describe("closed state", () => {
    it("does not render dialog when isTaskModalOpen is false", () => {
      mockTaskStore.isTaskModalOpen = false;
      render(<TaskModal />);
      expect(screen.queryByTestId("dialog-root")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Form fields
  // -------------------------------------------------------------------------

  describe("form fields", () => {
    it("renders all form labels", () => {
      render(<TaskModal />);
      expect(screen.getByText("Title")).toBeInTheDocument();
      expect(screen.getByText("Agent")).toBeInTheDocument();
      expect(screen.getByText("Description")).toBeInTheDocument();
      expect(screen.getByText("Output Folder")).toBeInTheDocument();
    });

    it("updates description field", async () => {
      const user = userEvent.setup();
      render(<TaskModal />);
      const desc = screen.getByPlaceholderText("Task description...");
      await user.type(desc, "Hello");
      expect(desc).toHaveValue("Hello");
    });

    it("updates output folder field", async () => {
      const user = userEvent.setup();
      render(<TaskModal />);
      const outputInput = screen.getByPlaceholderText("/path/to/output...");
      await user.clear(outputInput);
      await user.type(outputInput, "/new/path");
      expect(outputInput).toHaveValue("/new/path");
    });
  });
});
