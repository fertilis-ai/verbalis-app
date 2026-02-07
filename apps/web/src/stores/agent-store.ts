import { create } from "zustand";
import { listAgents, loadAgent } from "@/lib/storage";

export interface Agent {
  name: string;
  model: string;
  temperature: number;
  systemPrompt: string;
}

interface AgentState {
  agents: Agent[];
  selectedAgent: Agent | null;

  setAgents: (agents: Agent[]) => void;
  loadAgentsFromDisk: () => Promise<void>;
  selectAgent: (name: string | null) => void;
  createAgent: (agent: Agent) => void;
  updateAgent: (name: string, agent: Partial<Agent>) => void;
  deleteAgent: (name: string) => void;
}

const DEFAULT_AGENT: Agent = {
  name: "default",
  model: "claude-sonnet-4-20250514",
  temperature: 0.3,
  systemPrompt: `You are the default orchestration agent for chat. Your job is to coordinate tool use and reasoning to solve user requests efficiently, safely, and transparently.

Core behavior:
- Be tool-first when tools are available and likely to reduce uncertainty or effort.
- Keep plans concise and in-line unless the user explicitly wants a longer plan.
- Ask a brief clarifying question only when it materially reduces risk or rework.
- If multiple paths exist, present 2-3 options with a clear recommendation.

Tool use policy:
- Prefer precise tools over speculation. Use search, file inspection, or commands to verify.
- Use the minimum number of tools needed to reach a reliable answer.
- For potentially destructive actions (delete, overwrite, reset, install system-wide), ask for confirmation first.
- When using shell commands:
  - Prefer read-only commands first (rg, ls, cat) before edits.
  - Avoid long-running or noisy commands unless necessary.
  - Summarize results and show key outputs.

Execution strategy:
1. Restate the goal briefly.
2. Decide whether tools are required.
3. Execute tools in a safe, incremental order.
4. Summarize findings and propose next steps.
5. Confirm before any risky changes.

Quality and safety:
- Never assume facts that can be quickly verified.
- Preserve user data and existing project structure.
- Avoid unnecessary edits or churn.
- If uncertain, be explicit and offer a safe fallback.

Response style:
- Be warm, direct, and collaborative.
- Keep responses focused and actionable.
- Use clear formatting for commands and file paths.
- End with suggested next steps when appropriate.`,
};

const DEFAULT_AGENTS: Agent[] = [
  DEFAULT_AGENT,
  {
    name: "Assistant",
    model: "claude-sonnet-4-20250514",
    temperature: 0.7,
    systemPrompt: "You are a helpful AI assistant. Be concise and helpful.",
  },
  {
    name: "Researcher",
    model: "claude-sonnet-4-20250514",
    temperature: 0.7,
    systemPrompt: "You are a research assistant. You help find and synthesize information. Provide detailed, well-sourced answers.",
  },
  {
    name: "Coder",
    model: "claude-sonnet-4-20250514",
    temperature: 0.3,
    systemPrompt: "You are a coding assistant. Write clean, efficient, and well-documented code. Explain your solutions clearly.",
  },
];

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: DEFAULT_AGENTS,
  selectedAgent: null,

  setAgents: (agents) => set({ agents }),

  loadAgentsFromDisk: async () => {
    try {
      const names = await listAgents();
      if (names.length === 0) {
        set({ agents: DEFAULT_AGENTS, selectedAgent: DEFAULT_AGENTS[0] ?? null });
        return;
      }

      const loaded: Agent[] = [];
      for (const name of names) {
        const agent = await loadAgent(name);
        if (agent) loaded.push(agent);
      }

      if (loaded.length === 0) {
        set({ agents: DEFAULT_AGENTS, selectedAgent: DEFAULT_AGENTS[0] ?? null });
        return;
      }

      loaded.sort((a, b) => {
        const aIsDefault = a.name.toLowerCase() === "default";
        const bIsDefault = b.name.toLowerCase() === "default";
        if (aIsDefault !== bIsDefault) return aIsDefault ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      set({ agents: loaded, selectedAgent: loaded[0] ?? null });
    } catch (error) {
      console.error("Failed to load agents from disk:", error);
      set({ agents: DEFAULT_AGENTS, selectedAgent: DEFAULT_AGENTS[0] ?? null });
    }
  },

  selectAgent: (name) => {
    const agent = name ? get().agents.find((a) => a.name === name) ?? null : null;
    set({ selectedAgent: agent });
  },

  createAgent: (agent) => {
    set((state) => ({
      agents: [...state.agents, agent],
    }));
  },

  updateAgent: (name, updates) => {
    set((state) => ({
      agents: state.agents.map((a) => (a.name === name ? { ...a, ...updates } : a)),
      selectedAgent:
        state.selectedAgent?.name === name
          ? { ...state.selectedAgent, ...updates }
          : state.selectedAgent,
    }));
  },

  deleteAgent: (name) => {
    set((state) => ({
      agents: state.agents.filter((a) => a.name !== name),
      selectedAgent: state.selectedAgent?.name === name ? null : state.selectedAgent,
    }));
  },
}));
