import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockSchedulerTree = [
  {
    id: "folder-1",
    name: "Morning Routines",
    type: "folder",
    isPinned: true,
    children: [
      { id: "sched-1", name: "Wake Up Routine", type: "schedule" },
    ],
  },
  {
    id: "sched-2",
    name: "Daily Backup",
    type: "schedule",
  },
  {
    id: "folder-2",
    name: "Weekly Tasks",
    type: "folder",
    isPinned: false,
    children: [],
  },
];

const mockSchedules = [
  { id: "sched-1", name: "Wake Up Routine" },
  { id: "sched-2", name: "Daily Backup" },
];

const mockSchedulerStore = {
  schedulerTree: mockSchedulerTree,
  schedules: mockSchedules,
  selectedScheduleId: null as string | null,
  expandedFolders: new Set(["folder-1"]),
  createFolder: vi.fn().mockResolvedValue(undefined),
  renameFolder: vi.fn().mockResolvedValue(undefined),
  deleteFolder: vi.fn().mockResolvedValue(undefined),
  toggleFolderPin: vi.fn().mockResolvedValue(undefined),
  toggleFolderExpansion: vi.fn(),
  createSchedule: vi.fn().mockResolvedValue(undefined),
  renameSchedule: vi.fn().mockResolvedValue(undefined),
  deleteSchedule: vi.fn().mockResolvedValue(undefined),
  selectSchedule: vi.fn(),
  loadSchedulersFromDisk: vi.fn().mockResolvedValue(undefined),
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/stores/scheduler-store", () => ({
  useSchedulerStore: () => mockSchedulerStore,
}));

vi.mock("@/lib/hooks/use-polling-loader", () => ({
  usePollingLoader: (loadFn: () => void) => {
    // Call immediately to simulate mount behavior
    React.useEffect(() => {
      loadFn();
    }, [loadFn]);
  },
}));

vi.mock("@/lib/hooks/use-inline-editing", () => ({
  useInlineEditing: ({ onRename }: any) => ({
    editingId: null,
    editingName: "",
    startEditing: vi.fn(),
    setEditingName: vi.fn(),
    handleRenameSubmit: vi.fn(),
    handleKeyDown: vi.fn(),
  }),
}));

vi.mock("@/lib/sidebar-utils", () => ({
  splitByPinned: (tree: any[]) => {
    const pinned = tree.filter((n: any) => n.type === "folder" && n.isPinned);
    const unpinned = tree.filter((n: any) => !(n.type === "folder" && n.isPinned));
    return { pinned, unpinned };
  },
  collectTreeIds: (nodes: any[], type: string) => {
    const ids = new Set<string>();
    const walk = (items: any[]) => {
      for (const node of items) {
        if (node.type === type) {
          ids.add(node.id);
        } else if (node.children) {
          walk(node.children);
        }
      }
    };
    walk(nodes);
    return ids;
  },
}));

vi.mock("@/components/shared/sidebar-tree-node", () => ({
  SidebarTreeNode: ({ node, depth, onSelect, selectedItemId }: any) => (
    <div
      data-testid={`tree-node-${node.id}`}
      data-depth={depth}
      data-selected={selectedItemId}
    >
      <span>{node.name}</span>
      {node.children?.map((child: any) => (
        <div key={child.id} data-testid={`tree-child-${child.id}`}>
          <span onClick={() => onSelect?.(child.id)}>{child.name}</span>
        </div>
      ))}
    </div>
  ),
}));

vi.mock("lucide-react", () =>
  new Proxy(
    {},
    {
      get: (_, name) => {
        if (name === "__esModule") return true;
        if (typeof name === "symbol" || name === "then") return undefined;
        return (props: any) => (
          <div data-testid={`icon-${String(name)}`} {...props} />
        );
      },
      has: () => true,
    }
  )
);

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, title, ...rest }: any) => (
    <button onClick={onClick} disabled={disabled} title={title} {...rest}>
      {children}
    </button>
  ),
}));

