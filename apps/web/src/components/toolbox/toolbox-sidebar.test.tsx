import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockItems = [
  { name: "My Agent", content: "agent content", category: "agents" as const, updatedAt: new Date() },
  { name: "My Prompt", content: "prompt content", category: "prompts" as const, updatedAt: new Date() },
  { name: "My Skill", content: "skill content", category: "skills" as const, updatedAt: new Date() },
];

const mockToolboxStore = {
  items: mockItems,
  activeItemKey: null as string | null,
  expandedFolders: new Set(["agents"]),
  toggleFolderExpansion: vi.fn(),
  openItem: vi.fn(),
  createItem: vi.fn().mockResolvedValue(undefined),
  deleteItem: vi.fn().mockResolvedValue(undefined),
  renameItem: vi.fn().mockResolvedValue(undefined),
  loadItemsFromDisk: vi.fn().mockResolvedValue(undefined),
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/stores/toolbox-store", () => ({
  useToolboxStore: () => mockToolboxStore,
  itemKey: (category: string, name: string) => `${category}/${name}`,
}));

vi.mock("lucide-react", () =>
  new Proxy(
    {},
    {
      get: (_, name) => {
        if (name === "__esModule") return true;
        if (typeof name === "symbol" || name === "then" || name === "type") return undefined;
        return Object.assign(
          (props: any) => <div data-testid={`icon-${String(name)}`} {...props} />,
          { displayName: String(name) }
        );
      },
      has: () => true,
    }
  )
);

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, title, className, ...rest }: any) => (
    <button onClick={onClick} disabled={disabled} title={title} className={className} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-menu">{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-content">{children}</div>
  ),
  DropdownMenuTrigger: ({ children, onClick, render: renderProp }: any) => (
    <div data-testid="dropdown-trigger" onClick={onClick}>
      {renderProp || children}
    </div>
  ),
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <div data-testid="dropdown-item" onClick={onClick}>
      {children}
    </div>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

