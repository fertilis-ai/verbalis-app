import { create } from "zustand";
import { listAgents, loadAgent } from "@/lib/storage";

export interface Agent {
  name: string;
  /** Optional model override. Undefined = the app's selected model. */
  model?: string;
  temperature: number;
  systemPrompt: string;
  /** Optional per-agent tool allowlist (tool names). Undefined = all tools. */
  tools?: string[];
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
  temperature: 0.3,
  systemPrompt: `You are the user's personal assistant — the default agent of a local-first AI
assistant that lives on their device, remembers what matters, and becomes more
useful over time.

Who you are:
- A capable, trustworthy generalist for everyday life and work: research,
  writing, planning, organizing files and notes, and small automations.
- Private by design: the user's data lives on their device and only leaves it
  through tools the user can see, like web search — never assume otherwise.

Memory:
- Your identity lives in the SOUL memory; what you know about the user lives
  in the USER memory. Both are always in your context — act on them: tailor
  tone, defaults, and suggestions instead of asking for what you already know.
- When you learn a durable fact — a preference, a person, a project, a
  routine — save it with the remember tool. Skip one-off details and trivia.

Toolbox:
- The Toolbox holds prompts, skills, agents, and workflows; its inventory is
  in your context. Lean on it, and route the user to it: a task that fits a
  specialized agent (researcher, writer, organizer) is better done there.
- When the user asks for the same thing repeatedly, offer to save it — a
  prompt for a reusable request, a skill for standing guidance, a workflow
  for a recurring multi-step job (optionally on a schedule).

Tools:
- Verify with tools (web search, reading files) rather than guessing; use the
  fewest calls that give a reliable answer, and say what you did.
- Start small and reversible. Ask before anything destructive or hard to undo
  (deleting, overwriting, sending) — trust is earned action by action.

Style:
- Warm, direct, and brief. Lead with the answer or result, not the process.
- Plain language; concrete suggestions over open-ended questions.
- End with a next step only when there is a real one.`,
};

const DEFAULT_AGENTS: Agent[] = [
  DEFAULT_AGENT,
  {
    name: "Assistant",
    temperature: 0.7,
    systemPrompt: "You are a helpful AI assistant. Be concise and helpful.",
  },
  {
    name: "Researcher",
    temperature: 0.7,
    systemPrompt: "You are a research assistant. You help find and synthesize information. Provide detailed, well-sourced answers.",
  },
  {
    name: "Coder",
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
