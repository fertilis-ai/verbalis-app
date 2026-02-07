import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/app-layout";
import { ToolboxSidebar } from "@/components/toolbox/toolbox-sidebar";
import { ToolboxEditor } from "@/components/toolbox/toolbox-editor";

export const Route = createFileRoute("/toolbox")({
  component: ToolboxPage,
});

function ToolboxPage() {
  return (
    <AppLayout section="toolbox" leftPane={<ToolboxSidebar />}>
      <ToolboxEditor />
    </AppLayout>
  );
}
