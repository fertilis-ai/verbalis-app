import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock lucide-react with explicit exports (NOT a Proxy - Proxy causes vitest hangs)
vi.mock("lucide-react", () => ({
  Shield: (props: any) => <span data-testid="icon-Shield" {...props} />,
  ShieldAlert: (props: any) => <span data-testid="icon-ShieldAlert" {...props} />,
  ShieldCheck: (props: any) => <span data-testid="icon-ShieldCheck" {...props} />,
  ShieldX: (props: any) => <span data-testid="icon-ShieldX" {...props} />,
  ChevronDown: (props: any) => <span data-testid="icon-ChevronDown" {...props} />,
  ChevronRight: (props: any) => <span data-testid="icon-ChevronRight" {...props} />,
  Download: (props: any) => <span data-testid="icon-Download" {...props} />,
  Upload: (props: any) => <span data-testid="icon-Upload" {...props} />,
  RotateCcw: (props: any) => <span data-testid="icon-RotateCcw" {...props} />,
  Plus: (props: any) => <span data-testid="icon-Plus" {...props} />,
  X: (props: any) => <span data-testid="icon-X" {...props} />,
}));

// Mock transitive deps for categories -> web-tools/system-tools chain
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));
vi.mock("@/lib/storage", () => ({ isTauri: vi.fn(() => false) }));
vi.mock("@earendil-works/pi-ai", () => ({
  StringEnum: vi.fn((values: readonly string[]) => ({ type: "string", enum: values })),
}));

// Mock transitive deps for settings-store
vi.mock("@/lib/keychain", () => ({ storeApiKey: vi.fn(async () => {}) }));
vi.mock("@/lib/logger", () => ({ setLoggingEnabled: vi.fn() }));
vi.mock("@/lib/provider-models", () => ({
  fetchAllProviderModels: vi.fn(async () => []),
  fetchOpenRouterImageModels: vi.fn(async () => ({ models: [] })),
  fetchOpenRouterTranscriptionModels: vi.fn(async () => ({ models: [] })),
  fetchOpenRouterSpeechModels: vi.fn(async () => ({ models: [] })),
}));
vi.mock("zustand/middleware", () => ({ persist: (fn: any) => fn }));

import { DEFAULT_GUARDRAILS_CONFIG } from "@/lib/guardrails/types";

// Mock settings store
const mockSettingsStore = {
  guardrailsConfig: { ...DEFAULT_GUARDRAILS_CONFIG },
  setGuardrailsConfig: vi.fn(),
  resetGuardrailsToDefaults: vi.fn(),
  applyGuardrailsPreset: vi.fn(),
  importGuardrailsConfig: vi.fn(() => true),
  exportGuardrailsConfig: vi.fn(() => JSON.stringify(DEFAULT_GUARDRAILS_CONFIG)),
};

vi.mock("@/stores/settings-store", () => ({
  useSettingsStore: () => mockSettingsStore,
}));

// Import after mocks
import { GuardrailsSection } from "./guardrails-section";

