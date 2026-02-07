import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

// Mock the file store
const mockFileStore = {
  openFiles: [] as Array<{
    path: string;
    isModified: boolean;
    originalContent: string;
    currentContent: string;
    language: string;
  }>,
  activeFilePath: null as string | null,
  setActiveFile: vi.fn(),
  closeFile: vi.fn(),
};

vi.mock("@/stores/file-store", () => ({
  useFileStore: () => mockFileStore,
}));

// Mock lucide-react
vi.mock("lucide-react", () => ({
  X: ({ className }: { className?: string }) => (
    <span data-testid="x-icon" className={className}>
      X
    </span>
  ),
}));

// Import after mocks
import { FileTabs } from "./file-tabs";

describe("FileTabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFileStore.openFiles = [];
    mockFileStore.activeFilePath = null;
  });

  describe("rendering", () => {
    it("returns null when no files are open", () => {
      const { container } = render(<FileTabs />);
      expect(container.firstChild).toBeNull();
    });

    it("renders tabs for open files", () => {
      mockFileStore.openFiles = [
        {
          path: "/test/file1.ts",
          isModified: false,
          originalContent: "",
          currentContent: "",
          language: "typescript",
        },
        {
          path: "/test/file2.ts",
          isModified: false,
          originalContent: "",
          currentContent: "",
          language: "typescript",
        },
      ];

      render(<FileTabs />);

      expect(screen.getByText("file1.ts")).toBeInTheDocument();
      expect(screen.getByText("file2.ts")).toBeInTheDocument();
    });
  });

  describe("close button behavior", () => {
    it("shows X icon for unmodified file", () => {
      mockFileStore.openFiles = [
        {
          path: "/test/file.ts",
          isModified: false,
          originalContent: "",
          currentContent: "",
          language: "typescript",
        },
      ];
      mockFileStore.activeFilePath = "/test/file.ts";

      render(<FileTabs />);

      const xIcon = screen.getByTestId("x-icon");
      expect(xIcon).toBeInTheDocument();
    });

    it("shows dot for modified file when not hovering close button", () => {
      mockFileStore.openFiles = [
        {
          path: "/test/file.ts",
          isModified: true,
          originalContent: "original",
          currentContent: "modified",
          language: "typescript",
        },
      ];
      mockFileStore.activeFilePath = "/test/file.ts";

      render(<FileTabs />);

      // Should show dot (a span with rounded-full class)
      const closeButton = screen.getByTitle("Close");
      const dot = closeButton.querySelector("span.rounded-full");
      expect(dot).toBeInTheDocument();
    });

    it("shows X when hovering close button on modified file", async () => {
      mockFileStore.openFiles = [
        {
          path: "/test/file.ts",
          isModified: true,
          originalContent: "original",
          currentContent: "modified",
          language: "typescript",
        },
      ];
      mockFileStore.activeFilePath = "/test/file.ts";

      render(<FileTabs />);

      const closeButton = screen.getByTitle("Close");

      // Before hover - should show dot
      let dot = closeButton.querySelector("span.rounded-full");
      expect(dot).toBeInTheDocument();

      // Hover the close button
      fireEvent.mouseEnter(closeButton);

      // After hover - should show X icon
      const xIcon = screen.getByTestId("x-icon");
      expect(xIcon).toBeInTheDocument();

      // Dot should not be present
      dot = closeButton.querySelector("span.rounded-full");
      expect(dot).not.toBeInTheDocument();
    });

    it("shows dot again when mouse leaves close button", async () => {
      mockFileStore.openFiles = [
        {
          path: "/test/file.ts",
          isModified: true,
          originalContent: "original",
          currentContent: "modified",
          language: "typescript",
        },
      ];
      mockFileStore.activeFilePath = "/test/file.ts";

      render(<FileTabs />);

      const closeButton = screen.getByTitle("Close");

      // Hover
      fireEvent.mouseEnter(closeButton);
      expect(screen.getByTestId("x-icon")).toBeInTheDocument();

      // Leave
      fireEvent.mouseLeave(closeButton);
      const dot = closeButton.querySelector("span.rounded-full");
      expect(dot).toBeInTheDocument();
    });

    it("calls closeFile when clicking close button", async () => {
      const user = userEvent.setup();
      mockFileStore.openFiles = [
        {
          path: "/test/file.ts",
          isModified: false,
          originalContent: "",
          currentContent: "",
          language: "typescript",
        },
      ];
      mockFileStore.activeFilePath = "/test/file.ts";

      render(<FileTabs />);

      const closeButton = screen.getByTitle("Close");
      await user.click(closeButton);

      expect(mockFileStore.closeFile).toHaveBeenCalledWith("/test/file.ts");
    });
  });

  describe("tab selection", () => {
    it("calls setActiveFile when clicking a tab", async () => {
      const user = userEvent.setup();
      mockFileStore.openFiles = [
        {
          path: "/test/file1.ts",
          isModified: false,
          originalContent: "",
          currentContent: "",
          language: "typescript",
        },
        {
          path: "/test/file2.ts",
          isModified: false,
          originalContent: "",
          currentContent: "",
          language: "typescript",
        },
      ];
      mockFileStore.activeFilePath = "/test/file1.ts";

      render(<FileTabs />);

      const file2Tab = screen.getByText("file2.ts");
      await user.click(file2Tab);

      expect(mockFileStore.setActiveFile).toHaveBeenCalledWith("/test/file2.ts");
    });
  });

  describe("inactive tab visibility", () => {
    it("close button is hidden for inactive unmodified tabs until group hover", () => {
      mockFileStore.openFiles = [
        {
          path: "/test/file1.ts",
          isModified: false,
          originalContent: "",
          currentContent: "",
          language: "typescript",
        },
        {
          path: "/test/file2.ts",
          isModified: false,
          originalContent: "",
          currentContent: "",
          language: "typescript",
        },
      ];
      mockFileStore.activeFilePath = "/test/file1.ts";

      render(<FileTabs />);

      // Get all close buttons
      const closeButtons = screen.getAllByTitle("Close");

      // The second button (inactive tab) should have opacity-0 class
      expect(closeButtons[1].className).toContain("opacity-0");
    });

    it("close button is always visible for modified inactive tabs", () => {
      mockFileStore.openFiles = [
        {
          path: "/test/file1.ts",
          isModified: false,
          originalContent: "",
          currentContent: "",
          language: "typescript",
        },
        {
          path: "/test/file2.ts",
          isModified: true,
          originalContent: "original",
          currentContent: "modified",
          language: "typescript",
        },
      ];
      mockFileStore.activeFilePath = "/test/file1.ts";

      render(<FileTabs />);

      const closeButtons = screen.getAllByTitle("Close");

      // The second button (inactive but modified) should NOT have opacity-0
      expect(closeButtons[1].className).not.toContain("opacity-0");
    });
  });
});
