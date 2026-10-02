import { vi } from "vitest";

// Shared setup for the chat-store.*.test.ts files: module mocks, mock
// handles, fixtures and the per-test reset. Import it before the store.

// ---------------------------------------------------------------------------
// Hoisted mocks – vi.hoisted runs before vi.mock factories
// ---------------------------------------------------------------------------

const {
  mockGetToolsForContext,
  mockNormalizeToolCallStatus,
  mockStreamSimple,
  mockGetModel,
  mockGetActiveModels,
  mockSettingsGetState,
  mockConfirmTool,
  mockRejectTool,
  mockSetCurrentLoop,
  mockGetAdapter,
  mockCreateAdapter,
  mockUuidState,
  loopBus,
} = vi.hoisted(() => ({
  // Captures chat-store's module-level loop-bus subscriber so tests can publish.
  loopBus: { callback: null as null | ((event: unknown) => void) },
  mockGetToolsForContext: vi.fn().mockReturnValue([]),
  mockNormalizeToolCallStatus: vi.fn((status: string) => {
    switch (status) {
      case "completed":
        return "success";
      case "failed":
        return "error";
      case "awaiting_approval":
        return "pending_confirmation";
      default:
        return status;
    }
  }),
  mockStreamSimple: vi.fn(),
  mockGetModel: vi.fn().mockReturnValue(null),
  mockGetActiveModels: vi.fn().mockReturnValue([]),
  mockSettingsGetState: vi.fn((): Record<string, unknown> => ({
    apiKeys: { anthropic: "", openai: "", google: "", openrouter: "" },
    localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
    guardrailsConfig: {},
    selectedModels: [],
    defaultModel: "claude-sonnet-4-20250514",
    imageModel: "",
    setSelectedAgentId: vi.fn(),
  })),
  mockConfirmTool: vi.fn(),
  mockRejectTool: vi.fn(),
  mockSetCurrentLoop: vi.fn(),
  mockGetAdapter: vi.fn().mockReturnValue(null),
  mockCreateAdapter: vi.fn(),
  mockUuidState: { counter: 0 },
}));

// ---------------------------------------------------------------------------
// Mocks – must come before importing the store
// ---------------------------------------------------------------------------

vi.mock("uuid", () => ({
  v4: vi.fn(() => {
    mockUuidState.counter += 1;
    return `mock-uuid-${mockUuidState.counter}`;
  }),
}));

vi.mock("@tauri-apps/api/core", () => import("@/test/mocks/tauri"));

vi.mock("@/lib/storage", () => import("@/test/mocks/storage"));

vi.mock("@/lib/logger", () => ({
  logAgent: vi.fn(),
}));

vi.mock("@/lib/tools", () => ({
  getToolsForContext: mockGetToolsForContext,
  normalizeToolCallStatus: mockNormalizeToolCallStatus,
}));

vi.mock("@/lib/protocol-parser", () => ({
  stripProtocolMarkers: vi.fn((s: string) => s),
}));

vi.mock("@/lib/message-conversion", () => ({
  messagesToPiMessages: vi.fn().mockReturnValue([]),
}));

vi.mock("@earendil-works/pi-ai", () => ({
  streamSimple: mockStreamSimple,
  getModel: mockGetModel,
  // Used by lib/reasoning to gate reasoning effort. The mocked model objects
  // here have no `reasoning` flag, so effort resolves to "off" throughout.
  getSupportedThinkingLevels: (model: { reasoning?: boolean }) =>
    model?.reasoning ? ["off", "low", "medium", "high"] : ["off"],
  clampThinkingLevel: (_model: unknown, level: string) => level,
  // Needed by web-tools param schemas (pulled in via toolbox-schemas → categories).
  StringEnum: (values: readonly string[], options?: Record<string, unknown>) => ({
    ...options,
    type: "string",
    enum: [...values],
  }),
}));

vi.mock("@/lib/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http")>()),
  appFetch: vi.fn(),
}));

vi.mock("@/lib/models", () => ({
  DEFAULT_MODEL_ID: "claude-sonnet-4-20250514",
  getActiveModels: mockGetActiveModels,
  // Only consulted when pi-ai's registry misses; openrouter is here so the
  // hand-built fallback model in resolveModelObject can be exercised.
  PROVIDER_API_MAP: { openrouter: "openai-completions" },
  PROVIDER_BASE_URL_MAP: { openrouter: "https://openrouter.ai/api/v1" },
}));

