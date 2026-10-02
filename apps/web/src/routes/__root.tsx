import { useEffect } from "react";
import { HeadContent, Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { useAppBootstrap } from "@/lib/hooks/use-app-bootstrap";
import { useSettingsStore } from "@/stores/settings-store";
import { getHueCssOverrides, applyHueOverrides, clearHueOverrides } from "@/lib/hue-presets";

import "../index.css";

export type RouterAppContext = {}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "Verbalis",
      },
      {
        name: "description",
        content: "Verbalis - Your personal AI agent",
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
  const initialized = useAppBootstrap();

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
        storageKey="verbalis-theme"
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
