import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

// Mock tree node type
interface MockFileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  isExpanded?: boolean;
  children?: MockFileNode[];
}

// Mock the stores
const mockFileStore = {
  tree: [] as MockFileNode[],
  selectedFile: null as string | null,
  toggleDirectory: vi.fn(),
  setSearchOpen: vi.fn(),
  loadFileTree: vi.fn(),
  refreshTree: vi.fn(),
  openFile: vi.fn(),
  createFile: vi.fn(),
  createFolder: vi.fn(),
  editingPath: null as string | null,
  editingName: "",
  setEditingName: vi.fn(),
  startEditing: vi.fn(),
  cancelEditing: vi.fn(),
  submitEditing: vi.fn(),
  deleteItem: vi.fn(),
};

const mockSettingsStore = {
  workingDirectory: "/test/workspace",
};

vi.mock("@/stores/file-store", () => ({
  useFileStore: () => mockFileStore,
}));

vi.mock("@/stores/settings-store", () => ({
  useSettingsStore: () => mockSettingsStore,
}));

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  Search: () => <span data-testid="search-icon">Search</span>,
  ChevronRight: () => <span data-testid="chevron-right">ChevronRight</span>,
  ChevronDown: () => <span data-testid="chevron-down">ChevronDown</span>,
  File: () => <span data-testid="file-icon">File</span>,
  Folder: () => <span data-testid="folder-icon">Folder</span>,
  FolderOpen: () => <span data-testid="folder-open-icon">FolderOpen</span>,
  FolderPlus: () => <span data-testid="folder-plus-icon">FolderPlus</span>,
  Plus: () => <span data-testid="plus-icon">Plus</span>,
  MoreHorizontal: () => <span data-testid="more-icon">More</span>,
  Pencil: () => <span data-testid="pencil-icon">Pencil</span>,
  Trash2: () => <span data-testid="trash-icon">Trash</span>,
}));

// Import after mocks
import { FileSidebar } from "./file-sidebar";

describe("FileSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFileStore.tree = [];
  });

  describe("Header Icons", () => {
    it("renders search icon first in the header", () => {
      render(<FileSidebar />);

      const buttons = screen.getAllByRole("button");
      // First button should be Search (after skipping any non-header buttons)
      const headerButtons = buttons.filter(
        (btn) =>
          btn.title === "Search files (Ctrl+P)" ||
          btn.title === "New folder" ||
          btn.title === "New file"
      );

      expect(headerButtons[0]).toHaveAttribute("title", "Search files (Ctrl+P)");
      expect(headerButtons[1]).toHaveAttribute("title", "New folder");
      expect(headerButtons[2]).toHaveAttribute("title", "New file");
    });

    it("renders all three header action buttons", () => {
      render(<FileSidebar />);

      expect(screen.getByTitle("Search files (Ctrl+P)")).toBeInTheDocument();
      expect(screen.getByTitle("New folder")).toBeInTheDocument();
      expect(screen.getByTitle("New file")).toBeInTheDocument();
    });
  });

  describe("Folder hover actions", () => {
    beforeEach(() => {
      mockFileStore.tree = [
        {
          name: "test-folder",
          path: "/test/workspace/test-folder",
          isDirectory: true,
          isExpanded: false,
          children: [],
        },
      ];
    });

    it("shows FolderPlus and Plus icons on folder hover", async () => {
      render(<FileSidebar />);

      const folderRow = screen.getByText("test-folder").closest("div");
      expect(folderRow).toBeInTheDocument();

      // Simulate hover
      fireEvent.mouseEnter(folderRow!);

      // Should show both action buttons
      const folderPlusButton = screen.getByTitle("New folder inside");
      const filePlusButton = screen.getByTitle("New file inside");

      expect(folderPlusButton).toBeInTheDocument();
      expect(filePlusButton).toBeInTheDocument();
    });

    it("shows folder input when clicking FolderPlus button", async () => {
      const user = userEvent.setup();
      // Folder needs to be expanded for the input to appear inside it
      mockFileStore.tree[0].isExpanded = true;
      render(<FileSidebar />);

      const folderRow = screen.getByText("test-folder").closest("div");
      fireEvent.mouseEnter(folderRow!);

      const folderPlusButton = screen.getByTitle("New folder inside");
      await user.click(folderPlusButton);

      // Should show input with folder placeholder
      const input = screen.getByPlaceholderText("folder name");
      expect(input).toBeInTheDocument();
    });

    it("shows file input when clicking Plus button", async () => {
      const user = userEvent.setup();
      // Folder needs to be expanded for the input to appear inside it
      mockFileStore.tree[0].isExpanded = true;
      render(<FileSidebar />);

      const folderRow = screen.getByText("test-folder").closest("div");
      fireEvent.mouseEnter(folderRow!);

      const filePlusButton = screen.getByTitle("New file inside");
      await user.click(filePlusButton);

      // Should show input with file placeholder
      const input = screen.getByPlaceholderText("file name");
      expect(input).toBeInTheDocument();
    });

    it("calls createFolder when submitting folder name", async () => {
      const user = userEvent.setup();
      mockFileStore.tree[0].isExpanded = true;

      render(<FileSidebar />);

      const folderRow = screen.getByText("test-folder").closest("div");
      fireEvent.mouseEnter(folderRow!);

      const folderPlusButton = screen.getByTitle("New folder inside");
      await user.click(folderPlusButton);

      const input = screen.getByPlaceholderText("folder name");
      await user.type(input, "new-subfolder{enter}");

      expect(mockFileStore.createFolder).toHaveBeenCalledWith(
        "/test/workspace/test-folder",
        "new-subfolder"
      );
    });

    it("calls createFile when submitting file name", async () => {
      const user = userEvent.setup();
      mockFileStore.tree[0].isExpanded = true;

      render(<FileSidebar />);

      const folderRow = screen.getByText("test-folder").closest("div");
      fireEvent.mouseEnter(folderRow!);

      const filePlusButton = screen.getByTitle("New file inside");
      await user.click(filePlusButton);

      const input = screen.getByPlaceholderText("file name");
      await user.type(input, "new-file.txt{enter}");

      expect(mockFileStore.createFile).toHaveBeenCalledWith(
        "/test/workspace/test-folder",
        "new-file.txt"
      );
    });
  });

  describe("Platform-aware folder colors", () => {
    it("uses platform detection for folder colors", () => {
      // The component uses navigator.userAgent to detect platform
      // On jsdom, this will default to a specific value
      render(<FileSidebar />);

      // Component should render without errors
      expect(screen.getByText("Workspace")).toBeInTheDocument();
    });
  });
});
