import { create } from "zustand";
import { v4 as uuid } from "uuid";
import {
  streamSimple,
  getModel,
  type Context,
  type Api,
  type Model,
} from "@mariozechner/pi-ai";
import {
  type ToolCallState,
  type ToolCallStatus,
  getToolsForContext,
} from "@/lib/tools";
import { stripProtocolMarkers } from "@/lib/protocol-parser";
import { messagesToPiMessages } from "@/lib/message-conversion";
import { useSettingsStore } from "./settings-store";
import { useAgentStore } from "./agent-store";
import { useAgenticLoopStore, subscribeToToolEvents } from "./agentic-loop-store";
import type { AgentLoopEvent } from "@/lib/agentic/types";
import type { SapioAdapterConfig } from "@/lib/agentic/sapio-agent-adapter";
import { appFetch } from "@/lib/http";
import { DEFAULT_MODEL_ID, MODEL_OPTIONS, type ModelId, type ModelProvider, type ChatModelId } from "@/lib/models";
import {
  loadChatTree,
  loadChatByPath,
  saveChatToFolder,
  deleteChatByPath,
  deleteChatFolder,
  renameChatFolder,
  createChatFolder,
  saveFolderMeta,
  loadFolderMeta,
  deletePath,
  getAppDataDir,
  isTauri,
  type ChatTreeNode,
  type ChatFolderMeta,
  type ChatData,
} from "@/lib/storage";
import { logAgent } from "@/lib/logger";

// Model configurations with provider info
const MODEL_CONFIGS: Record<ModelId, { provider: ModelProvider; id: ModelId }> = Object.fromEntries(
  MODEL_OPTIONS.map((model) => [model.id, { provider: model.provider, id: model.id }])
) as Record<ModelId, { provider: ModelProvider; id: ModelId }>;

type LocalProvider = "lmstudio" | "ollama";

function normalizeBaseUrl(input: string): string {
  return input.trim().replace(/\/+$/, "");
}

function buildOpenAiBaseUrl(baseUrl: string): string {
  const trimmed = normalizeBaseUrl(baseUrl);
  if (trimmed.endsWith("/v1")) {
    return trimmed;
  }
  if (trimmed.includes("/v1/")) {
    const idx = trimmed.indexOf("/v1/");
    return trimmed.slice(0, idx + 3);
  }
  return `${trimmed}/v1`;
}

function buildOpenAiUrl(baseUrl: string, path: string): string {
  return `${buildOpenAiBaseUrl(baseUrl)}${path}`;
}

function buildContextFromConversation(params: {
  conversation: Conversation;
  systemPrompt?: string;
  api: Api;
  provider: string;
  model: string;
  includeTools?: boolean;
}): Context {
  const { conversation, systemPrompt, api, provider, model, includeTools } = params;
  return {
    systemPrompt,
    messages: messagesToPiMessages(conversation.messages, api, provider, model),
    tools: includeTools ? getToolsForContext() : undefined,
  };
}

