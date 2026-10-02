import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const calls: string[] = [];
const step = (name: string) => vi.fn(async () => { calls.push(name); });

const mocks = vi.hoisted(() => ({
  initFetchPolyfill: vi.fn(),
  initAppDataDir: vi.fn(),
  ensureWellKnownMemories: vi.fn(),
  ensureDefaultToolboxItems: vi.fn(),
  initConfigSync: vi.fn(),
  startSchedulerRunner: vi.fn(),
  loadAgentsFromDisk: vi.fn(),
  setAgentId: vi.fn(),
  agentState: { agents: [] as { name: string }[] },
  chatState: { agentId: null as string | null },
  settingsState: { selectedAgentId: null as string | null },
}));

vi.mock("@/lib/http", () => ({ initFetchPolyfill: mocks.initFetchPolyfill }));
vi.mock("@/lib/storage", () => ({
  initAppDataDir: mocks.initAppDataDir,
  ensureWellKnownMemories: mocks.ensureWellKnownMemories,
  ensureDefaultToolboxItems: mocks.ensureDefaultToolboxItems,
}));
vi.mock("@/lib/config-sync", () => ({ initConfigSync: mocks.initConfigSync }));
vi.mock("@/lib/scheduler-runner", () => ({ startSchedulerRunner: mocks.startSchedulerRunner }));
vi.mock("@/stores/agent-store", () => ({
  useAgentStore: (sel: (s: unknown) => unknown) =>
    sel({ ...mocks.agentState, loadAgentsFromDisk: mocks.loadAgentsFromDisk }),
}));
vi.mock("@/stores/chat-store", () => ({
  useChatStore: (sel: (s: unknown) => unknown) =>
    sel({ ...mocks.chatState, setAgentId: mocks.setAgentId }),
}));
vi.mock("@/stores/settings-store", () => ({
  useSettingsStore: { getState: () => mocks.settingsState },
}));

import { useAppBootstrap } from "./use-app-bootstrap";

describe("useAppBootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    mocks.initFetchPolyfill.mockImplementation(step("fetch"));
    mocks.initAppDataDir.mockImplementation(step("appDataDir"));
    mocks.ensureWellKnownMemories.mockImplementation(step("memories"));
    mocks.ensureDefaultToolboxItems.mockImplementation(step("toolbox"));
    mocks.initConfigSync.mockImplementation(step("configSync"));
    mocks.startSchedulerRunner.mockImplementation(() => calls.push("scheduler"));
    mocks.loadAgentsFromDisk.mockImplementation(() => calls.push("agents"));
    mocks.agentState.agents = [];
    mocks.chatState.agentId = null;
    mocks.settingsState.selectedAgentId = null;
  });

  it("runs startup in order, then loads agents and starts the scheduler", async () => {
    const { result } = renderHook(() => useAppBootstrap());
    expect(result.current).toBe(false);

    await waitFor(() => expect(result.current).toBe(true));
    expect(calls).toEqual([
      "fetch",
      "appDataDir",
      "memories",
      "toolbox",
      "configSync",
      "agents",
      "scheduler",
    ]);
  });

  it("still finishes when a startup step fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.initAppDataDir.mockRejectedValue(new Error("no disk"));

    const { result } = renderHook(() => useAppBootstrap());

    await waitFor(() => expect(result.current).toBe(true));
    expect(mocks.ensureWellKnownMemories).not.toHaveBeenCalled();
    expect(mocks.startSchedulerRunner).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith("[init] Startup error:", expect.any(Error));
    error.mockRestore();
  });

  it("restores the persisted agent when it still exists", async () => {
    mocks.agentState.agents = [{ name: "default" }, { name: "writer" }];
    mocks.settingsState.selectedAgentId = "writer";

    const { result } = renderHook(() => useAppBootstrap());

    await waitFor(() => expect(result.current).toBe(true));
    expect(mocks.setAgentId).toHaveBeenCalledWith("writer");
  });

  it("falls back to the first agent when the persisted one is gone", async () => {
    mocks.agentState.agents = [{ name: "default" }, { name: "writer" }];
    mocks.settingsState.selectedAgentId = "deleted";

    const { result } = renderHook(() => useAppBootstrap());

    await waitFor(() => expect(result.current).toBe(true));
    expect(mocks.setAgentId).toHaveBeenCalledWith("default");
  });

  it("leaves an already selected agent alone", async () => {
    mocks.agentState.agents = [{ name: "default" }];
    mocks.chatState.agentId = "default";

    const { result } = renderHook(() => useAppBootstrap());

    await waitFor(() => expect(result.current).toBe(true));
    expect(mocks.setAgentId).not.toHaveBeenCalled();
  });
});
