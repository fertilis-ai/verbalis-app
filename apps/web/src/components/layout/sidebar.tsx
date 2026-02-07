import { useNavigate, useLocation } from "@tanstack/react-router";
import {
  MessageSquare,
  FolderOpen,
  CheckSquare,
  Clock,
  Wrench,
  Settings,
  Bug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLayoutStore, type SectionId } from "@/stores/layout-store";
import { useSettingsStore } from "@/stores/settings-store";

const navItems = [
  { to: "/chat", section: "chat" as SectionId, icon: MessageSquare, label: "Chat" },
  { to: "/files", section: "files" as SectionId, icon: FolderOpen, label: "Files" },
  { to: "/tasks", section: "tasks" as SectionId, icon: CheckSquare, label: "Tasks" },
  { to: "/scheduler", section: "scheduler" as SectionId, icon: Clock, label: "Scheduler" },
  { to: "/toolbox", section: "toolbox" as SectionId, icon: Wrench, label: "Toolbox" },
] as const;

export function IconBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { openSection, toggleSection, openSectionPane } = useLayoutStore();
  const agentDebugLogging = useSettingsStore((s) => s.agentDebugLogging);

  const handleNavClick = (to: string, section: SectionId) => {
    const isOnRoute = location.pathname.startsWith(to);

    if (!isOnRoute) {
      // Not on route: navigate + open pane
      navigate({ to });
      openSectionPane(section);
    } else {
      // On route: toggle pane
      toggleSection(section);
    }
  };

  const handleSettingsClick = () => {
    const isOnRoute = location.pathname.startsWith("/settings");

    if (!isOnRoute) {
      navigate({ to: "/settings" });
      openSectionPane("settings");
    } else {
      toggleSection("settings");
    }
  };

  const handleDebugClick = () => {
    const isOnRoute = location.pathname.startsWith("/debug");

    if (!isOnRoute) {
      navigate({ to: "/debug" });
      openSectionPane("debug");
    } else {
      toggleSection("debug");
    }
  };

  return (
    <div className="flex h-full w-12 flex-col items-center border-r border-border bg-sidebar py-2">
      <div className="flex flex-1 flex-col gap-1">
        {navItems.map(({ to, section, icon: Icon, label }) => {
          const isActive = location.pathname.startsWith(to);
          const isPaneOpen = openSection === section;
          return (
            <button
              key={to}
              onClick={() => handleNavClick(to, section)}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                isActive && isPaneOpen && "bg-sidebar-accent text-sidebar-accent-foreground"
              )}
              title={label}
            >
              <Icon className="h-5 w-5" />
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-1">
        {agentDebugLogging && (
          <button
            onClick={handleDebugClick}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              location.pathname.startsWith("/debug") &&
                openSection === "debug" &&
                "bg-sidebar-accent text-sidebar-accent-foreground"
            )}
            title="Debug"
          >
            <Bug className="h-5 w-5" />
          </button>
        )}
        <button
          onClick={handleSettingsClick}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            location.pathname.startsWith("/settings") &&
              openSection === "settings" &&
              "bg-sidebar-accent text-sidebar-accent-foreground"
          )}
          title="Settings"
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
