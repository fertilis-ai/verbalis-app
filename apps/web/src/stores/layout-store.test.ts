import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock zustand persist to be a passthrough (avoids localStorage issues in tests)
vi.mock("zustand/middleware", () => ({
  persist: (fn: unknown) => fn,
}));

import { useLayoutStore } from "./layout-store";

describe("layout-store", () => {
  beforeEach(() => {
    // Use partial setState (no replace flag) to preserve action functions
    useLayoutStore.setState({
      openSection: null,
      paneWidths: {
        chat: 250,
        files: 250,
        tasks: 250,
        scheduler: 250,
        toolbox: 250,
        settings: 300,
        debug: 250,
      },
    });
  });

  describe("initial state", () => {
    it("has no open section", () => {
      expect(useLayoutStore.getState().openSection).toBeNull();
    });

    it("has default pane widths", () => {
      const { paneWidths } = useLayoutStore.getState();
      expect(paneWidths.chat).toBe(250);
      expect(paneWidths.settings).toBe(300);
      expect(paneWidths.debug).toBe(250);
    });
  });

  describe("toggleSection", () => {
    it("opens a closed section", () => {
      useLayoutStore.getState().toggleSection("chat");
      expect(useLayoutStore.getState().openSection).toBe("chat");
    });

    it("closes an already open section", () => {
      useLayoutStore.getState().toggleSection("chat");
      useLayoutStore.getState().toggleSection("chat");
      expect(useLayoutStore.getState().openSection).toBeNull();
    });

    it("switches to a different section", () => {
      useLayoutStore.getState().toggleSection("chat");
      useLayoutStore.getState().toggleSection("files");
      expect(useLayoutStore.getState().openSection).toBe("files");
    });

    it("works with all section IDs", () => {
      const sections = ["chat", "files", "tasks", "scheduler", "toolbox", "settings", "debug"] as const;
      for (const section of sections) {
        useLayoutStore.getState().toggleSection(section);
        expect(useLayoutStore.getState().openSection).toBe(section);
        useLayoutStore.getState().toggleSection(section);
        expect(useLayoutStore.getState().openSection).toBeNull();
      }
    });
  });

  describe("openSectionPane", () => {
    it("opens a section", () => {
      useLayoutStore.getState().openSectionPane("debug");
      expect(useLayoutStore.getState().openSection).toBe("debug");
    });

    it("switches to a different section if one is already open", () => {
      useLayoutStore.getState().openSectionPane("chat");
      useLayoutStore.getState().openSectionPane("settings");
      expect(useLayoutStore.getState().openSection).toBe("settings");
    });

    it("keeps the same section open when called again", () => {
      useLayoutStore.getState().openSectionPane("files");
      useLayoutStore.getState().openSectionPane("files");
      expect(useLayoutStore.getState().openSection).toBe("files");
    });
  });

  describe("closePane", () => {
    it("closes the open section", () => {
      useLayoutStore.getState().openSectionPane("chat");
      useLayoutStore.getState().closePane();
      expect(useLayoutStore.getState().openSection).toBeNull();
    });

    it("is a no-op when no section is open", () => {
      useLayoutStore.getState().closePane();
      expect(useLayoutStore.getState().openSection).toBeNull();
    });
  });

  describe("setPaneWidth", () => {
    it("sets width for a specific section", () => {
      useLayoutStore.getState().setPaneWidth("chat", 400);
      expect(useLayoutStore.getState().paneWidths.chat).toBe(400);
    });

    it("does not affect other sections", () => {
      useLayoutStore.getState().setPaneWidth("chat", 400);
      expect(useLayoutStore.getState().paneWidths.files).toBe(250);
      expect(useLayoutStore.getState().paneWidths.settings).toBe(300);
    });

    it("can set widths for multiple sections independently", () => {
      useLayoutStore.getState().setPaneWidth("chat", 100);
      useLayoutStore.getState().setPaneWidth("debug", 500);
      useLayoutStore.getState().setPaneWidth("settings", 350);
      const { paneWidths } = useLayoutStore.getState();
      expect(paneWidths.chat).toBe(100);
      expect(paneWidths.debug).toBe(500);
      expect(paneWidths.settings).toBe(350);
    });

    it("allows zero width", () => {
      useLayoutStore.getState().setPaneWidth("chat", 0);
      expect(useLayoutStore.getState().paneWidths.chat).toBe(0);
    });
  });
});
