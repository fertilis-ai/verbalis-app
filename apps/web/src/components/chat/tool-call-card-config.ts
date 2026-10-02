import type * as React from "react";
import {
  FileText,
  Folder,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Clock,
  Globe,
  Terminal,
  Brain,
  Plug,
  Shield,
  ShieldAlert,
  ShieldX,
  ShieldCheck,
  Square,
  Image as ImageIcon,
} from "lucide-react";
import type { DiffLine } from "@/lib/toolbox/line-diff";
import type { RiskLevel, ToolCategory } from "@/lib/tools/categories";

// ============================================================================
// Icon Maps
// ============================================================================

export const TOOL_ICONS: Record<string, React.ElementType> = {
  read_file: FileText,
  write_file: FileText,
  read_directory: Folder,
  create_directory: Folder,
  delete_path: Trash2,
  list_files: Folder,
  path_exists: FileText,
  rename_path: FileText,
  http_fetch: Globe,
  web_search: Globe,
  scrape_webpage: Globe,
  generate_image: ImageIcon,
};

export const DIFF_LINE_STYLES: Record<DiffLine["type"], string> = {
  context: "text-muted-foreground",
  removed: "bg-red-500/10 text-red-600 dark:text-red-400",
  added: "bg-green-500/10 text-green-600 dark:text-green-400",
};

export const DIFF_LINE_PREFIX: Record<DiffLine["type"], string> = {
  context: "  ",
  removed: "- ",
  added: "+ ",
};

export const CATEGORY_ICONS: Record<ToolCategory, React.ElementType> = {
  file_system: Folder,
  web: Globe,
  system: Terminal,
  integration: Plug,
  memory: Brain,
  custom: FileText,
};

export const RISK_ICONS: Record<RiskLevel, React.ElementType> = {
  low: ShieldCheck,
  medium: Shield,
  high: ShieldAlert,
  critical: ShieldX,
};

// ============================================================================
// Status Configuration
// ============================================================================

export const STATUS_CONFIG = {
  pending: {
    icon: Loader2,
    label: "Preparing...",
    color: "text-muted-foreground",
    bgColor: "bg-muted/50",
    borderColor: "border-muted",
    animate: true,
  },
  pending_confirmation: {
    icon: AlertCircle,
    label: "Awaiting approval",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    animate: false,
  },
  executing: {
    icon: Loader2,
    label: "Executing...",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    animate: true,
  },
  success: {
    icon: CheckCircle2,
    label: "Completed",
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/30",
    animate: false,
  },
  error: {
    icon: XCircle,
    label: "Failed",
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
    animate: false,
  },
  cancelled: {
    icon: XCircle,
    label: "Cancelled",
    color: "text-muted-foreground",
    bgColor: "bg-muted/50",
    borderColor: "border-muted",
    animate: false,
  },
  timeout: {
    icon: Clock,
    label: "Timed out",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
    animate: false,
  },
  stopped: {
    icon: Square,
    label: "Stopped",
    color: "text-muted-foreground",
    bgColor: "bg-muted/50",
    borderColor: "border-muted",
    animate: false,
  },
};

export type ToolCallStatusConfig = (typeof STATUS_CONFIG)[keyof typeof STATUS_CONFIG];
