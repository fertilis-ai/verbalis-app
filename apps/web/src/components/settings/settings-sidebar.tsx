
import { Palette, Key, FolderCog, Info, Server, Cpu, Shield, Bug } from "lucide-react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "directories", label: "Directories", icon: FolderCog },
  { id: "guardrails", label: "Guardrails", icon: Shield },
  { id: "api-keys", label: "API Keys", icon: Key },
  { id: "models", label: "Models", icon: Cpu },
  { id: "local-llm", label: "Local LLM", icon: Server },
  { id: "debug", label: "Debug", icon: Bug },
  { id: "about", label: "About", icon: Info },
] as const;

export type SettingsSection = (typeof SECTIONS)[number]["id"];

interface SettingsSidebarProps {
  selectedSection?: SettingsSection;
  onSelectSection?: (section: SettingsSection) => void;
}

export function SettingsSidebar({
  selectedSection = "appearance",
  onSelectSection,
}: SettingsSidebarProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 items-center justify-between border-b border-border px-2">
        <span className="text-sm font-medium">Settings</span>
      </div>
      <div className="flex-1 overflow-auto p-2">
        <div className="flex flex-col gap-0.5">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <div
              key={id}
              className={cn(
                "flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-muted",
                selectedSection === id && "bg-muted"
              )}
              onClick={() => onSelectSection?.(id)}
            >
              <Icon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