async function resolveLocalModel(provider: LocalProvider, baseUrl: string, fallback?: string) {
  if (fallback?.trim()) return fallback.trim();
  try {
    const url = buildOpenAiUrl(baseUrl, "/models");
    const response = await appFetch(url);
    if (response.ok) {
      const data = (await response.json()) as { data?: Array<{ id?: string }> };
      const modelId = data?.data?.[0]?.id ?? null;
      if (modelId) return modelId;
    }
    if (provider === "ollama") {
      const ollamaUrl = `${normalizeBaseUrl(baseUrl)}/api/tags`;
      const ollamaResponse = await appFetch(ollamaUrl);
      if (!ollamaResponse.ok) return null;
      const data = (await ollamaResponse.json()) as { models?: Array<{ name?: string }> };
      return data?.models?.[0]?.name ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

function buildLocalModel(params: { provider: LocalProvider; baseUrl: string; model: string }): Model<"openai-completions"> {
  const baseUrl = buildOpenAiBaseUrl(params.baseUrl);
  return {
    id: params.model,
    name: params.model,
    api: "openai-completions",
    provider: params.provider,
    baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 32000,
  };
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallState[];
  createdAt: Date;
}

export type { ToolCallState, ToolCallStatus };

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  // File system location
  path?: string;
  folderId?: string;
  // Background conversations are hidden from the chat sidebar (e.g. scheduler runs)
  background?: boolean;
}

interface ChatState {
  // Conversations (in-memory + synced to disk)
  conversations: Conversation[];
  currentConversationId: string | null;

  // Derived getter for current conversation
  getCurrentConversation: () => Conversation | null;

  // Folder tree from disk
  chatTree: ChatTreeNode[];
  expandedFolders: Set<string>;

  // Model/agent selection
  model: string;
  agentId: string | null;
  isStreaming: boolean;

  // Ghost mode (incognito)
  isGhostMode: boolean;
  ghostConversation: Conversation | null;

  // Actions - basic conversation
  createConversation: (folderId?: string) => Promise<void>;
  createConversationInBackground: (options?: { folderId?: string; title?: string }) => Promise<Conversation>;
  selectConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  setModel: (model: string) => void;
  setAgentId: (agentId: string | null) => void;
  sendMessage: (content: string) => Promise<void>;
  sendMessageToConversation: (
    conversationId: string,
    content: string,
    options?: { agentId?: string | null; model?: ModelId; allowAutoRename?: boolean; setStreaming?: boolean }
  ) => Promise<void>;

  // Actions - folder management
  loadChatsFromDisk: () => Promise<void>;
  createFolder: (name: string, parentFolderId?: string) => Promise<void>;
  renameFolder: (folderId: string, newName: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  toggleFolderExpansion: (folderId: string) => void;
  toggleFolderPin: (folderId: string) => Promise<void>;

  // Actions - chat management
  renameChat: (chatId: string, newTitle: string) => Promise<void>;

  // Actions - ghost mode
  startGhostSession: () => void;
  exitGhostSession: () => void;

  // Actions - tool execution
  confirmToolExecution: (toolCallId: string) => Promise<void>;
  rejectToolExecution: (toolCallId: string) => void;

  // Actions - tool state management
  markToolCallsStopped: (conversationId: string) => void;
}

// Helper to find a node in the tree
function findNodeInTree(tree: ChatTreeNode[], id: string): ChatTreeNode | null {
  for (const node of tree) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNodeInTree(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function getUniqueFolderName(baseName: string, existingNames: string[]): string {
  if (!existingNames.includes(baseName)) return baseName;
  let counter = 2;
  let candidate = `${baseName} ${counter}`;
  while (existingNames.includes(candidate)) {
    counter += 1;
    candidate = `${baseName} ${counter}`;
  }
  return candidate;
}

function getSiblingFolderNames(tree: ChatTreeNode[], parentFolderId?: string): string[] {
  if (!parentFolderId) {
    return tree
      .filter((node) => node.type === "folder")
      .map((node) => node.name);
  }

  const parent = findNodeInTree(tree, parentFolderId);
  if (parent?.type === "folder" && parent.children) {
    return parent.children
      .filter((node) => node.type === "folder")
      .map((node) => node.name);
  }

  return [];
}

function deriveConversationTitle(content: string, maxLength = 50): string | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

/** Update the last assistant message in a messages array with the given partial updates. */
function updateLastAssistantMessage(messages: Message[], updates: Partial<Message>): Message[] {
  const result = [...messages];
  const lastIdx = result.length - 1;
  if (lastIdx >= 0 && result[lastIdx].role === "assistant") {
    result[lastIdx] = { ...result[lastIdx], ...updates };
  }
  return result;
}

/** Serialize a Conversation's messages to ChatData message format for disk persistence. */
function serializeMessages(messages: Message[]): ChatData["messages"] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    ...(m.toolCalls?.length ? {
      toolCalls: m.toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
        status: tc.status,
        result: tc.result,
        error: tc.error,
        durationMs: tc.durationMs,
      })),
    } : {}),
  }));
}

/** Build a ChatData object from a Conversation for disk persistence. */
function conversationToChatData(conv: Conversation, model: string, agentId: string | null): ChatData {
  return {
    id: conv.id,
    title: conv.title,
    model,
    agentId,
    messages: serializeMessages(conv.messages),
    createdAt: conv.createdAt.toISOString(),
    updatedAt: conv.updatedAt.toISOString(),
  };
}

