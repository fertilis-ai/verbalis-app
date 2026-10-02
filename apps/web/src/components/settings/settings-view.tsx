import { useScrollSpy } from "@/lib/hooks/use-scroll-spy";
import { GuardrailsSection } from "./guardrails-section";
import type { SettingsSection } from "./settings-sidebar";
import { AppearanceSection } from "./sections/appearance-section";
import { DirectoriesSection } from "./sections/directories-section";
import { AgentSection } from "./sections/agent-section";
import { ApiKeysSection } from "./sections/api-keys-section";
import { ModelsSection } from "./sections/models-section";
import { LocalLlmSection } from "./sections/local-llm-section";
import { DebugSection } from "./sections/debug-section";
import { AboutSection } from "./sections/about-section";

const SECTION_IDS: SettingsSection[] = [
  "appearance",
  "directories",
  "guardrails",
  "agent",
  "api-keys",
  "models",
  "local-llm",
  "debug",
  "about",
];

interface SettingsViewProps {
  selectedSection?: SettingsSection;
  onSelectSection?: (section: SettingsSection) => void;
}

export function SettingsView({ selectedSection, onSelectSection }: SettingsViewProps) {
  const scrollContainerRef = useScrollSpy(SECTION_IDS, selectedSection, onSelectSection);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-10 items-center border-b border-border px-2">
        <span className="text-sm font-medium">Settings</span>
      </div>

      {/* Content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-2xl space-y-8">
          <AppearanceSection />
          <DirectoriesSection />
          <GuardrailsSection />
          <AgentSection />
          <ApiKeysSection />
          <ModelsSection />
          <LocalLlmSection />
          <DebugSection />
          <AboutSection />
        </div>
      </div>
    </div>
  );
}
