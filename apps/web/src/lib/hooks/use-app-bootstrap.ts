import { useEffect, useState } from "react";
import {
  initAppDataDir,
  ensureWellKnownMemories,
  ensureDefaultToolboxItems,
} from "@/lib/storage";
import { initConfigSync } from "@/lib/config-sync";
import { initFetchPolyfill } from "@/lib/http";
import { startSchedulerRunner } from "@/lib/scheduler-runner";
import { useAgentStore } from "@/stores/agent-store";
import { useChatStore } from "@/stores/chat-store";
import { useSettingsStore } from "@/stores/settings-store";

/**
 * Runs app startup and returns whether it has finished. Nothing that reads the
 * storage directories should render before this is true.
 */
export function useAppBootstrap(): boolean {
  const [initialized, setInitialized] = useState(false);
  const loadAgentsFromDisk = useAgentStore((state) => state.loadAgentsFromDisk);
  const agents = useAgentStore((state) => state.agents);
  const agentId = useChatStore((state) => state.agentId);
  const setAgentId = useChatStore((state) => state.setAgentId);

  // Initialize storage directories on app start - must complete before rendering children
  useEffect(() => {
    initFetchPolyfill()
      .then(() => initAppDataDir())
      .then(() => ensureWellKnownMemories())
      .then(() => ensureDefaultToolboxItems())
      .then(() => initConfigSync())
      .catch((err) => console.error("[init] Startup error:", err))
      .finally(() => setInitialized(true));
  }, []);

  useEffect(() => {
    if (!initialized) return;
    loadAgentsFromDisk();
    startSchedulerRunner();
  }, [initialized, loadAgentsFromDisk]);

  useEffect(() => {
    if (!initialized) return;
    if (!agentId && agents.length > 0) {
      // Restore the persisted agent selection if it still exists, else default.
      const persisted = useSettingsStore.getState().selectedAgentId;
      const restored = persisted && agents.some((a) => a.name === persisted) ? persisted : agents[0]!.name;
      setAgentId(restored);
    }
  }, [initialized, agentId, agents, setAgentId]);

  return initialized;
}
