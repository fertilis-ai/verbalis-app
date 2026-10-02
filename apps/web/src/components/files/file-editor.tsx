import { useFileStore } from "@/stores/file-store";
import { CodeOverlayEditor } from "@/components/shared/code-overlay-editor";

export function FileEditor() {
  const { activeFilePath, openFiles, updateFileContent } = useFileStore();

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
