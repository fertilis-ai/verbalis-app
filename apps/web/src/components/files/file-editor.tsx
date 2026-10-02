import { useFileStore } from "@/stores/file-store";
import { useShallow } from "zustand/react/shallow";
import { CodeOverlayEditor } from "@/components/shared/code-overlay-editor";

export function FileEditor() {
  const {
    activeFilePath,
    openFiles,
    updateFileContent,
  } = useFileStore(
    useShallow((s) => ({
      activeFilePath: s.activeFilePath,
      openFiles: s.openFiles,
      updateFileContent: s.updateFileContent,
    }))
  );

  const activeFile = openFiles.find((f) => f.path === activeFilePath);

  if (!activeFilePath || !activeFile) {
    return null;
  }

  return (
    <CodeOverlayEditor
      className="flex h-full font-mono text-sm"
      content={activeFile.currentContent}
      language={activeFile.language}
      onChange={(value) => updateFileContent(activeFilePath, value)}
    />
  );
}