export const useChatStore = create<ChatState>((set, get) => {
  const createConversationInternal = async (options: {
    folderId?: string;
    title?: string;
    select?: boolean;
    background?: boolean;
  }): Promise<Conversation> => {
    const id = uuid();
    const dir = await getAppDataDir();

    let folderPath: string | undefined;
    if (options.folderId) {
      const folder = findNodeInTree(get().chatTree, options.folderId);
      if (folder && folder.type === "folder") {
        folderPath = folder.path;
      }
    }

    const now = new Date();
    const title = options.title?.trim() || "New Chat";
    const path = folderPath ? `${folderPath}/${id}.json` : `${dir}/chats/${id}.json`;
    const newConversation: Conversation = {
      id,
      title,
      messages: [],
      createdAt: now,
      updatedAt: now,
      path,
      folderId: options.folderId,
      background: options.background,
    };

    set((state) => ({
      conversations: options.select ? [newConversation, ...state.conversations] : [...state.conversations, newConversation],
      currentConversationId: options.select ? id : state.currentConversationId,
    }));

    // Skip disk save for background conversations (e.g. scheduler runs)
    if (isTauri() && !options.background) {
      try {
        const chatData: ChatData = {
          id: newConversation.id,
          title: newConversation.title,
          model: get().model,
          agentId: get().agentId,
          messages: [],
          createdAt: newConversation.createdAt.toISOString(),
          updatedAt: newConversation.updatedAt.toISOString(),
        };
        await saveChatToFolder(chatData, folderPath);
        await get().loadChatsFromDisk();
      } catch (error) {
        console.error("[chat-store] Failed to save chat to disk:", error);
      }
    }

    return newConversation;
  };

  const streamMessage = async (params: {
    conversationId: string;
    content: string;
    isGhost: boolean;
    allowAutoRename: boolean;
    setStreaming: boolean;
    agentIdOverride?: string | null;
    modelOverride?: ModelId;
  }) => {
    const { conversationId, content, isGhost, allowAutoRename, setStreaming, agentIdOverride, modelOverride } = params;
    const state = get();
    const existingConversation = isGhost
      ? state.ghostConversation
      : state.conversations.find((c) => c.id === conversationId);
    if (!existingConversation) return;

    const isFirstUserMessage = (existingConversation.messages.length ?? 0) === 0;
    const currentTitle = existingConversation.title?.trim() ?? "";
    const autoTitle = allowAutoRename ? deriveConversationTitle(content) : null;
    const shouldAutoRename =
      allowAutoRename &&
      isFirstUserMessage &&
      !isGhost &&
      !!autoTitle &&
      (currentTitle === "" || currentTitle === "New Chat" || currentTitle === "Untitled");

    const userMessage: Message = {
      id: uuid(),
      role: "user",
      content,
      createdAt: new Date(),
    };

    const updateConversation = (updater: (conv: Conversation) => Conversation) => {
      if (isGhost) {
        set((state) => {
          if (!state.ghostConversation) return state;
          return { ghostConversation: updater(state.ghostConversation) };
        });
      } else {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId ? updater(c) : c
          ),
        }));
      }
    };

    // Log user input (truncate for privacy/size)
    const messagePreview = content.length > 100 ? content.slice(0, 100) + "..." : content;
    logAgent("USER_INPUT", `Message received: ${messagePreview}`, { conversationId, isGhost });

    updateConversation((c) => ({
      ...c,
      messages: [...c.messages, userMessage],
      title: shouldAutoRename ? (autoTitle ?? c.title) : c.title,
      updatedAt: new Date(),
    }));

    if (shouldAutoRename) {
      await get().renameChat(conversationId, autoTitle!);
    }

    if (setStreaming) {
      set({ isStreaming: true });
    }

    try {
      const settings = useSettingsStore.getState();
      const agentId = agentIdOverride ?? get().agentId;
      const agents = useAgentStore.getState().agents;
      const agent = agents.find((a) => a.name === agentId);

      const conversation = isGhost
        ? get().ghostConversation
        : get().conversations.find((c) => c.id === conversationId);
      if (!conversation) return;

      const assistantMessage: Message = {
        id: uuid(),
        role: "assistant",
        content: "",
        createdAt: new Date(),
      };

      updateConversation((c) => ({
        ...c,
        messages: [...c.messages, assistantMessage],
        updatedAt: new Date(),
      }));

      const model = (modelOverride ?? get().model) as ChatModelId;
      const isLocal = model === "local";
      const systemPrompt = agent?.systemPrompt ?? "You are a helpful AI assistant.";
      const temperature = agent?.temperature ?? 0.7;

      // Helper: run a model through the SapioAgentAdapter (Tauri only)
      // Shared by both local and cloud models for consistent tool execution,
      // guardrails, debug logging, and event flow.
      const runWithAdapter = async (adapterModel: Model<Api>, adapterApiKey: string, adapterIsLocal: boolean) => {
        const loopStore = useAgenticLoopStore.getState();
        const guardrailsConfig = settings.guardrailsConfig;

        // Get or create adapter for this conversation
        let adapter = loopStore.getAdapter(conversationId);
        if (adapter) {
          adapter.stop();
        }
        adapter = loopStore.createAdapter(conversationId, agentId);

        // Set up message provider - gets fresh messages each iteration
        adapter.setMessageProvider(() => {
          const conv = isGhost
            ? get().ghostConversation
            : get().conversations.find((c) => c.id === conversationId);
          return conv?.messages ?? [];
        });

        // Helper to sync tool call state to conversation
        // Searches ALL messages (not just last) to find the tool call by ID
        const syncToolCallToConversation = (toolCall: ToolCallState) => {
          updateConversation((c) => {
            let found = false;
            const messages = c.messages.map((m) => {
              if (!m.toolCalls) return m;
              const tcIndex = m.toolCalls.findIndex((tc) => tc.id === toolCall.id);
              if (tcIndex === -1) return m;
              found = true;
              const updatedToolCalls = [...m.toolCalls];
              updatedToolCalls[tcIndex] = toolCall;
              return { ...m, toolCalls: updatedToolCalls };
            });
            if (!found) {
              // Tool call not in any message yet — append to last assistant message
              const lastIdx = messages.length - 1;
              if (lastIdx >= 0 && messages[lastIdx].role === "assistant") {
                const existingIds = new Set((messages[lastIdx].toolCalls ?? []).map(tc => tc.id));
                if (!existingIds.has(toolCall.id)) {
                  messages[lastIdx] = {
                    ...messages[lastIdx],
                    toolCalls: [...(messages[lastIdx].toolCalls ?? []), toolCall],
                  };
                }
              }
            }
            return { ...c, messages, updatedAt: new Date() };
          });
        };

        // Subscribe to events for UI sync
        const unsubscribe = adapter.onEvent((event: AgentLoopEvent) => {
          switch (event.type) {
            case "assistant_message_started": {
              updateConversation((c) => {
                const messages = [...c.messages];
                const lastMsg = messages[messages.length - 1];

                // If last message has content and tool calls, this is a follow-up turn
                if (lastMsg?.role === "assistant" && (lastMsg.content.trim() !== "" || (lastMsg.toolCalls && lastMsg.toolCalls.length > 0))) {
                  const newAssistantMessage: Message = {
                    id: event.messageId,
                    role: "assistant",
                    content: "",
                    createdAt: new Date(),
                  };
                  return { ...c, messages: [...messages, newAssistantMessage], updatedAt: new Date() };
                }
                return c; // First turn - use existing empty message
              });
              break;
            }
            case "text_delta":
              updateConversation((c) => ({
                ...c,
                messages: updateLastAssistantMessage(c.messages, { content: event.fullContent }),
                updatedAt: new Date(),
              }));
              break;
            case "thinking_completed":
              updateConversation((c) => {
                const messages = [...c.messages];
                const lastIdx = messages.length - 1;
                if (lastIdx < 0 || messages[lastIdx].role !== "assistant") {
                  return c;
                }
                messages[lastIdx] = {
                  ...messages[lastIdx],
                  content: event.content,
                  ...(event.toolCalls.length > 0 ? {
                    toolCalls: (() => {
                      const existing = messages[lastIdx].toolCalls ?? [];
                      const existingIds = new Set(existing.map(tc => tc.id));
                      const newOnes = event.toolCalls.filter(tc => !existingIds.has(tc.id));
                      return [...existing, ...newOnes];
                    })(),
                  } : {}),
                };
                return { ...c, messages, updatedAt: new Date() };
              });
              break;
            case "tool_pending":
            case "tool_executing":
            case "tool_completed":
            case "tool_failed":
              syncToolCallToConversation(event.toolCall);
              break;
            case "loop_error":
              updateConversation((c) => {
                const lastContent = c.messages[c.messages.length - 1]?.content || "";
                return {
                  ...c,
                  messages: updateLastAssistantMessage(c.messages, {
                    content: lastContent + `\n\nError: ${event.error}`,
                  }),
                  updatedAt: new Date(),
                };
              });
              break;
          }
        });

        // Set current loop for UI
        loopStore.setCurrentLoop(conversationId);

        // Build adapter config
        const adapterConfig: SapioAdapterConfig = {
          model: adapterModel,
          systemPrompt,
          apiKey: adapterApiKey,
          temperature,
          isLocal: adapterIsLocal,
          guardrailsConfig,
          onEvent: () => {}, // Events already handled via onEvent subscription
        };

        // Run the adapter
        try {
          await adapter.run(adapterConfig);
        } finally {
          unsubscribe();
        }
      };

      if (isLocal) {
        const localSettings = settings.localLLM;
        if (!localSettings.enabled) {
          updateConversation((c) => ({
            ...c,
            messages: updateLastAssistantMessage(c.messages, {
              content: "Local LLM is disabled. Enable it in Settings to use a local model.",
            }),
            updatedAt: new Date(),
          }));
          return;
        }

        const resolvedModel = await resolveLocalModel(
          localSettings.provider,
          localSettings.baseUrl,
          localSettings.model
        );
        if (!resolvedModel) {
          updateConversation((c) => ({
            ...c,
            messages: updateLastAssistantMessage(c.messages, {
              content: "No local model found. Configure a model name or check your local server.",
            }),
            updatedAt: new Date(),
          }));
          return;
        }

        const localModel = buildLocalModel({
          provider: localSettings.provider,
          baseUrl: localSettings.baseUrl,
          model: resolvedModel,
        });

        if (isTauri()) {
          // Route through adapter for full tool execution, guardrails, and logging
          await runWithAdapter(localModel, "local", true);
        } else {
          // Web-only fallback: simple streaming, no tools available
          const context = buildContextFromConversation({
            conversation,
            systemPrompt,
            api: localModel.api,
            provider: localModel.provider,
            model: localModel.id,
          });

          const stream = streamSimple(localModel, context, {
            apiKey: "local",
            temperature,
          });

          let fullContent = "";
          for await (const event of stream) {
            if (event.type === "text_delta") {
              fullContent += event.delta;
              const displayContent = stripProtocolMarkers(fullContent);
              updateConversation((c) => ({
                ...c,
                messages: updateLastAssistantMessage(c.messages, { content: displayContent }),
                updatedAt: new Date(),
              }));
            } else if (event.type === "error") {
              throw new Error(event.error.errorMessage || "Local LLM error");
            }
          }
        }
      } else {
        const modelKey = model as keyof typeof MODEL_CONFIGS;
        const modelConfig = MODEL_CONFIGS[modelKey];
        if (!modelConfig) {
          throw new Error(`Unknown model: ${model}`);
        }

        const apiKey = settings.apiKeys[modelConfig.provider];

        if (!apiKey) {
          updateConversation((c) => ({
            ...c,
            messages: updateLastAssistantMessage(c.messages, {
              content: `Please configure a ${modelConfig.provider} API key in Settings to use the chat.`,
            }),
            updatedAt: new Date(),
          }));
          return;
        }

        let modelObj: Model<Api>;
        if (modelConfig.provider === "anthropic") {
          modelObj = getModel("anthropic", modelConfig.id as "claude-sonnet-4-20250514");
        } else if (modelConfig.provider === "openai") {
          modelObj = getModel("openai", modelConfig.id as "gpt-4o");
        } else {
          modelObj = getModel("google", modelConfig.id as "gemini-1.5-pro");
        }

        // Use SapioAgentAdapter for tool handling in desktop environment
        if (isTauri()) {
          await runWithAdapter(modelObj, apiKey, false);
        } else {
          // Web-only mode: simple streaming without tool support
          const stream = streamSimple(modelObj, buildContextFromConversation({
            conversation,
            systemPrompt,
            api: modelObj.api,
            provider: modelObj.provider,
            model: modelObj.id,
            includeTools: false,
          }), {
            apiKey,
            temperature,
          });

          let fullContent = "";
          for await (const event of stream) {
            if (event.type === "text_delta") {
              fullContent += event.delta;
              updateConversation((c) => ({
                ...c,
                messages: updateLastAssistantMessage(c.messages, {
                  content: stripProtocolMarkers(fullContent),
                }),
                updatedAt: new Date(),
              }));
            } else if (event.type === "error") {
              throw new Error(event.error.errorMessage || "Failed to send message");
            }
          }
        }
      }

      if (!isGhost) {
        const finalConversation = get().conversations.find((c) => c.id === conversationId);
        if (finalConversation?.path && !finalConversation.background) {
          const chatData = conversationToChatData(finalConversation, model, agentId);
          const folderPath = finalConversation.path.substring(0, finalConversation.path.lastIndexOf("/"));
          const dir = await getAppDataDir();
          await saveChatToFolder(chatData, folderPath === `${dir}/chats` ? undefined : folderPath);
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      updateConversation((c) => {
        if (c.messages[c.messages.length - 1]?.role === "assistant") {
          return {
            ...c,
            messages: updateLastAssistantMessage(c.messages, {
              content: `Error: ${error instanceof Error ? error.message : "Failed to send message"}`,
            }),
            updatedAt: new Date(),
          };
        }
        return { ...c, updatedAt: new Date() };
      });
    } finally {
      if (setStreaming) {
        set({ isStreaming: false });
      }
    }
  };

  return {
    conversations: [],
    currentConversationId: null,
    getCurrentConversation: () => {
      const state = get();
      if (state.isGhostMode && state.ghostConversation?.id === state.currentConversationId) {
        return state.ghostConversation;
      }
      return state.conversations.find((c) => c.id === state.currentConversationId) ?? null;
    },
    chatTree: [],
    expandedFolders: new Set<string>(),
    model: useSettingsStore.getState().defaultModel ?? DEFAULT_MODEL_ID,
    agentId: null,
    isStreaming: false,
    isGhostMode: false,
    ghostConversation: null,
    createConversation: async (folderId?: string) => {
    await createConversationInternal({ folderId, select: true });
  },

  createConversationInBackground: async (options) => {
    return createConversationInternal({
      folderId: options?.folderId,
      title: options?.title,
      select: false,
      background: true,
    });
  },

  selectConversation: async (id) => {
    // Check if it's the ghost conversation
    const { ghostConversation, isGhostMode } = get();
    if (isGhostMode && ghostConversation?.id === id) {
      set({ currentConversationId: id });
      return;
    }

    const conversation = get().conversations.find((c) => c.id === id) ?? null;
    set({ currentConversationId: id });

    if (!conversation || !conversation.path) return;
    if (conversation.messages.length > 0) return;

    const loaded = await loadChatByPath(conversation.path);
    if (!loaded) return;

    // Auto-migrate old .yaml chats to .json
    const isLegacyYaml = conversation.path.endsWith(".yaml");
    let newPath = conversation.path;
    if (isLegacyYaml && isTauri()) {
      try {
        const dir = conversation.path.substring(0, conversation.path.lastIndexOf("/"));
        newPath = `${dir}/${loaded.id}.json`;
        await saveChatToFolder(loaded, dir === `${await getAppDataDir()}/chats` ? undefined : dir);
        await deletePath(conversation.path);
      } catch (e) {
        console.error("[chat-store] Failed to auto-migrate YAML chat:", e);
        newPath = conversation.path; // fallback to original path
      }
    }

    set((state) => {
      const conversations = state.conversations.map((c) => {
        if (c.id !== id) return c;
        return {
          ...c,
          title: loaded.title || c.title,
          path: newPath,
          messages: loaded.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: stripProtocolMarkers(m.content),
            createdAt: new Date(m.createdAt),
            ...(m.toolCalls?.length ? {
              toolCalls: m.toolCalls.map((tc) => ({
                ...tc,
                status: (tc.status === "pending" || tc.status === "executing")
                  ? "error" as ToolCallStatus
                  : tc.status as ToolCallStatus,
                error: (tc.status === "pending" || tc.status === "executing")
                  ? (tc.error || "Interrupted — app closed during execution")
                  : tc.error,
              })),
            } : {}),
          })),
          createdAt: new Date(loaded.createdAt),
          updatedAt: new Date(loaded.updatedAt),
        };
      });
      return { conversations };
    });

    // Refresh tree if we migrated
    if (isLegacyYaml && isTauri()) {
      await get().loadChatsFromDisk();
    }
  },

  deleteConversation: async (id) => {
    const conversation = get().conversations.find((c) => c.id === id);

    // Update state first
    set((state) => {
      const newConversations = state.conversations.filter((c) => c.id !== id);
      const newCurrentId =
        state.currentConversationId === id
          ? newConversations[0]?.id ?? null
          : state.currentConversationId;
      return {
        conversations: newConversations,
        currentConversationId: newCurrentId,
      };
    });

    // Delete from disk if Tauri is available
    if (isTauri() && conversation?.path) {
      try {
        await deleteChatByPath(conversation.path);
        await get().loadChatsFromDisk();
      } catch (error) {
        console.error("Failed to delete chat from disk:", error);
      }
    }
  },

  setModel: (model) => set({ model }),
  setAgentId: (agentId) => set({ agentId }),

  sendMessage: async (content) => {
    const state = get();
    const { isGhostMode } = state;

    // Create conversation if none exists
    if (!state.currentConversationId && !isGhostMode) {
      await get().createConversation();
    } else if (isGhostMode && !state.ghostConversation) {
      // Create ghost conversation in memory
      const ghostConv: Conversation = {
        id: uuid(),
        title: "Incognito Session",
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      set({
        ghostConversation: ghostConv,
        currentConversationId: ghostConv.id,
      });
    }

    const conversationId = get().currentConversationId!;
    const isGhost = get().isGhostMode;

    await streamMessage({
      conversationId,
      content,
      isGhost,
      allowAutoRename: true,
      setStreaming: true,
    });
  },

  sendMessageToConversation: async (conversationId, content, options) => {
    await streamMessage({
      conversationId,
      content,
      isGhost: false,
      allowAutoRename: options?.allowAutoRename ?? false,
      setStreaming: options?.setStreaming ?? false,
      agentIdOverride: options?.agentId,
      modelOverride: options?.model,
    });
  },

  // Folder management
  loadChatsFromDisk: async () => {
    try {
      const tree = await loadChatTree();
      set({ chatTree: tree });

      // Also sync conversations in memory from the tree
      const existingById = new Map(get().conversations.map((c) => [c.id, c]));
      const conversations: Conversation[] = [];
      const loadFromTree = (nodes: ChatTreeNode[]) => {
        for (const node of nodes) {
          if (node.type === "chat") {
            const existing = existingById.get(node.id);
            conversations.push({
              id: node.id,
              title: node.title || "Untitled",
              messages: existing?.messages ?? [], // Preserve in-memory messages
              createdAt: existing?.createdAt ?? new Date(),
              updatedAt: existing?.updatedAt ?? (node.updatedAt ? new Date(node.updatedAt) : new Date()),
              path: node.path,
              folderId: existing?.folderId,
            });
          } else if (node.children) {
            loadFromTree(node.children);
          }
        }
      };
      loadFromTree(tree);

      const conversationIds = new Set(conversations.map((c) => c.id));
      const inMemoryOnly = get().conversations.filter((c) => !conversationIds.has(c.id));
      const mergedConversations = [...conversations, ...inMemoryOnly];

      set({ conversations: mergedConversations });
    } catch (error) {
      console.error("[chat-store] Failed to load chats from disk:", error);
    }
  },

  createFolder: async (name: string, parentFolderId?: string) => {
    try {
      const existingNames = getSiblingFolderNames(get().chatTree, parentFolderId);
      const uniqueName = getUniqueFolderName(name, existingNames);
      let parentPath: string | undefined;
      if (parentFolderId) {
        const folder = findNodeInTree(get().chatTree, parentFolderId);
        if (folder && folder.type === "folder") {
          parentPath = folder.path;
        }
      }
      await createChatFolder(uniqueName, parentPath);
      await get().loadChatsFromDisk();
    } catch (error) {
      console.error("[chat-store] Failed to create folder:", error);
    }
  },

  renameFolder: async (folderId: string, newName: string) => {
    try {
      const folder = findNodeInTree(get().chatTree, folderId);
      if (folder && folder.type === "folder") {
        await renameChatFolder(folder.path, newName);
        await get().loadChatsFromDisk();
      }
    } catch (error) {
      console.error("Failed to rename folder:", error);
    }
  },

  deleteFolder: async (folderId: string) => {
    try {
      const folder = findNodeInTree(get().chatTree, folderId);
      if (folder && folder.type === "folder") {
        await deleteChatFolder(folder.path);
        await get().loadChatsFromDisk();
      }
    } catch (error) {
      console.error("Failed to delete folder:", error);
    }
  },

  toggleFolderExpansion: (folderId: string) => {
    set((state) => {
      const newExpanded = new Set(state.expandedFolders);
      if (newExpanded.has(folderId)) {
        newExpanded.delete(folderId);
      } else {
        newExpanded.add(folderId);
      }
      return { expandedFolders: newExpanded };
    });
  },

  toggleFolderPin: async (folderId: string) => {
    try {
      const folder = findNodeInTree(get().chatTree, folderId);
      if (folder && folder.type === "folder") {
        const meta = await loadFolderMeta(folder.path);
        const newMeta: ChatFolderMeta = {
          isPinned: !(meta?.isPinned ?? false),
          createdAt: meta?.createdAt || new Date().toISOString(),
        };
        await saveFolderMeta(folder.path, newMeta);
        await get().loadChatsFromDisk();
      }
    } catch (error) {
      console.error("Failed to toggle folder pin:", error);
    }
  },

  // Chat management
  renameChat: async (chatId: string, newTitle: string) => {
    // Update in memory first (always works)
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === chatId ? { ...c, title: newTitle, updatedAt: new Date() } : c
      ),
    }));

    // Save to disk if Tauri is available
    if (isTauri()) {
      try {
        const updated = get().conversations.find((c) => c.id === chatId);
        if (updated?.path) {
          const chatData = conversationToChatData(updated, get().model, get().agentId);
          const folderPath = updated.path.substring(0, updated.path.lastIndexOf("/"));
          const dir = await getAppDataDir();
          await saveChatToFolder(chatData, folderPath === `${dir}/chats` ? undefined : folderPath);
          await get().loadChatsFromDisk();
        }
      } catch (error) {
        console.error("Failed to rename chat:", error);
      }
    }
  },

  // Ghost mode
  startGhostSession: () => {
    set({
      isGhostMode: true,
      ghostConversation: null,
      currentConversationId: null,
    });
  },

  exitGhostSession: () => {
    set({
      isGhostMode: false,
      ghostConversation: null,
      currentConversationId: get().conversations[0]?.id ?? null,
    });
  },

  // Tool execution - delegates to loop engine
  confirmToolExecution: async (toolCallId: string) => {
    const conversationId = get().currentConversationId;
    if (!conversationId) return;

    // Delegate to the loop store - the loop engine will handle execution
    // and emit events that sync state back via our event handlers
    await useAgenticLoopStore.getState().confirmTool(conversationId, toolCallId);
  },

  rejectToolExecution: (toolCallId: string) => {
    const conversationId = get().currentConversationId;
    if (!conversationId) return;

    // Delegate to the loop store
    useAgenticLoopStore.getState().rejectTool(conversationId, toolCallId, "Rejected by user");
  },

  markToolCallsStopped: (conversationId: string) => {
    const state = get();
    const isGhost = state.isGhostMode && state.ghostConversation?.id === conversationId;

    const updateFn = (c: Conversation): Conversation => {
      let changed = false;
      const messages = c.messages.map((m) => {
        if (!m.toolCalls) return m;
        const updatedToolCalls = m.toolCalls.map((tc) => {
          if (tc.status === "pending" || tc.status === "executing") {
            changed = true;
            return { ...tc, status: "stopped" as const };
          }
          return tc;
        });
        return changed ? { ...m, toolCalls: updatedToolCalls } : m;
      });
      return changed ? { ...c, messages, updatedAt: new Date() } : c;
    };

    if (isGhost) {
      set((s) => {
        if (!s.ghostConversation) return s;
        return { ghostConversation: updateFn(s.ghostConversation) };
      });
    } else {
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === conversationId ? updateFn(c) : c
        ),
      }));
    }
  },
  };
});

