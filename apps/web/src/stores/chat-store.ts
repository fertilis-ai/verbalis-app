import { create } from "zustand";
import { v4 as uuid } from "uuid";
import type { Api, Model, ThinkingLevel } from "@earendil-works/pi-ai";
import type { Message, Conversation, ContextFile, ToolCallState, ToolCallStatus } from "@/lib/types/chat";
import type { ContextBudget } from "@/lib/context/token-estimate";
import { buildSystemPrompt, loadToolboxPromptSections } from "@/lib/prompt/build-system-prompt";
import { useSettingsStore } from "./settings-store";
import { useAgentStore } from "./agent-store";
import { useAgenticLoopStore, subscribeToLoopEvents } from "./agentic-loop-store";
import { runConversation, updateLastAssistantMessage } from "@/lib/agentic/run-conversation";
import type { GuardrailsConfig } from "@/lib/guardrails/types";
import { getActiveModels, type ModelId, type ChatModelId } from "@/lib/models";
import { resolveEffortFor, toReasoningOption } from "@/lib/reasoning";
import {
  loadChatTree,
  loadChatByPath,
  saveChatToFolder,
  deleteChatByPath,
  deleteChatFolder,
  renameChatFolder,
  toggleChatFolderPin,
  createChatFolder,
  deletePath,
  getAppDataDir,
  isTauri,
  readFile,
  renamePath,
  type ChatTreeNode,
} from "@/lib/storage";
import { logAgent } from "@/lib/logger";
import { resolveModelObject, unresolvedModelMessage } from "@/lib/llm/resolve-model";
import { buildLocalModel, resolveLocalModel } from "@/lib/llm/local-model";
import { streamPlain } from "@/lib/llm/stream-plain";
import { dirname, basename } from "@/lib/path-resolution";
import {
  chatFolderArg,
  conversationToChatData,
  deserializeMessages,
  saveConversation,
} from "@/lib/chat-persistence";
import { rejectToolCall, stopInFlightToolCalls, upsertToolCall } from "@/lib/tool-call-patch";
import { findNodeInTree } from "@/lib/tree-utils";
import { createFolderExpansionSlice, createFolderTreeSlice } from "./folder-tree-slice";

export type { Message, Conversation, ContextFile, ToolCallState, ToolCallStatus };

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

  // Estimated context-window budget for the most recent send (null until first send)
  contextBudget: ContextBudget | null;
  // True when the sliding window dropped older messages on the most recent send
  contextWindowTrimmed: boolean;

  // File context attached to conversation
  contextFiles: ContextFile[];

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
    options?: { agentId?: string | null; model?: ModelId; allowAutoRename?: boolean; setStreaming?: boolean; guardrailsConfig?: GuardrailsConfig }
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
  moveConversation: (chatId: string, targetFolderId: string | null) => Promise<void>;

  // Actions - context files
  addContextFiles: (paths: string[]) => Promise<void>;
  removeContextFile: (path: string) => void;
  clearContextFiles: () => void;

  // Actions - ghost mode
  startGhostSession: () => void;
  exitGhostSession: () => void;

  // Actions - tool execution
  confirmToolExecution: (toolCallId: string) => Promise<void>;
  rejectToolExecution: (toolCallId: string) => void;

  // Actions - tool state management
  markToolCallsStopped: (conversationId: string) => void;
}

function deriveConversationTitle(content: string, maxLength = 50): string | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

/** The conversation that was open when the ghost session started; reopened on exit. */
let conversationBeforeGhost: string | null = null;

/**
 * Apply `updater` to the conversation with this id, ghost or regular. Returns
 * the state unchanged when there is no such conversation or nothing changed.
 */
function updateConversationInState(
  s: ChatState,
  conversationId: string,
  updater: (c: Conversation) => Conversation
): ChatState | Partial<ChatState> {
  if (s.ghostConversation?.id === conversationId) {
    const next = updater(s.ghostConversation);
    return next === s.ghostConversation ? s : { ghostConversation: next };
  }
  const index = s.conversations.findIndex((c) => c.id === conversationId);
  if (index === -1) return s;
  const next = updater(s.conversations[index]);
  if (next === s.conversations[index]) return s;
  const conversations = [...s.conversations];
  conversations[index] = next;
  return { conversations };
}

