import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/app-layout";
import { FileSidebar } from "@/components/files/file-sidebar";
import { FileViewer } from "@/components/files/file-viewer";

export const Route = createFileRoute("/files")({
  component: FilesPage,
});

function FilesPage() {
  return (
    <AppLayout section="files" leftPane={<FileSidebar />}>
      <FileViewer />
    </AppLayout>
  );
}
