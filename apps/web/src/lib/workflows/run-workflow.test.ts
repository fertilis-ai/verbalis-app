import { describe, it, expect, beforeEach, vi } from "vitest";

const mockLoad = vi.fn();
const mockList = vi.fn();

vi.mock("@/lib/storage", () => ({
  loadToolboxItem: (...a: unknown[]) => mockLoad(...a),
  listToolboxItems: (...a: unknown[]) => mockList(...a),
}));

// Mutable fake conversation store
interface FakeMsg { role: string; content: string }
const state: {
  conversations: { id: string; messages: FakeMsg[] }[];
  createConversationInBackground: ReturnType<typeof vi.fn>;
  sendMessageToConversation: ReturnType<typeof vi.fn>;
} = {
  conversations: [],
  createConversationInBackground: vi.fn(),
  sendMessageToConversation: vi.fn(),
};

vi.mock("@/stores/chat-store", () => ({
  useChatStore: { getState: () => state },
}));

import {
  parseWorkflow,
  loadWorkflow,
  runWorkflow,
  runWorkflowByName,
} from "./run-workflow";

beforeEach(() => {
  vi.clearAllMocks();
  state.conversations = [];
  let counter = 0;
  state.createConversationInBackground = vi.fn(async () => {
    const conv = { id: `conv-${++counter}`, messages: [] as FakeMsg[] };
    state.conversations.push(conv);
    return conv;
  });
  // Each step appends an assistant message echoing the prompt it received.
  state.sendMessageToConversation = vi.fn(async (id: string, prompt: string) => {
    const conv = state.conversations.find((c) => c.id === id);
    conv?.messages.push({ role: "user", content: prompt });
    conv?.messages.push({ role: "assistant", content: `out:${prompt}` });
  });
});

describe("parseWorkflow", () => {
  it("parses steps and trigger", () => {
    const wf = parseWorkflow(
      "daily",
      "name: Daily\ntrigger:\n  schedule: \"0 9 * * *\"\nsteps:\n  - agent: Researcher\n    prompt: do research\n  - prompt: summarize {{previous}}"
    );
    expect(wf).not.toBeNull();
    expect(wf!.name).toBe("Daily");
    expect(wf!.trigger?.schedule).toBe("0 9 * * *");
    expect(wf!.steps).toHaveLength(2);
    expect(wf!.steps[0].agent).toBe("Researcher");
    expect(wf!.steps[1].agent).toBeUndefined();
  });

  it("returns null for missing steps", () => {
    expect(parseWorkflow("x", "name: x")).toBeNull();
    expect(parseWorkflow("x", "steps: []")).toBeNull();
  });

  it("returns null for a step without a prompt", () => {
    expect(parseWorkflow("x", "steps:\n  - agent: a")).toBeNull();
  });

  it("returns null for invalid yaml", () => {
    expect(parseWorkflow("x", "::: not : yaml :::\n - [")).toBeNull();
  });
});

describe("runWorkflow", () => {
  it("runs steps in order threading previous output", async () => {
    const wf = parseWorkflow(
      "w",
      "steps:\n  - prompt: step one\n  - prompt: 'use {{previous}}'"
    )!;
    const result = await runWorkflow(wf);
    expect(result.error).toBeUndefined();
    expect(state.sendMessageToConversation).toHaveBeenCalledTimes(2);
    // Second step prompt should contain the first step's output.
    const secondPrompt = state.sendMessageToConversation.mock.calls[1][1];
    expect(secondPrompt).toBe("use out:step one");
    expect(result.stepOutputs).toEqual(["out:step one", "out:use out:step one"]);
  });

  it("substitutes {{input}} in the first step", async () => {
    const wf = parseWorkflow("w", "steps:\n  - prompt: 'echo {{input}}'")!;
    await runWorkflow(wf, { input: "hello" });
    expect(state.sendMessageToConversation.mock.calls[0][1]).toBe("echo hello");
  });

  it("passes the step agent through", async () => {
    const wf = parseWorkflow("w", "steps:\n  - agent: Coder\n    prompt: code")!;
    await runWorkflow(wf);
    expect(state.sendMessageToConversation.mock.calls[0][2]).toMatchObject({ agentId: "Coder" });
  });

  it("captures errors without throwing", async () => {
    state.sendMessageToConversation = vi.fn(async () => {
      throw new Error("boom");
    });
    const wf = parseWorkflow("w", "steps:\n  - prompt: x")!;
    const result = await runWorkflow(wf);
    expect(result.error).toBe("boom");
  });
});

describe("loadWorkflow / runWorkflowByName", () => {
  it("loads and runs by name", async () => {
    mockLoad.mockResolvedValue({
      name: "w",
      category: "workflows",
      content: "steps:\n  - prompt: hi",
      updatedAt: "",
    });
    const wf = await loadWorkflow("w");
    expect(wf).not.toBeNull();
    const result = await runWorkflowByName("w");
    expect(result.error).toBeUndefined();
    expect(result.conversationId).toBeTruthy();
  });

  it("returns an error for unknown workflow", async () => {
    mockLoad.mockResolvedValue(null);
    const result = await runWorkflowByName("missing");
    expect(result.error).toMatch(/not found/);
    expect(result.conversationId).toBeNull();
  });
});