// ============================================================================
// Tool State Sync from Agentic Loop
// ============================================================================

// Subscribe to tool state changes from the agentic loop store
// This ensures conversation state stays in sync when tools are executed
// outside of the streaming context (e.g., when user confirms a tool)
subscribeToToolEvents((conversationId, toolCall) => {
  const state = useChatStore.getState();

  // Determine if this is a ghost conversation or regular
  const isGhost = state.isGhostMode && state.ghostConversation?.id === conversationId;
  const conversation = isGhost
    ? state.ghostConversation
    : state.conversations.find((c) => c.id === conversationId);

  if (!conversation) return;

  // Find the message with this tool call and update it
  const updateFn = (c: Conversation): Conversation => {
    let found = false;
    const messages = c.messages.map((m) => {
      if (!m.toolCalls) return m;

      const tcIndex = m.toolCalls.findIndex((tc) => tc.id === toolCall.id);
      if (tcIndex === -1) return m;

      found = true;
      // Update the tool call state
      const updatedToolCalls = [...m.toolCalls];
      updatedToolCalls[tcIndex] = {
        ...updatedToolCalls[tcIndex],
        status: toolCall.status,
        result: toolCall.result ?? updatedToolCalls[tcIndex].result,
        error: toolCall.error ?? updatedToolCalls[tcIndex].error,
        startedAt: toolCall.startedAt ?? updatedToolCalls[tcIndex].startedAt,
        completedAt: toolCall.completedAt ?? updatedToolCalls[tcIndex].completedAt,
        durationMs: toolCall.durationMs ?? updatedToolCalls[tcIndex].durationMs,
        undoAvailable: toolCall.undoAvailable ?? updatedToolCalls[tcIndex].undoAvailable,
      };

      return { ...m, toolCalls: updatedToolCalls };
    });
    if (!found) {
      // Tool call not in any message yet — append to last assistant message
      const lastIdx = messages.length - 1;
      if (lastIdx >= 0 && messages[lastIdx].role === "assistant") {
        const existingIds = new Set((messages[lastIdx].toolCalls ?? []).map(tc => tc.id));
        if (!existingIds.has(toolCall.id)) {
          messages[lastIdx] = {
            ...messages[lastIdx],
            toolCalls: [...(messages[lastIdx].toolCalls ?? []), toolCall],
          };
        }
      }
    }
    return { ...c, messages, updatedAt: new Date() };
  };

  if (isGhost) {
    useChatStore.setState((state) => {
      if (!state.ghostConversation) return state;
      return { ghostConversation: updateFn(state.ghostConversation) };
    });
  } else {
    useChatStore.setState((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? updateFn(c) : c
      ),
    }));
  }
});