export const useChatStore = create<ChatState>((set, get) => {
  const applyUpdate = (conversationId: string, updater: (c: Conversation) => Conversation) => {
    set((s) => updateConversationInState(s, conversationId, updater));
  };

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
        await saveChatToFolder(conversationToChatData(newConversation, get().model, get().agentId), folderPath);
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
    guardrailsConfigOverride?: GuardrailsConfig;
  }) => {
    const { conversationId, content, isGhost, allowAutoRename, setStreaming, agentIdOverride, modelOverride, guardrailsConfigOverride } = params;
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

    const updateConversation = (updater: (conv: Conversation) => Conversation) => applyUpdate(conversationId, updater);

    // Log user input (truncate for privacy/size)
    const messagePreview = content.length > 100 ? `${content.slice(0, 100)}...` : content;
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
      const temperature = agent?.temperature ?? 0.7;
      // Per-agent tool scoping: when the agent declares a `tools:` list, only
      // those tools are exposed for this run.
      const allowedTools = agent?.tools;

      const systemPrompt = buildSystemPrompt({
        agent,
        sections: await loadToolboxPromptSections({ settingsDir: settings.settingsDirectory, userMessage: content }),
        contextFiles: get().contextFiles,
        workingDirectory: settings.workingDirectory,
        allowSelfEnhancement: settings.allowSelfEnhancement,
        imageGeneration: !!(settings.apiKeys.openrouter?.trim() && settings.imageModel),
      });

      // Run a model through the VerbalisAgentAdapter (Tauri only). Shared by
      // local and cloud models for consistent tool execution, guardrails,
      // debug logging, and event flow.
      const runWithAdapter = (adapterModel: Model<Api>, adapterApiKey: string, adapterReasoning?: ThinkingLevel) =>
        runConversation(
          {
            conversationId,
            agentId,
            model: adapterModel,
            apiKey: adapterApiKey,
            reasoning: adapterReasoning,
            systemPrompt,
            temperature,
            guardrailsConfig: guardrailsConfigOverride ?? settings.guardrailsConfig,
            allowedTools,
          },
          {
            loopStore: useAgenticLoopStore.getState(),
            getMessages: () =>
              (isGhost
                ? get().ghostConversation?.messages
                : get().conversations.find((c) => c.id === conversationId)?.messages) ?? [],
            updateConversation,
            onContextBudget: (contextBudget) => set({ contextBudget, contextWindowTrimmed: false }),
            onContextTrimmed: () => set({ contextWindowTrimmed: true }),
          }
        );

      const showStreamedContent = (content: string) =>
        updateConversation((c) => ({
          ...c,
          messages: updateLastAssistantMessage(c.messages, { content }),
          updatedAt: new Date(),
        }));

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
          await runWithAdapter(localModel, "local");
        } else {
          // Web-only fallback: simple streaming, no tools available
          await streamPlain({
            model: localModel,
            systemPrompt,
            messages: conversation.messages,
            options: { apiKey: "local", temperature },
            fallbackError: "Local LLM error",
            onContent: showStreamedContent,
          });
        }
      } else {
        const resolved = resolveModelObject(
          model,
          settings.apiKeys,
          settings.selectedModels,
          settings.openRouterZdrOnly
        );
        if (!resolved) {
          updateConversation((c) => ({
            ...c,
            messages: updateLastAssistantMessage(c.messages, {
              content: unresolvedModelMessage(model, settings.selectedModels),
            }),
            updatedAt: new Date(),
          }));
          return;
        }

        const { modelObj, apiKey, capability } = resolved;

        // Reasoning effort: per-model preference, falling back to OpenRouter's
        // own default and clamped to what it says the model accepts. Resolved
        // from the same capability the picker reads, so the two cannot disagree
        // — and no capability means no picker, hence nothing to send. "off"
        // becomes undefined; never forward it to the SDK.
        const reasoning = capability
          ? toReasoningOption(resolveEffortFor(capability, settings.modelEffort?.[model]))
          : undefined;

        // Use VerbalisAgentAdapter for tool handling in desktop environment
        if (isTauri()) {
          await runWithAdapter(modelObj, apiKey, reasoning);
        } else {
          // Web-only mode: simple streaming without tool support
          await streamPlain({
            model: modelObj,
            systemPrompt,
            messages: conversation.messages,
            options: { apiKey, temperature, reasoning },
            fallbackError: "Failed to send message",
            onContent: showStreamedContent,
          });
        }
      }

      if (!isGhost) {
        const finalConversation = get().conversations.find((c) => c.id === conversationId);
        if (finalConversation && !finalConversation.background) {
          await saveConversation(finalConversation, model, agentId);
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
    ...createFolderExpansionSlice(set),
    model: useSettingsStore.getState().defaultModel,
    agentId: null,
    isStreaming: false,
    contextBudget: null,
    contextWindowTrimmed: false,
    contextFiles: [],
    isGhostMode: false,
    ghostConversation: null,
    createConversation: async (folderId?: string) => {
    set({ contextFiles: [] });
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
      set({ currentConversationId: id, contextFiles: [] });
      return;
    }

    const conversation = get().conversations.find((c) => c.id === id) ?? null;
    set({
      currentConversationId: id,
      contextFiles: [],
      ...(isGhostMode && { isGhostMode: false, ghostConversation: null }),
    });

    if (!conversation?.path) return;
    if (conversation.messages.length > 0) return;

    const loaded = await loadChatByPath(conversation.path);
    if (!loaded) return;

    // Auto-migrate old .yaml chats to .json
    const isLegacyYaml = conversation.path.endsWith(".yaml");
    let newPath = conversation.path;
    if (isLegacyYaml && isTauri()) {
      try {
        const dir = dirname(conversation.path);
        newPath = `${dir}/${loaded.id}.json`;
        await saveChatToFolder(loaded, await chatFolderArg(dir));
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
          messages: deserializeMessages(loaded.messages),
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
  setAgentId: (agentId) => {
    set({ agentId });
    // Persist selection so it survives restart.
    useSettingsStore.getState().setSelectedAgentId(agentId);
  },

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
      guardrailsConfigOverride: options?.guardrailsConfig,
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

  ...createFolderTreeSlice({
    logPrefix: "chat-store",
    getTree: () => get().chatTree,
    reload: () => get().loadChatsFromDisk(),
    storage: {
      create: createChatFolder,
      rename: renameChatFolder,
      remove: deleteChatFolder,
      togglePin: toggleChatFolderPin,
    },
  }),

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
          await saveConversation(updated, get().model, get().agentId);
          await get().loadChatsFromDisk();
        }
      } catch (error) {
        console.error("Failed to rename chat:", error);
      }
    }
  },

  moveConversation: async (chatId: string, targetFolderId: string | null) => {
    try {
      const conversation = get().conversations.find((c) => c.id === chatId);
      if (!conversation?.path) return;

      let targetDir: string;
      if (targetFolderId === null) {
        targetDir = `${await getAppDataDir()}/chats`;
      } else {
        const folder = findNodeInTree(get().chatTree, targetFolderId);
        if (folder?.type !== "folder") return;
        targetDir = folder.path;
      }

      const fileName = basename(conversation.path);
      const newPath = `${targetDir}/${fileName}`;
      if (newPath === conversation.path) return;

      await renamePath(conversation.path, newPath);
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === chatId ? { ...c, path: newPath, folderId: targetFolderId ?? undefined } : c
        ),
      }));
      await get().loadChatsFromDisk();
    } catch (error) {
      console.error("Failed to move conversation:", error);
    }
  },

  // Context files
  addContextFiles: async (paths: string[]) => {
    const existing = new Set(get().contextFiles.map((f) => f.path));
    const newPaths = paths.filter((p) => !existing.has(p));
    if (newPaths.length === 0) return;

    const MAX_CONTENT_LENGTH = 50_000;
    const files: ContextFile[] = [];
    for (const filePath of newPaths) {
      try {
        let content = await readFile(filePath);
        if (content.length > MAX_CONTENT_LENGTH) {
          content = `${content.slice(0, MAX_CONTENT_LENGTH)}\n... (truncated)`;
        }
        const name = basename(filePath);
        files.push({ path: filePath, name, content });
      } catch (error) {
        console.error(`[chat-store] Failed to read file: ${filePath}`, error);
      }
    }
    if (files.length > 0) {
      set((state) => ({ contextFiles: [...state.contextFiles, ...files] }));
    }
  },

  removeContextFile: (path: string) => {
    set((state) => ({ contextFiles: state.contextFiles.filter((f) => f.path !== path) }));
  },

  clearContextFiles: () => {
    set({ contextFiles: [] });
  },

  // Ghost mode
  startGhostSession: () => {
    if (!get().isGhostMode) conversationBeforeGhost = get().currentConversationId;
    set({
      isGhostMode: true,
      ghostConversation: null,
      currentConversationId: null,
    });
  },

  exitGhostSession: () => {
    const { conversations } = get();
    const next = conversations.find((c) => c.id === conversationBeforeGhost) ?? conversations[0];
    conversationBeforeGhost = null;
    set({ isGhostMode: false, ghostConversation: null, currentConversationId: null });
    // Go through selectConversation: chats load their messages lazily, and
    // pointing currentConversationId at an unloaded chat shows it empty.
    if (next) void get().selectConversation(next.id);
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

    // Immediately reflect rejection in chat history to avoid stale pending UI.
    applyUpdate(conversationId, (c) => rejectToolCall(c, toolCallId, "Rejected by user"));
  },

  markToolCallsStopped: (conversationId: string) => {
    applyUpdate(conversationId, stopInFlightToolCalls);
  },
  };
});

