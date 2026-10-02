import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SettingsSection } from "./settings-sidebar";

interface SettingsSectionLayoutProps {
  /** Rendered as `section-${id}`, which the sidebar scroll-spy observes. */
  id: SettingsSection;
  icon: LucideIcon;
  title: string;
  /** Classes for the body wrapper, usually its vertical spacing. */
  className?: string;
  /** The last section has no bottom divider. */
  last?: boolean;
  children: React.ReactNode;
}

/** One Settings page section: an anchored <section> with an icon heading. */
export function SettingsSectionLayout({
  id,
  icon: Icon,
  title,
  className,
  last = false,
  children,
}: SettingsSectionLayoutProps) {
  return (
    <section id={`section-${id}`} className={cn(!last && "border-b border-border pb-8")}>
      <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
        <Icon className="h-4.5 w-4.5 text-muted-foreground" />
        {title}
      </h2>
      <div className={className}>{children}</div>
    </section>
  );
}
