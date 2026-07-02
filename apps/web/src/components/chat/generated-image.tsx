import * as React from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { Download, FolderOpen, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isTauri } from "@/lib/storage";

interface GeneratedImageProps {
  path: string;
}

/** Inline preview of a locally saved generated image, with export actions. */
export function GeneratedImage({ path }: GeneratedImageProps) {
  const [failed, setFailed] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  if (!isTauri()) return null;

  const filename = path.split("/").pop() ?? "image.png";
  const extension = filename.split(".").pop() ?? "png";

  if (failed) {
    return (
      <p className="text-xs text-muted-foreground italic">
        Image no longer available ({filename})
      </p>
    );
  }

  const handleSaveAs = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const dest = await save({
        defaultPath: filename,
        filters: [{ name: "Image", extensions: [extension] }],
      });
      if (dest) {
        await invoke("copy_file", { sourcePath: path, destPath: dest });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      console.error("[generated-image] Save As failed:", err);
    }
  };

  const handleShowInFolder = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await invoke("reveal_in_folder", { path });
    } catch (err) {
      console.error("[generated-image] Show in Folder failed:", err);
    }
  };

  return (
    <div className="space-y-1.5">
      <img
        src={convertFileSrc(path)}
        alt={filename}
        loading="lazy"
        onError={() => setFailed(true)}
        className="max-h-80 rounded-md border border-border object-contain"
      />
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={handleSaveAs} className="gap-1.5 h-6 text-xs">
          {saved ? <Check className="h-3 w-3 text-green-500" /> : <Download className="h-3 w-3" />}
          Save As…
        </Button>
        <Button variant="ghost" size="sm" onClick={handleShowInFolder} className="gap-1.5 h-6 text-xs">
          <FolderOpen className="h-3 w-3" />
          Show in Folder
        </Button>
      </div>
    </div>
  );
}