vi.mock("@/stores/settings-store", () => ({
  useSettingsStore: Object.assign(
    vi.fn(() => ({})),
    {
      getState: mockSettingsGetState,
      subscribe: vi.fn(() => vi.fn()),
      setState: vi.fn(),
      getInitialState: vi.fn(),
    },
  ),
}));

vi.mock("@/stores/agent-store", () => ({
  useAgentStore: Object.assign(vi.fn(() => ({})), {
    getState: vi.fn(() => ({ agents: [] })),
  }),
}));

vi.mock("@/stores/agentic-loop-store", () => ({
  useAgenticLoopStore: Object.assign(vi.fn(() => ({})), {
    getState: vi.fn(() => ({
      getAdapter: mockGetAdapter,
      createAdapter: mockCreateAdapter,
      setCurrentLoop: mockSetCurrentLoop,
      confirmTool: mockConfirmTool,
      rejectTool: mockRejectTool,
      stopLoop: vi.fn(),
      releaseAdapter: vi.fn(),
    })),
  }),
  subscribeToLoopEvents: (callback: (event: unknown) => void) => {
    loopBus.callback = callback;
    return () => {};
  },
}));

export {
  mockGetToolsForContext,
  mockNormalizeToolCallStatus,
  mockStreamSimple,
  mockGetModel,
  mockGetActiveModels,
  mockSettingsGetState,
  mockConfirmTool,
  mockRejectTool,
  mockSetCurrentLoop,
  mockGetAdapter,
  mockCreateAdapter,
  mockUuidState,
  loopBus,
};

// Now import the store
import * as storage from "@/test/mocks/storage";
import { useChatStore, type Message, type Conversation } from "@/stores/chat-store";
import type { ChatTreeNode } from "@/lib/storage";

// The shared storage mock, under the names these tests use. Two defaults
// differ from the shared ones: readFile returns "file contents" and
// renameChatFolder resolves to undefined.
export const mockLoadChatTree = vi.mocked(storage.loadChatTree);
export const mockSaveChatToFolder = vi.mocked(storage.saveChatToFolder);
export const mockDeleteChatByPath = vi.mocked(storage.deleteChatByPath);
export const mockDeleteChatFolder = vi.mocked(storage.deleteChatFolder);
export const mockRenameChatFolder = vi.mocked(storage.renameChatFolder);
export const mockCreateChatFolder = vi.mocked(storage.createChatFolder);
export const mockToggleChatFolderPin = vi.mocked(storage.toggleChatFolderPin);
export const mockDeletePath = vi.mocked(storage.deletePath);
export const mockLoadChatByPath = vi.mocked(storage.loadChatByPath);
export const mockReadFile = vi.mocked(storage.readFile);
export const mockRenamePath = vi.mocked(storage.renamePath);
export const mockIsTauri = vi.mocked(storage.isTauri);
export const mockGetAppDataDir = vi.mocked(storage.getAppDataDir);
mockReadFile.mockResolvedValue("file contents");
mockRenameChatFolder.mockResolvedValue(undefined);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    role: "user",
    content: "Hello",
    createdAt: new Date("2025-01-01"),
    ...overrides,
  };
}

export function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conv-1",
    title: "Test Chat",
    messages: [],
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

export function makeChatTreeNode(overrides: Partial<ChatTreeNode> = {}): ChatTreeNode {
  return {
    type: "chat",
    id: "chat-1",
    name: "Chat 1",
    path: "/mock-data/chats/chat-1.json",
    isPinned: false,
    ...overrides,
  };
}

export function makeFolderTreeNode(overrides: Partial<ChatTreeNode> = {}): ChatTreeNode {
  return {
    type: "folder",
    id: "folder-1",
    name: "Folder 1",
    path: "/mock-data/chats/folder-1",
    isPinned: false,
    children: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Per-test reset
// ---------------------------------------------------------------------------

/** Clears mock calls and puts the store back to its initial state. */
export function resetChatStore() {
  vi.clearAllMocks();
  mockUuidState.counter = 0;
  // Reset store state to initial
  useChatStore.setState({
    conversations: [],
    currentConversationId: null,
    chatTree: [],
    expandedFolders: new Set(),
    model: "claude-sonnet-4-20250514",
    agentId: null,
    isStreaming: false,
    contextFiles: [],
    isGhostMode: false,
    ghostConversation: null,
  });
}