describe("GuardrailsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettingsStore.guardrailsConfig = { ...DEFAULT_GUARDRAILS_CONFIG };
    mockSettingsStore.importGuardrailsConfig.mockReturnValue(true);
    mockSettingsStore.exportGuardrailsConfig.mockReturnValue(
      JSON.stringify(DEFAULT_GUARDRAILS_CONFIG)
    );
  });

  describe("rendering", () => {
    it("renders the section heading", () => {
      render(<GuardrailsSection />);
      expect(screen.getByText("Guardrails")).toBeInTheDocument();
    });

    it("renders the master toggle", () => {
      render(<GuardrailsSection />);
      expect(screen.getByText("Enable Guardrails")).toBeInTheDocument();
    });

    it("shows enabled description when guardrails are on", () => {
      render(<GuardrailsSection />);
      expect(
        screen.getByText("Tool execution is protected by guardrails")
      ).toBeInTheDocument();
    });

    it("shows disabled description when guardrails are off", () => {
      mockSettingsStore.guardrailsConfig = {
        ...DEFAULT_GUARDRAILS_CONFIG,
        enabled: false,
      };
      render(<GuardrailsSection />);
      expect(
        screen.getByText(
          "Guardrails disabled - all tools execute without restrictions"
        )
      ).toBeInTheDocument();
    });

    it("renders preset buttons", () => {
      render(<GuardrailsSection />);
      // "Normal" appears twice: preset indicator + button
      expect(screen.getAllByText("Normal").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Advanced")).toBeInTheDocument();
      expect(screen.getByText("YOLO")).toBeInTheDocument();
    });

    it("renders import/export/reset buttons", () => {
      render(<GuardrailsSection />);
      expect(screen.getByText("Import")).toBeInTheDocument();
      expect(screen.getByText("Export")).toBeInTheDocument();
      expect(screen.getByText("Reset to Defaults")).toBeInTheDocument();
    });

    it("renders confirmation requirements when enabled", () => {
      render(<GuardrailsSection />);
      expect(screen.getByText("Confirmation Requirements")).toBeInTheDocument();
    });

    it("renders path restrictions when enabled", () => {
      render(<GuardrailsSection />);
      expect(screen.getByText("Path Restrictions")).toBeInTheDocument();
    });

    it("renders domain restrictions when enabled", () => {
      render(<GuardrailsSection />);
      expect(screen.getByText("Domain Restrictions")).toBeInTheDocument();
    });

    it("renders shell command restrictions when enabled", () => {
      render(<GuardrailsSection />);
      expect(screen.getByText("Shell Command Restrictions")).toBeInTheDocument();
    });

    it("renders rate limits when enabled", () => {
      render(<GuardrailsSection />);
      expect(screen.getByText("Rate Limits")).toBeInTheDocument();
    });

    it("hides restriction sections when guardrails are disabled", () => {
      mockSettingsStore.guardrailsConfig = {
        ...DEFAULT_GUARDRAILS_CONFIG,
        enabled: false,
      };
      render(<GuardrailsSection />);
      expect(screen.queryByText("Confirmation Requirements")).not.toBeInTheDocument();
      expect(screen.queryByText("Path Restrictions")).not.toBeInTheDocument();
      expect(screen.queryByText("Domain Restrictions")).not.toBeInTheDocument();
      expect(screen.queryByText("Shell Command Restrictions")).not.toBeInTheDocument();
      expect(screen.queryByText("Rate Limits")).not.toBeInTheDocument();
    });
  });

  describe("master toggle", () => {
    it("calls setGuardrailsConfig when toggling enabled", async () => {
      const user = userEvent.setup();
      render(<GuardrailsSection />);

      const checkbox = screen.getByRole("checkbox", { name: /enable guardrails/i });
      await user.click(checkbox);

      expect(mockSettingsStore.setGuardrailsConfig).toHaveBeenCalledWith({
        enabled: false,
      });
    });
  });

  describe("presets", () => {
    it("calls applyGuardrailsPreset when clicking Normal", async () => {
      const user = userEvent.setup();
      render(<GuardrailsSection />);
      // "Normal" appears in both preset indicator and button; click the button (inside Quick Presets)
      const normalButtons = screen.getAllByText("Normal");
      // The button is the one inside a <button> element with the preset click handler
      const normalBtn = normalButtons.find((el) => el.closest("button[data-slot='button']"));
      expect(normalBtn).toBeDefined();
      await user.click(normalBtn!);
      expect(mockSettingsStore.applyGuardrailsPreset).toHaveBeenCalledWith("normal");
    });

    it("calls applyGuardrailsPreset when clicking Advanced", async () => {
      const user = userEvent.setup();
      render(<GuardrailsSection />);
      await user.click(screen.getByText("Advanced"));
      expect(mockSettingsStore.applyGuardrailsPreset).toHaveBeenCalledWith("advanced");
    });

    it("calls applyGuardrailsPreset when clicking YOLO", async () => {
      const user = userEvent.setup();
      render(<GuardrailsSection />);
      await user.click(screen.getByText("YOLO"));
      expect(mockSettingsStore.applyGuardrailsPreset).toHaveBeenCalledWith("yolo");
    });

    it("shows current preset indicator for Normal", () => {
      render(<GuardrailsSection />);
      // Default config detects as "normal" - appears in both indicator and button
      expect(screen.getAllByText("Normal")).toHaveLength(2);
    });
  });

  describe("category sections", () => {
    it("renders all tool categories", () => {
      render(<GuardrailsSection />);
      expect(screen.getByText("File System")).toBeInTheDocument();
      expect(screen.getByText("Web")).toBeInTheDocument();
      expect(screen.getByText("System")).toBeInTheDocument();
      expect(screen.getByText("Integration")).toBeInTheDocument();
      expect(screen.getByText("Memory")).toBeInTheDocument();
      expect(screen.getByText("Custom")).toBeInTheDocument();
    });

    it("expands a category section when clicking it", async () => {
      const user = userEvent.setup();
      render(<GuardrailsSection />);

      const webButton = screen.getByText("Web").closest("button")!;
      await user.click(webButton);

      const riskLabels = screen.getAllByText("Low Risk");
      expect(riskLabels.length).toBeGreaterThanOrEqual(1);
    });

    it("file_system section is expanded by default", () => {
      render(<GuardrailsSection />);
      expect(screen.getByText("Low Risk")).toBeInTheDocument();
      expect(screen.getByText("Medium Risk")).toBeInTheDocument();
      expect(screen.getByText("High Risk")).toBeInTheDocument();
      expect(screen.getByText("Critical Risk")).toBeInTheDocument();
    });

    it("toggles a risk level checkbox", async () => {
      const user = userEvent.setup();
      render(<GuardrailsSection />);

      const lowRiskCheckbox = screen
        .getByText("Low Risk")
        .closest("label")!
        .querySelector('input[type="checkbox"]')!;
      await user.click(lowRiskCheckbox);

      expect(mockSettingsStore.setGuardrailsConfig).toHaveBeenCalledWith({
        categoryConfirmation: {
          ...DEFAULT_GUARDRAILS_CONFIG.categoryConfirmation,
          file_system: {
            ...DEFAULT_GUARDRAILS_CONFIG.categoryConfirmation.file_system,
            low: true,
          },
        },
      });
    });
  });

  describe("restrictions lists", () => {
    it("renders 'Allowed Paths' with item count", () => {
      render(<GuardrailsSection />);
      expect(screen.getByText("Allowed Paths")).toBeInTheDocument();
      expect(screen.getByText("(0 items)")).toBeInTheDocument();
    });

    it("renders 'Blocked Paths' with item count from defaults", () => {
      render(<GuardrailsSection />);
      expect(screen.getByText("Blocked Paths")).toBeInTheDocument();
      expect(
        screen.getByText(`(${DEFAULT_GUARDRAILS_CONFIG.paths.blocklist.length} items)`)
      ).toBeInTheDocument();
    });

    it("expands Allowed Paths section and shows input", async () => {
      const user = userEvent.setup();
      render(<GuardrailsSection />);

      const allowedPathsBtn = screen.getByText("Allowed Paths").closest("button")!;
      await user.click(allowedPathsBtn);

      expect(screen.getByPlaceholderText("~/Projects/*, ~/Documents/*")).toBeInTheDocument();
    });

    it("adds a new item to a restrictions list", async () => {
      const user = userEvent.setup();
      render(<GuardrailsSection />);

      const allowedPathsBtn = screen.getByText("Allowed Paths").closest("button")!;
      await user.click(allowedPathsBtn);

      const input = screen.getByPlaceholderText("~/Projects/*, ~/Documents/*");
      await user.type(input, "~/myproject/*");

      const addButtons = screen.getAllByRole("button");
      const addButton = addButtons.find((btn) =>
        btn.querySelector('[data-testid="icon-Plus"]')
      );
      expect(addButton).toBeDefined();
      await user.click(addButton!);

      expect(mockSettingsStore.setGuardrailsConfig).toHaveBeenCalledWith({
        paths: {
          ...DEFAULT_GUARDRAILS_CONFIG.paths,
          allowlist: ["~/myproject/*"],
        },
      });
    });

    it("adds a new item by pressing Enter", async () => {
      const user = userEvent.setup();
      render(<GuardrailsSection />);

      const allowedPathsBtn = screen.getByText("Allowed Paths").closest("button")!;
      await user.click(allowedPathsBtn);

      const input = screen.getByPlaceholderText("~/Projects/*, ~/Documents/*");
      await user.type(input, "~/test/*{Enter}");

      expect(mockSettingsStore.setGuardrailsConfig).toHaveBeenCalledWith({
        paths: {
          ...DEFAULT_GUARDRAILS_CONFIG.paths,
          allowlist: ["~/test/*"],
        },
      });
    });

    it("shows existing items in Blocked Paths when expanded", async () => {
      const user = userEvent.setup();
      render(<GuardrailsSection />);

      const blockedPathsBtn = screen.getByText("Blocked Paths").closest("button")!;
      await user.click(blockedPathsBtn);

      expect(screen.getByText("~/.ssh/*")).toBeInTheDocument();
      expect(screen.getByText("~/.aws/*")).toBeInTheDocument();
    });

    it("removes an item from a restrictions list", async () => {
      const user = userEvent.setup();
      render(<GuardrailsSection />);

      const blockedPathsBtn = screen.getByText("Blocked Paths").closest("button")!;
      await user.click(blockedPathsBtn);

      const sshItem = screen.getByText("~/.ssh/*");
      const removeButton = sshItem.closest("div")!.querySelector("button")!;
      await user.click(removeButton);

      expect(mockSettingsStore.setGuardrailsConfig).toHaveBeenCalledWith({
        paths: {
          ...DEFAULT_GUARDRAILS_CONFIG.paths,
          blocklist: DEFAULT_GUARDRAILS_CONFIG.paths.blocklist.filter(
            (p) => p !== "~/.ssh/*"
          ),
        },
      });
    });
  });

  describe("rate limits", () => {
    it("renders rate limit inputs", () => {
      render(<GuardrailsSection />);
      expect(screen.getByText("Tools/min")).toBeInTheDocument();
      expect(screen.getByText("Tools/hour")).toBeInTheDocument();
      expect(screen.getByText("API calls/min")).toBeInTheDocument();
      expect(screen.getByText("Shell/min")).toBeInTheDocument();
    });

    it("shows default rate limit values", () => {
      render(<GuardrailsSection />);
      const inputs = screen.getAllByRole("spinbutton");
      const values = inputs.map((i) => (i as HTMLInputElement).value);
      expect(values).toContain("30");
      expect(values).toContain("500");
      expect(values).toContain("10");
      expect(values).toContain("5");
    });
  });

  describe("import/export/reset", () => {
    it("calls resetGuardrailsToDefaults when clicking Reset", async () => {
      const user = userEvent.setup();
      render(<GuardrailsSection />);
      await user.click(screen.getByText("Reset to Defaults"));
      expect(mockSettingsStore.resetGuardrailsToDefaults).toHaveBeenCalledTimes(1);
    });

    it("calls exportGuardrailsConfig when clicking Export", async () => {
      const user = userEvent.setup();
      const mockCreateObjectURL = vi.fn(() => "blob:test");
      const mockRevokeObjectURL = vi.fn();
      global.URL.createObjectURL = mockCreateObjectURL;
      global.URL.revokeObjectURL = mockRevokeObjectURL;

      render(<GuardrailsSection />);
      await user.click(screen.getByText("Export"));

      expect(mockSettingsStore.exportGuardrailsConfig).toHaveBeenCalledTimes(1);
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalled();
    });

    it("has a hidden file input for import", () => {
      render(<GuardrailsSection />);
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).toBeTruthy();
      expect(fileInput.accept).toBe(".json");
      expect(fileInput.className).toContain("hidden");
    });
  });

  describe("shell command restrictions", () => {
    it("shows Allowed Commands and Blocked Commands sections", () => {
      render(<GuardrailsSection />);
      expect(screen.getByText("Allowed Commands")).toBeInTheDocument();
      expect(screen.getByText("Blocked Commands")).toBeInTheDocument();
    });

    it("shows correct item count for default allowed commands", () => {
      render(<GuardrailsSection />);
      const allowedCount = DEFAULT_GUARDRAILS_CONFIG.shellCommands.allowlist.length;
      expect(screen.getByText(`(${allowedCount} items)`)).toBeInTheDocument();
    });
  });

  describe("domain restrictions", () => {
    it("shows Blocked Domains section", () => {
      render(<GuardrailsSection />);
      expect(screen.getByText("Blocked Domains")).toBeInTheDocument();
    });

    it("shows correct item count for default blocked domains", () => {
      render(<GuardrailsSection />);
      const blockedCount = DEFAULT_GUARDRAILS_CONFIG.domains.blocklist.length;
      const countTexts = screen.getAllByText(`(${blockedCount} items)`);
      expect(countTexts.length).toBeGreaterThanOrEqual(1);
    });
  });
});
