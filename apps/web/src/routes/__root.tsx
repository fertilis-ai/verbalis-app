import { useEffect, useState } from "react";
import { HeadContent, Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { initAppDataDir, ensureWellKnownMemories } from "@/lib/storage";
import { initConfigSync } from "@/lib/config-sync";
import { initFetchPolyfill } from "@/lib/http";
import { startSchedulerRunner } from "@/lib/scheduler-runner";
import { useAgentStore } from "@/stores/agent-store";
import { useChatStore } from "@/stores/chat-store";
import { useSettingsStore } from "@/stores/settings-store";
import { getHueCssOverrides, applyHueOverrides, clearHueOverrides } from "@/lib/hue-presets";

import "../index.css";

export type RouterAppContext = {}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "Sapio",
      },
      {
        name: "description",
        content: "Sapio - Your personal AI agent",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
  }),
});

function RootComponent() {
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
      const restored = persisted && agents.some((a) => a.name === persisted) ? persisted : agents[0].name;
      setAgentId(restored);
    }
  }, [initialized, agentId, agents, setAgentId]);

  // Don't render children until storage directories are initialized
  // This prevents race conditions where stores try to load before directories exist
  if (!initialized) {
    return null;
  }

  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        storageKey="sapio-theme"
      >
        <HueApplicator />
        <div className="h-svh overflow-hidden">
          <Outlet />
        </div>
        <Toaster richColors />
      </ThemeProvider>
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
    </>
  );
}

function HueApplicator() {
  const hue = useSettingsStore((s) => s.hue);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const mode = resolvedTheme === "dark" ? "dark" : "light";
    const overrides = getHueCssOverrides(hue, mode);
    if (overrides) {
      applyHueOverrides(overrides);
    } else {
      clearHueOverrides();
    }
  }, [hue, resolvedTheme]);

  return null;
}
