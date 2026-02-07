import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/app-layout";
import { SchedulerSidebar } from "@/components/scheduler/scheduler-sidebar";
import { SchedulerView } from "@/components/scheduler/scheduler-view";

export const Route = createFileRoute("/scheduler")({
  component: SchedulerPage,
});

function SchedulerPage() {
  return (
    <AppLayout section="scheduler" leftPane={<SchedulerSidebar />}>
      <SchedulerView />
    </AppLayout>
  );
}