// ============================================================================
// Tool State Sync from Agentic Loop
// ============================================================================

// The loop bus is the single path from the agentic loop to conversation state,
// covering both streaming and out-of-band updates (e.g. a user confirming a tool).
subscribeToLoopEvents((event) => {
  if (event.type === "loop_ended") {
    useChatStore.getState().markToolCallsStopped(event.conversationId);
    return;
  }

  const { conversationId, toolCall } = event;
  useChatStore.setState((s) => updateConversationInState(s, conversationId, (c) => upsertToolCall(c, toolCall)));
});

// ============================================================================
// Settings → Chat Model Sync
// ============================================================================

// When selectedModels or defaultModel change in settings, ensure the chat model
// is still valid. If it was removed from the active list, fall back gracefully.
useSettingsStore.subscribe((state, prevState) => {
  if (state.selectedModels === prevState.selectedModels && state.defaultModel === prevState.defaultModel) return;
  const chatModel = useChatStore.getState().model;
  if (chatModel === "local") return; // local model handled separately
  const active = getActiveModels(state.selectedModels);
  if (!active.some((m) => m.id === chatModel)) {
    const fallback = active.some((m) => m.id === state.defaultModel)
      ? state.defaultModel
      : active[0]?.id ?? "";
    useChatStore.setState({ model: fallback });
  }
});
