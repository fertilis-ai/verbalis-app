import { describe, it, expect, beforeEach } from "vitest";
import {
  makeConversation,
  makeMessage,
  mockGetActiveModels,
  mockGetModel,
  mockSettingsGetState,
  mockStreamSimple,
  resetChatStore,
} from "@/test/chat-store-harness";
import { useChatStore } from "./chat-store";

// chat-store tests for sendMessage, auto-rename, ZDR routing and reasoning
// effort. Mocks and fixtures are in test/chat-store-harness.ts.

describe("chat-store", () => {
  beforeEach(() => {
    resetChatStore();
  });

  // -----------------------------------------------------------------------
  // sendMessage
  // -----------------------------------------------------------------------
  describe("sendMessage", () => {
    it("creates a new conversation if none exists", async () => {
      // streamSimple will be called since we're not in Tauri mode
      // Make it return an empty async iterable
      mockGetActiveModels.mockReturnValue([
        { id: "claude-sonnet-4-20250514", name: "Sonnet", provider: "anthropic" },
      ]);
      mockGetModel.mockReturnValue({
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet",
        api: "anthropic",
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
      });
      mockSettingsGetState.mockReturnValue({
        apiKeys: { anthropic: "sk-test" },
        localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
        guardrailsConfig: {},
        selectedModels: [],
        defaultModel: "claude-sonnet-4-20250514",
      });
      mockStreamSimple.mockReturnValue(
        (async function* () {
          yield { type: "text_delta", delta: "Hello!" };
        })(),
      );

      useChatStore.setState({ currentConversationId: null, conversations: [] });
      await useChatStore.getState().sendMessage("Hi there");

      const state = useChatStore.getState();
      // A conversation was created
      expect(state.conversations.length).toBeGreaterThanOrEqual(1);
      expect(state.isStreaming).toBe(false);
    });

    it("creates ghost conversation when in ghost mode without existing ghost", async () => {
      mockGetActiveModels.mockReturnValue([
        { id: "claude-sonnet-4-20250514", name: "Sonnet", provider: "anthropic" },
      ]);
      mockGetModel.mockReturnValue({
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet",
        api: "anthropic",
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
      });
      mockSettingsGetState.mockReturnValue({
        apiKeys: { anthropic: "sk-test" },
        localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
        guardrailsConfig: {},
        selectedModels: [],
        defaultModel: "claude-sonnet-4-20250514",
      });
      mockStreamSimple.mockReturnValue(
        (async function* () {
          yield { type: "text_delta", delta: "Ghost reply" };
        })(),
      );

      useChatStore.setState({
        isGhostMode: true,
        ghostConversation: null,
        currentConversationId: null,
      });
      await useChatStore.getState().sendMessage("Ghost message");

      const state = useChatStore.getState();
      expect(state.ghostConversation).not.toBeNull();
      expect(state.ghostConversation?.title).toBe("Incognito Session");
    });

    it("sets isStreaming to true during execution and false after", async () => {
      mockGetActiveModels.mockReturnValue([
        { id: "claude-sonnet-4-20250514", name: "Sonnet", provider: "anthropic" },
      ]);
      mockGetModel.mockReturnValue({
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet",
        api: "anthropic",
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
      });
      mockSettingsGetState.mockReturnValue({
        apiKeys: { anthropic: "sk-test" },
        localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
        guardrailsConfig: {},
        selectedModels: [],
        defaultModel: "claude-sonnet-4-20250514",
      });

      let streamingDuringExec = false;
      mockStreamSimple.mockReturnValue(
        (async function* () {
          streamingDuringExec = useChatStore.getState().isStreaming;
          yield { type: "text_delta", delta: "Hi" };
        })(),
      );

      const conv = makeConversation({ id: "c1", path: "/mock-data/chats/c1.json" });
      useChatStore.setState({
        conversations: [conv],
        currentConversationId: "c1",
      });
      await useChatStore.getState().sendMessage("Hello");

      expect(streamingDuringExec).toBe(true);
      expect(useChatStore.getState().isStreaming).toBe(false);
    });

    it("handles stream error gracefully", async () => {
      mockGetActiveModels.mockReturnValue([
        { id: "claude-sonnet-4-20250514", name: "Sonnet", provider: "anthropic" },
      ]);
      mockGetModel.mockReturnValue({
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet",
        api: "anthropic",
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
      });
      mockSettingsGetState.mockReturnValue({
        apiKeys: { anthropic: "sk-test" },
        localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
        guardrailsConfig: {},
        selectedModels: [],
        defaultModel: "claude-sonnet-4-20250514",
      });
      mockStreamSimple.mockReturnValue(
        (async function* () {
          yield { type: "error", error: { errorMessage: "Rate limited" } };
        })(),
      );

      const conv = makeConversation({ id: "c1", path: "/mock-data/chats/c1.json" });
      useChatStore.setState({
        conversations: [conv],
        currentConversationId: "c1",
      });

      await useChatStore.getState().sendMessage("Hello");
      const state = useChatStore.getState();
      expect(state.isStreaming).toBe(false);
      // The error message should be in the assistant's content
      const lastMsg = state.conversations[0]!.messages[state.conversations[0]!.messages.length - 1];
      expect(lastMsg!.content).toContain("Rate limited");
    });

    it("shows error when model not found and no API key", async () => {
      mockGetActiveModels.mockReturnValue([]);
      mockGetModel.mockReturnValue(null);
      mockSettingsGetState.mockReturnValue({
        apiKeys: {},
        localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
        guardrailsConfig: {},
        selectedModels: [],
        defaultModel: "claude-sonnet-4-20250514",
      });

      const conv = makeConversation({ id: "c1" });
      useChatStore.setState({
        conversations: [conv],
        currentConversationId: "c1",
        model: "claude-sonnet-4-20250514",
      });
      await useChatStore.getState().sendMessage("Hello");

      const state = useChatStore.getState();
      const lastMsg = state.conversations[0]!.messages[state.conversations[0]!.messages.length - 1];
      expect(lastMsg!.role).toBe("assistant");
      expect(lastMsg!.content).toContain("Unknown model");
    });

    it("shows error when local LLM is disabled", async () => {
      mockSettingsGetState.mockReturnValue({
        apiKeys: {},
        localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
        guardrailsConfig: {},
        selectedModels: [],
        defaultModel: "claude-sonnet-4-20250514",
      });

      const conv = makeConversation({ id: "c1" });
      useChatStore.setState({
        conversations: [conv],
        currentConversationId: "c1",
        model: "local",
      });
      await useChatStore.getState().sendMessage("Hello");

      const state = useChatStore.getState();
      const lastMsg = state.conversations[0]!.messages[state.conversations[0]!.messages.length - 1];
      expect(lastMsg!.content).toContain("Local LLM is disabled");
    });
  });


  // -----------------------------------------------------------------------
  // sendMessageToConversation
  // -----------------------------------------------------------------------
  describe("sendMessageToConversation", () => {
    it("sends to a specific conversation without setting streaming by default", async () => {
      mockGetActiveModels.mockReturnValue([
        { id: "claude-sonnet-4-20250514", name: "Sonnet", provider: "anthropic" },
      ]);
      mockGetModel.mockReturnValue({
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet",
        api: "anthropic",
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
      });
      mockSettingsGetState.mockReturnValue({
        apiKeys: { anthropic: "sk-test" },
        localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
        guardrailsConfig: {},
        selectedModels: [],
        defaultModel: "claude-sonnet-4-20250514",
      });
      mockStreamSimple.mockReturnValue(
        (async function* () {
          yield { type: "text_delta", delta: "Reply" };
        })(),
      );

      const conv = makeConversation({ id: "c1" });
      useChatStore.setState({ conversations: [conv], currentConversationId: "c1" });

      await useChatStore.getState().sendMessageToConversation("c1", "Hello");
      const state = useChatStore.getState();
      // Messages should exist
      expect(state.conversations[0]!.messages.length).toBeGreaterThanOrEqual(2); // user + assistant
    });

    it("does nothing if conversation not found", async () => {
      useChatStore.setState({ conversations: [], currentConversationId: null });

      await useChatStore.getState().sendMessageToConversation("nonexistent", "Hello");
      // No crash, no state change
      expect(useChatStore.getState().conversations).toHaveLength(0);
    });
  });


  // -----------------------------------------------------------------------
  // Auto-rename behavior via sendMessage
  // -----------------------------------------------------------------------
  describe("auto-rename on first message", () => {
    beforeEach(() => {
      mockGetActiveModels.mockReturnValue([
        { id: "claude-sonnet-4-20250514", name: "Sonnet", provider: "anthropic" },
      ]);
      mockGetModel.mockReturnValue({
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet",
        api: "anthropic",
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
      });
      mockSettingsGetState.mockReturnValue({
        apiKeys: { anthropic: "sk-test" },
        localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
        guardrailsConfig: {},
        selectedModels: [],
        defaultModel: "claude-sonnet-4-20250514",
      });
      mockStreamSimple.mockReturnValue(
        (async function* () {
          yield { type: "text_delta", delta: "Response" };
        })(),
      );
    });

    it("renames 'New Chat' to the first user message content", async () => {
      const conv = makeConversation({ id: "c1", title: "New Chat", messages: [] });
      useChatStore.setState({
        conversations: [conv],
        currentConversationId: "c1",
      });

      await useChatStore.getState().sendMessage("What is TypeScript?");

      const updated = useChatStore.getState().conversations.find((c) => c.id === "c1");
      expect(updated?.title).toBe("What is TypeScript?");
    });

    it("does not rename when conversation already has custom title", async () => {
      const conv = makeConversation({ id: "c1", title: "My Custom Chat", messages: [] });
      useChatStore.setState({
        conversations: [conv],
        currentConversationId: "c1",
      });

      await useChatStore.getState().sendMessage("Hello");

      const updated = useChatStore.getState().conversations.find((c) => c.id === "c1");
      expect(updated?.title).toBe("My Custom Chat");
    });

    it("does not rename when it is not the first message", async () => {
      const conv = makeConversation({
        id: "c1",
        title: "New Chat",
        messages: [makeMessage({ content: "Previous" })],
      });
      useChatStore.setState({
        conversations: [conv],
        currentConversationId: "c1",
      });

      await useChatStore.getState().sendMessage("Hello again");

      // Title stays "New Chat" because there's already a message
      const updated = useChatStore.getState().conversations.find((c) => c.id === "c1");
      expect(updated?.title).toBe("New Chat");
    });

    it("truncates title to 50 characters", async () => {
      const longMsg = "A".repeat(100);
      const conv = makeConversation({ id: "c1", title: "New Chat", messages: [] });
      useChatStore.setState({
        conversations: [conv],
        currentConversationId: "c1",
      });

      await useChatStore.getState().sendMessage(longMsg);

      const updated = useChatStore.getState().conversations.find((c) => c.id === "c1");
      expect(updated?.title?.length).toBeLessThanOrEqual(50);
    });
  });


  // -----------------------------------------------------------------------
  // Zero data retention routing
  // -----------------------------------------------------------------------
  //
  // The Settings checkbox must do more than filter the picker: every OpenRouter
  // chat request has to carry `provider: { zdr: true }` (pi-ai copies
  // `compat.openRouterRouting` into the payload), or OpenRouter is free to route
  // to an endpoint that retains data.
  describe("zero data retention routing", () => {
    const ZDR_MODEL = { id: "x-ai/grok-4.5", name: "Grok 4.5", provider: "openrouter", zdr: true };
    const sentModel = () => mockStreamSimple.mock.calls.at(-1)?.[0];

    const registryModel = {
      id: ZDR_MODEL.id,
      name: "Grok 4.5",
      api: "openai-completions",
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000,
      maxTokens: 8192,
    };

    function setup(openRouterZdrOnly: boolean) {
      mockGetActiveModels.mockReturnValue([ZDR_MODEL]);
      mockSettingsGetState.mockReturnValue({
        apiKeys: { openrouter: "sk-or-test" },
        localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
        guardrailsConfig: {},
        selectedModels: [ZDR_MODEL],
        defaultModel: ZDR_MODEL.id,
        openRouterZdrOnly,
      });
      mockStreamSimple.mockReturnValue(
        (async function* () {
          yield { type: "text_delta", delta: "Hi" };
        })(),
      );
      useChatStore.setState({
        conversations: [makeConversation({ id: "c1" })],
        currentConversationId: "c1",
        model: ZDR_MODEL.id,
      });
    }

    it.each([
      ["a registry-known model", registryModel],
      ["a model the registry does not know", undefined],
    ])("routes %s to ZDR endpoints when the checkbox is on", async (_label, registry) => {
      setup(true);
      mockGetModel.mockReturnValue(registry);

      await useChatStore.getState().sendMessage("Hello");

      expect(sentModel()?.compat?.openRouterRouting).toEqual({ zdr: true });
    });

    it.each([
      ["a registry-known model", registryModel],
      ["a model the registry does not know", undefined],
    ])("adds no routing to %s when the checkbox is off", async (_label, registry) => {
      setup(false);
      mockGetModel.mockReturnValue(registry);

      await useChatStore.getState().sendMessage("Hello");

      expect(sentModel()?.compat?.openRouterRouting).toBeUndefined();
    });
  });


  // -----------------------------------------------------------------------
  // Reasoning effort on the outgoing request
  // -----------------------------------------------------------------------
  //
  // Regression guard for a silent-drop failure mode: pi-ai's OpenRouter branch
  // is gated on `model.reasoning`, so a model reaching streamSimple without it
  // loses the effort no matter what the picker showed.
  describe("reasoning effort", () => {
    const OPENROUTER_MODEL = {
      id: "x-ai/grok-4.5",
      name: "Grok 4.5",
      provider: "openrouter",
      reasoning: {
        mandatory: true,
        supported_efforts: ["high", "medium", "low"],
        default_effort: "high",
      },
    };

    /** The model object handed to streamSimple for the last sendMessage. */
    const sentModel = () => mockStreamSimple.mock.calls.at(-1)?.[0];
    /** The options object handed to streamSimple for the last sendMessage. */
    const sentOptions = () => mockStreamSimple.mock.calls.at(-1)?.[2];

    function setup(overrides: Record<string, unknown> = {}) {
      mockGetActiveModels.mockReturnValue([OPENROUTER_MODEL]);
      mockSettingsGetState.mockReturnValue({
        apiKeys: { openrouter: "sk-or-test" },
        localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
        guardrailsConfig: {},
        selectedModels: [OPENROUTER_MODEL],
        defaultModel: OPENROUTER_MODEL.id,
        ...overrides,
      });
      mockStreamSimple.mockReturnValue(
        (async function* () {
          yield { type: "text_delta", delta: "Hi" };
        })(),
      );
      useChatStore.setState({
        conversations: [makeConversation({ id: "c1" })],
        currentConversationId: "c1",
        model: OPENROUTER_MODEL.id,
      });
    }

    it("stamps the capability onto a model the registry already knows", async () => {
      setup();
      mockGetModel.mockReturnValue({
        id: OPENROUTER_MODEL.id,
        name: "Grok 4.5",
        api: "openai-completions",
        provider: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
      });

      await useChatStore.getState().sendMessage("Hello");

      // The registry says reasoning: false; OpenRouter's metadata overrides it.
      expect(sentModel()?.reasoning).toBe(true);
      expect(sentModel()?.thinkingLevelMap).toMatchObject({ high: "high", off: null });
    });

    it("stamps the capability onto a model the registry does not know", async () => {
      setup();
      mockGetModel.mockReturnValue(undefined);

      await useChatStore.getState().sendMessage("Hello");

      expect(sentModel()?.reasoning).toBe(true);
      expect(sentModel()?.thinkingLevelMap).toMatchObject({ high: "high", off: null });
    });

    it("forwards the stored effort for the model being used", async () => {
      setup({ modelEffort: { [OPENROUTER_MODEL.id]: "low" } });
      mockGetModel.mockReturnValue(undefined);

      await useChatStore.getState().sendMessage("Hello");

      expect(sentOptions()?.reasoning).toBe("low");
    });

    it("falls back to OpenRouter's own default when nothing is stored", async () => {
      setup();
      mockGetModel.mockReturnValue(undefined);

      await useChatStore.getState().sendMessage("Hello");

      expect(sentOptions()?.reasoning).toBe("high");
    });

    // OpenRouter's metadata is the only source of truth. pi-ai's registry carries
    // `reasoning: true` for 167 OpenRouter ids, and when it leaks through for a
    // model that exposes no discrete levels, pi-ai's OpenRouter branch falls into
    // its `else` and sends `reasoning: { effort: "none" }` — silently disabling
    // reasoning on a model the user was given no picker for.
    it("does not let the registry enable reasoning OpenRouter never advertised", async () => {
      // Verbatim shape of deepseek/deepseek-r1: reasoning, but no discrete levels.
      const noLevels = {
        id: "deepseek/deepseek-r1",
        name: "DeepSeek R1",
        provider: "openrouter",
        reasoning: { mandatory: true, default_enabled: true },
      };
      mockGetActiveModels.mockReturnValue([noLevels]);
      mockSettingsGetState.mockReturnValue({
        apiKeys: { openrouter: "sk-or-test" },
        localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
        guardrailsConfig: {},
        selectedModels: [noLevels],
        defaultModel: noLevels.id,
      });
      // The registry's stale, coarser view of the same model.
      mockGetModel.mockReturnValue({
        id: noLevels.id,
        name: "DeepSeek R1",
        api: "openai-completions",
        provider: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        reasoning: true,
        thinkingLevelMap: { xhigh: "max" },
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
      });
      mockStreamSimple.mockReturnValue(
        (async function* () {
          yield { type: "text_delta", delta: "Hi" };
        })(),
      );
      useChatStore.setState({
        conversations: [makeConversation({ id: "c1" })],
        currentConversationId: "c1",
        model: noLevels.id,
      });

      await useChatStore.getState().sendMessage("Hello");

      expect(sentOptions()?.reasoning).toBeUndefined();
      // Either of these keeps pi-ai from emitting `reasoning: { effort: "none" }`;
      // the registry's own map must not survive.
      expect(sentModel()?.reasoning).toBe(false);
      expect(sentModel()?.thinkingLevelMap).toBeUndefined();
    });

    it("leaves a non-reasoning model untouched and sends no effort", async () => {
      const plain = { id: "gpt-4o", name: "GPT-4o", provider: "openai" };
      mockGetActiveModels.mockReturnValue([plain]);
      mockSettingsGetState.mockReturnValue({
        apiKeys: { openai: "sk-test" },
        localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
        guardrailsConfig: {},
        selectedModels: [plain],
        defaultModel: plain.id,
        modelEffort: { "gpt-4o": "high" },
      });
      mockGetModel.mockReturnValue({
        id: "gpt-4o",
        name: "GPT-4o",
        api: "openai-completions",
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      });
      mockStreamSimple.mockReturnValue(
        (async function* () {
          yield { type: "text_delta", delta: "Hi" };
        })(),
      );
      useChatStore.setState({
        conversations: [makeConversation({ id: "c1" })],
        currentConversationId: "c1",
        model: plain.id,
      });

      await useChatStore.getState().sendMessage("Hello");

      expect(sentModel()?.reasoning).toBe(false);
      // A stale stored effort must not resurrect reasoning on a plain model.
      expect(sentOptions()?.reasoning).toBeUndefined();
    });
  });
});