import { SchedulerSidebar } from "./scheduler-sidebar";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SchedulerSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSchedulerStore.schedulerTree = [...mockSchedulerTree];
    mockSchedulerStore.schedules = [...mockSchedules];
    mockSchedulerStore.selectedScheduleId = null;
    mockSchedulerStore.expandedFolders = new Set(["folder-1"]);
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  describe("rendering", () => {
    it("renders the header", () => {
      render(<SchedulerSidebar />);
      expect(screen.getByText("Scheduler")).toBeInTheDocument();
    });

    it("calls loadSchedulersFromDisk on mount (via usePollingLoader)", () => {
      render(<SchedulerSidebar />);
      expect(mockSchedulerStore.loadSchedulersFromDisk).toHaveBeenCalled();
    });

    it("renders new folder button", () => {
      render(<SchedulerSidebar />);
      expect(screen.getByTitle("New folder")).toBeInTheDocument();
    });

    it("renders new schedule button", () => {
      render(<SchedulerSidebar />);
      expect(screen.getByTitle("New schedule")).toBeInTheDocument();
    });

    it("renders pinned folders", () => {
      render(<SchedulerSidebar />);
      expect(screen.getByTestId("tree-node-folder-1")).toBeInTheDocument();
      expect(screen.getByText("Morning Routines")).toBeInTheDocument();
    });

    it("renders unpinned items", () => {
      render(<SchedulerSidebar />);
      expect(screen.getByText("Daily Backup")).toBeInTheDocument();
      expect(screen.getByText("Weekly Tasks")).toBeInTheDocument();
    });

    it("renders children of tree nodes", () => {
      render(<SchedulerSidebar />);
      expect(screen.getByText("Wake Up Routine")).toBeInTheDocument();
    });

    it("renders divider between pinned and unpinned sections", () => {
      render(<SchedulerSidebar />);
      const divider = document.querySelector(".border-b.border-border.my-1");
      expect(divider).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  describe("empty state", () => {
    it("shows empty message when no items at all", () => {
      mockSchedulerStore.schedulerTree = [];
      mockSchedulerStore.schedules = [];
      render(<SchedulerSidebar />);
      expect(screen.getByText("No schedules yet")).toBeInTheDocument();
    });

    it("does not show empty message when items exist", () => {
      render(<SchedulerSidebar />);
      expect(screen.queryByText("No schedules yet")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Create actions
  // -------------------------------------------------------------------------

  describe("create actions", () => {
    it("calls createFolder when new folder button clicked", async () => {
      const user = userEvent.setup();
      render(<SchedulerSidebar />);
      await user.click(screen.getByTitle("New folder"));
      expect(mockSchedulerStore.createFolder).toHaveBeenCalledWith("New Folder");
    });

    it("calls createSchedule when new schedule button clicked", async () => {
      const user = userEvent.setup();
      render(<SchedulerSidebar />);
      await user.click(screen.getByTitle("New schedule"));
      expect(mockSchedulerStore.createSchedule).toHaveBeenCalledWith("New Schedule", undefined);
    });
  });

  // -------------------------------------------------------------------------
  // In-memory only schedules
  // -------------------------------------------------------------------------

  describe("in-memory only schedules", () => {
    it("renders in-memory schedules that are not in the tree", () => {
      mockSchedulerStore.schedules = [
        ...mockSchedules,
        { id: "sched-new", name: "Unsaved Schedule" },
      ];
      render(<SchedulerSidebar />);
      expect(screen.getByText("Unsaved Schedule")).toBeInTheDocument();
    });

    it("renders default name for in-memory schedule with empty name", () => {
      mockSchedulerStore.schedules = [
        ...mockSchedules,
        { id: "sched-new", name: "" },
      ];
      render(<SchedulerSidebar />);
      expect(screen.getByText("New Schedule")).toBeInTheDocument();
    });

    it("calls selectSchedule when in-memory schedule clicked", () => {
      mockSchedulerStore.schedules = [
        ...mockSchedules,
        { id: "sched-new", name: "Unsaved Schedule" },
      ];
      render(<SchedulerSidebar />);
      fireEvent.click(screen.getByText("Unsaved Schedule"));
      expect(mockSchedulerStore.selectSchedule).toHaveBeenCalledWith("sched-new");
    });

    it("applies selected styling to selected in-memory schedule", () => {
      mockSchedulerStore.schedules = [
        ...mockSchedules,
        { id: "sched-new", name: "Unsaved Schedule" },
      ];
      mockSchedulerStore.selectedScheduleId = "sched-new";
      render(<SchedulerSidebar />);
      const el = screen.getByText("Unsaved Schedule").closest("div[class*='cursor-pointer']");
      expect(el?.className).toContain("bg-muted");
    });
  });

  // -------------------------------------------------------------------------
  // No pinned folders
  // -------------------------------------------------------------------------

  describe("no pinned folders", () => {
    it("does not render divider when there are no pinned folders", () => {
      mockSchedulerStore.schedulerTree = [
        { id: "sched-2", name: "Daily Backup", type: "schedule" },
      ];
      render(<SchedulerSidebar />);
      const divider = document.querySelector(".border-b.border-border.my-1");
      expect(divider).not.toBeInTheDocument();
    });
  });
});