import { ToolboxSidebar } from "./toolbox-sidebar";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ToolboxSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToolboxStore.items = [...mockItems];
    mockToolboxStore.activeItemKey = null;
    mockToolboxStore.expandedFolders = new Set(["agents"]);
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  describe("rendering", () => {
    it("renders the header", () => {
      render(<ToolboxSidebar />);
      expect(screen.getByText("Toolbox")).toBeInTheDocument();
    });

    it("calls loadItemsFromDisk on mount", () => {
      render(<ToolboxSidebar />);
      expect(mockToolboxStore.loadItemsFromDisk).toHaveBeenCalled();
    });

    it("renders all five category folders", () => {
      render(<ToolboxSidebar />);
      expect(screen.getByText("Agents")).toBeInTheDocument();
      expect(screen.getByText("Memories")).toBeInTheDocument();
      expect(screen.getByText("Prompts")).toBeInTheDocument();
      expect(screen.getByText("Skills")).toBeInTheDocument();
      expect(screen.getByText("Workflows")).toBeInTheDocument();
    });

    it("renders items in expanded folders", () => {
      render(<ToolboxSidebar />);
      // "agents" is expanded, so "My Agent" should be visible
      expect(screen.getByText("My Agent")).toBeInTheDocument();
    });

    it("does not render items in collapsed folders", () => {
      render(<ToolboxSidebar />);
      // "prompts" is not expanded, so "My Prompt" should not be visible
      expect(screen.queryByText("My Prompt")).not.toBeInTheDocument();
    });

    it("shows empty state for expanded folder with no items", () => {
      mockToolboxStore.expandedFolders = new Set(["memories"]);
      render(<ToolboxSidebar />);
      expect(screen.getByText("No memories yet")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Folder expansion
  // -------------------------------------------------------------------------

  describe("folder expansion", () => {
    it("calls toggleFolderExpansion when folder label clicked", () => {
      render(<ToolboxSidebar />);
      fireEvent.click(screen.getByText("Prompts"));
      expect(mockToolboxStore.toggleFolderExpansion).toHaveBeenCalledWith("prompts");
    });

    it("calls toggleFolderExpansion when chevron clicked", () => {
      render(<ToolboxSidebar />);
      // Each folder row has a chevron button; find the one in the Agents row
      const agentsLabel = screen.getByText("Agents");
      const folderRow = agentsLabel.closest("div")!;
      const chevronButton = folderRow.querySelector("button")!;
      fireEvent.click(chevronButton);
      expect(mockToolboxStore.toggleFolderExpansion).toHaveBeenCalledWith("agents");
    });
  });

  // -------------------------------------------------------------------------
  // Item selection
  // -------------------------------------------------------------------------

  describe("item selection", () => {
    it("calls openItem when item clicked", () => {
      render(<ToolboxSidebar />);
      fireEvent.click(screen.getByText("My Agent"));
      expect(mockToolboxStore.openItem).toHaveBeenCalledWith("agents", "My Agent");
    });

    it("applies selected styling when item is active", () => {
      mockToolboxStore.activeItemKey = "agents/My Agent";
      render(<ToolboxSidebar />);
      const itemEl = screen.getByText("My Agent").closest("div[class*='cursor-pointer']");
      expect(itemEl?.className).toContain("bg-muted");
    });
  });

  // -------------------------------------------------------------------------
  // Create item
  // -------------------------------------------------------------------------

  describe("create item", () => {
    it("calls createItem when create button in category is clicked", async () => {
      const user = userEvent.setup();
      render(<ToolboxSidebar />);

      // The create button is in the Agents row (title="New agent")
      const createButton = screen.getByTitle("New agent");
      await user.click(createButton);

      expect(mockToolboxStore.createItem).toHaveBeenCalledWith(
        "Untitled Agent",
        "agents"
      );
    });

    it("expands folder if collapsed when creating item", async () => {
      const user = userEvent.setup();
      // Prompts is collapsed
      mockToolboxStore.expandedFolders = new Set([]);
      render(<ToolboxSidebar />);

      const createButton = screen.getByTitle("New agent");
      await user.click(createButton);

      expect(mockToolboxStore.toggleFolderExpansion).toHaveBeenCalledWith("agents");
    });

    it("generates unique name when name already exists", async () => {
      const user = userEvent.setup();
      mockToolboxStore.items = [
        { name: "Untitled Agent", content: "", category: "agents", updatedAt: new Date() },
      ];
      mockToolboxStore.expandedFolders = new Set(["agents"]);
      render(<ToolboxSidebar />);

      const createButton = screen.getByTitle("New agent");
      await user.click(createButton);

      expect(mockToolboxStore.createItem).toHaveBeenCalledWith(
        "Untitled Agent 2",
        "agents"
      );
    });
  });

  // -------------------------------------------------------------------------
  // Context menu (Rename / Delete)
  // -------------------------------------------------------------------------

  describe("context menu", () => {
    it("renders context menu items for items", () => {
      render(<ToolboxSidebar />);
      // The dropdown content contains Rename and Delete
      expect(screen.getByText("Rename")).toBeInTheDocument();
      expect(screen.getByText("Delete")).toBeInTheDocument();
    });

    it("calls deleteItem when Delete menu item clicked", () => {
      render(<ToolboxSidebar />);
      fireEvent.click(screen.getByText("Delete"));
      expect(mockToolboxStore.deleteItem).toHaveBeenCalledWith("agents", "My Agent");
    });

    it("enters edit mode when Rename menu item clicked", () => {
      render(<ToolboxSidebar />);
      fireEvent.click(screen.getByText("Rename"));
      // Should show an input with the current name
      const input = screen.getByDisplayValue("My Agent");
      expect(input).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Inline editing
  // -------------------------------------------------------------------------

  describe("inline editing", () => {
    it("submits rename on Enter key", async () => {
      const user = userEvent.setup();
      render(<ToolboxSidebar />);

      // Start rename
      fireEvent.click(screen.getByText("Rename"));
      const input = screen.getByDisplayValue("My Agent");

      // Clear and type new name
      await user.clear(input);
      await user.type(input, "Renamed Agent{Enter}");

      expect(mockToolboxStore.renameItem).toHaveBeenCalledWith(
        "agents",
        "My Agent",
        "Renamed Agent"
      );
    });

    it("cancels rename on Escape key", async () => {
      const user = userEvent.setup();
      render(<ToolboxSidebar />);

      // Start rename
      fireEvent.click(screen.getByText("Rename"));
      const input = screen.getByDisplayValue("My Agent");

      await user.type(input, "changed");
      await user.keyboard("{Escape}");

      // renameItem should not be called
      expect(mockToolboxStore.renameItem).not.toHaveBeenCalled();
    });

    it("submits rename on blur", () => {
      render(<ToolboxSidebar />);

      // Start rename
      fireEvent.click(screen.getByText("Rename"));
      const input = screen.getByDisplayValue("My Agent");

      // Change value and blur
      fireEvent.change(input, { target: { value: "Blurred Name" } });
      fireEvent.blur(input);

      expect(mockToolboxStore.renameItem).toHaveBeenCalledWith(
        "agents",
        "My Agent",
        "Blurred Name"
      );
    });

    it("does not rename if name is unchanged", () => {
      render(<ToolboxSidebar />);

      // Start rename
      fireEvent.click(screen.getByText("Rename"));
      const input = screen.getByDisplayValue("My Agent");

      // Blur without changing
      fireEvent.blur(input);

      expect(mockToolboxStore.renameItem).not.toHaveBeenCalled();
    });
  });
});
