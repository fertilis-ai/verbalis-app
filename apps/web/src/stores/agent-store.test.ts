import { describe, it, expect, beforeEach, vi } from "vitest";

const mockListAgents = vi.fn();
const mockLoadAgent = vi.fn();

vi.mock("@/lib/storage", () => ({
  listAgents: (...args: unknown[]) => mockListAgents(...args),
  loadAgent: (...args: unknown[]) => mockLoadAgent(...args),
}));

import { useAgentStore, type Agent } from "./agent-store";

const makeAgent = (name: string, overrides?: Partial<Agent>): Agent => ({
  name,
  model: "claude-sonnet-4-20250514",
  temperature: 0.5,
  systemPrompt: `You are ${name}`,
  ...overrides,
});

describe("agent-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to initial state
    useAgentStore.setState({
      agents: useAgentStore.getState().agents.length > 0 ? useAgentStore.getState().agents : [],
      selectedAgent: null,
    });
    // Re-initialize with default agents
    useAgentStore.setState({
      agents: [
        makeAgent("default", { temperature: 0.3 }),
        makeAgent("Assistant", { temperature: 0.7 }),
        makeAgent("Researcher", { temperature: 0.7 }),
        makeAgent("Coder", { temperature: 0.3 }),
      ],
      selectedAgent: null,
    });
  });

  describe("initial state", () => {
    it("has default agents", () => {
      expect(useAgentStore.getState().agents.length).toBe(4);
    });

    it("has no selected agent initially", () => {
      expect(useAgentStore.getState().selectedAgent).toBeNull();
    });
  });

  describe("setAgents", () => {
    it("replaces the agents list", () => {
      const newAgents = [makeAgent("Custom1"), makeAgent("Custom2")];
      useAgentStore.getState().setAgents(newAgents);
      expect(useAgentStore.getState().agents).toEqual(newAgents);
    });

    it("can set to empty array", () => {
      useAgentStore.getState().setAgents([]);
      expect(useAgentStore.getState().agents).toEqual([]);
    });
  });

  describe("selectAgent", () => {
    it("selects an agent by name", () => {
      useAgentStore.getState().selectAgent("default");
      expect(useAgentStore.getState().selectedAgent?.name).toBe("default");
    });

    it("returns null for non-existent agent", () => {
      useAgentStore.getState().selectAgent("nonexistent");
      expect(useAgentStore.getState().selectedAgent).toBeNull();
    });

    it("deselects when null is passed", () => {
      useAgentStore.getState().selectAgent("default");
      useAgentStore.getState().selectAgent(null);
      expect(useAgentStore.getState().selectedAgent).toBeNull();
    });
  });

  describe("createAgent", () => {
    it("adds a new agent to the list", () => {
      const newAgent = makeAgent("NewAgent");
      useAgentStore.getState().createAgent(newAgent);
      const agents = useAgentStore.getState().agents;
      expect(agents).toHaveLength(5);
      expect(agents[4].name).toBe("NewAgent");
    });

    it("appends to the end", () => {
      useAgentStore.getState().createAgent(makeAgent("First"));
      useAgentStore.getState().createAgent(makeAgent("Second"));
      const agents = useAgentStore.getState().agents;
      expect(agents[agents.length - 1].name).toBe("Second");
      expect(agents[agents.length - 2].name).toBe("First");
    });
  });

  describe("updateAgent", () => {
    it("updates an existing agent by name", () => {
      useAgentStore.getState().updateAgent("default", { temperature: 0.9 });
      const agent = useAgentStore.getState().agents.find((a) => a.name === "default");
      expect(agent?.temperature).toBe(0.9);
    });

    it("does not affect other agents", () => {
      useAgentStore.getState().updateAgent("default", { temperature: 0.9 });
      const assistant = useAgentStore.getState().agents.find((a) => a.name === "Assistant");
      expect(assistant?.temperature).toBe(0.7);
    });

    it("updates selectedAgent if it matches the updated agent", () => {
      useAgentStore.getState().selectAgent("default");
      useAgentStore.getState().updateAgent("default", { model: "gpt-4o" });
      expect(useAgentStore.getState().selectedAgent?.model).toBe("gpt-4o");
    });

    it("does not change selectedAgent when a different agent is updated", () => {
      useAgentStore.getState().selectAgent("default");
      useAgentStore.getState().updateAgent("Assistant", { model: "gpt-4o" });
      expect(useAgentStore.getState().selectedAgent?.name).toBe("default");
      expect(useAgentStore.getState().selectedAgent?.model).toBe("claude-sonnet-4-20250514");
    });

    it("no-ops when name does not match any agent", () => {
      const before = useAgentStore.getState().agents;
      useAgentStore.getState().updateAgent("nonexistent", { temperature: 1.0 });
      expect(useAgentStore.getState().agents).toEqual(before);
    });
  });

  describe("deleteAgent", () => {
    it("removes an agent by name", () => {
      useAgentStore.getState().deleteAgent("Coder");
      const agents = useAgentStore.getState().agents;
      expect(agents).toHaveLength(3);
      expect(agents.find((a) => a.name === "Coder")).toBeUndefined();
    });

    it("clears selectedAgent if it was the deleted agent", () => {
      useAgentStore.getState().selectAgent("default");
      useAgentStore.getState().deleteAgent("default");
      expect(useAgentStore.getState().selectedAgent).toBeNull();
    });

    it("keeps selectedAgent if a different agent was deleted", () => {
      useAgentStore.getState().selectAgent("default");
      useAgentStore.getState().deleteAgent("Coder");
      expect(useAgentStore.getState().selectedAgent?.name).toBe("default");
    });

    it("no-ops when name does not match any agent", () => {
      const before = useAgentStore.getState().agents.length;
      useAgentStore.getState().deleteAgent("nonexistent");
      expect(useAgentStore.getState().agents).toHaveLength(before);
    });
  });

  describe("loadAgentsFromDisk", () => {
    it("loads agents from disk and sorts default first", async () => {
      mockListAgents.mockResolvedValue(["Coder", "default", "Writer"]);
      mockLoadAgent.mockImplementation((name: string) =>
        Promise.resolve(makeAgent(name))
      );
      await useAgentStore.getState().loadAgentsFromDisk();
      const agents = useAgentStore.getState().agents;
      expect(agents[0].name).toBe("default");
      expect(agents).toHaveLength(3);
    });

    it("preserves a per-agent tools allowlist", async () => {
      mockListAgents.mockResolvedValue(["scoped"]);
      mockLoadAgent.mockResolvedValue({
        ...makeAgent("scoped"),
        tools: ["read_file", "web_search"],
      });
      await useAgentStore.getState().loadAgentsFromDisk();
      const agent = useAgentStore.getState().agents.find((a) => a.name === "scoped");
      expect(agent?.tools).toEqual(["read_file", "web_search"]);
    });

    it("sets selectedAgent to first loaded agent", async () => {
      mockListAgents.mockResolvedValue(["default", "Writer"]);
      mockLoadAgent.mockImplementation((name: string) =>
        Promise.resolve(makeAgent(name))
      );
      await useAgentStore.getState().loadAgentsFromDisk();
      expect(useAgentStore.getState().selectedAgent?.name).toBe("default");
    });

    it("falls back to defaults when no agents on disk", async () => {
      mockListAgents.mockResolvedValue([]);
      await useAgentStore.getState().loadAgentsFromDisk();
      expect(useAgentStore.getState().agents.length).toBeGreaterThan(0);
      expect(useAgentStore.getState().selectedAgent).not.toBeNull();
    });

    it("falls back to defaults when all loadAgent calls return null", async () => {
      mockListAgents.mockResolvedValue(["broken1", "broken2"]);
      mockLoadAgent.mockResolvedValue(null);
      await useAgentStore.getState().loadAgentsFromDisk();
      expect(useAgentStore.getState().agents.length).toBeGreaterThan(0);
      expect(useAgentStore.getState().selectedAgent).not.toBeNull();
    });

    it("falls back to defaults on error", async () => {
      mockListAgents.mockRejectedValue(new Error("disk error"));
      await useAgentStore.getState().loadAgentsFromDisk();
      expect(useAgentStore.getState().agents.length).toBeGreaterThan(0);
      expect(useAgentStore.getState().selectedAgent).not.toBeNull();
    });

    it("skips agents that fail to load individually", async () => {
      mockListAgents.mockResolvedValue(["default", "broken", "Writer"]);
      mockLoadAgent.mockImplementation((name: string) => {
        if (name === "broken") return Promise.resolve(null);
        return Promise.resolve(makeAgent(name));
      });
      await useAgentStore.getState().loadAgentsFromDisk();
      const agents = useAgentStore.getState().agents;
      expect(agents).toHaveLength(2);
      expect(agents.find((a) => a.name === "broken")).toBeUndefined();
    });

    it("sorts non-default agents alphabetically", async () => {
      mockListAgents.mockResolvedValue(["Zeta", "Alpha", "default"]);
      mockLoadAgent.mockImplementation((name: string) =>
        Promise.resolve(makeAgent(name))
      );
      await useAgentStore.getState().loadAgentsFromDisk();
      const agents = useAgentStore.getState().agents;
      expect(agents[0].name).toBe("default");
      expect(agents[1].name).toBe("Alpha");
      expect(agents[2].name).toBe("Zeta");
    });
  });
});
