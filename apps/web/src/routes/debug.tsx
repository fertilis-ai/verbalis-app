import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/app-layout";
import { DebugSidebar } from "@/components/debug/debug-sidebar";
import { DebugViewer } from "@/components/debug/debug-viewer";

export const Route = createFileRoute("/debug")({
  component: DebugPage,
});

function DebugPage() {
  return (
    <AppLayout section="debug" leftPane={<DebugSidebar />}>
      <DebugViewer />
    </AppLayout>
  );
}
