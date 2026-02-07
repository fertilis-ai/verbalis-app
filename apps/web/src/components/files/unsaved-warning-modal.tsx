import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Button } from "@/components/ui/button";
import { useFileStore } from "@/stores/file-store";

export function UnsavedWarningModal() {
  const {
    pendingCloseFilePath,
    setPendingCloseFilePath,
    confirmClose,
    discardAndClose,
  } = useFileStore();

  const isOpen = pendingCloseFilePath !== null;
  const fileName = pendingCloseFilePath?.split("/").pop() ?? "file";

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setPendingCloseFilePath(null);
        }
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/50 data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0" />
        <DialogPrimitive.Popup className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-popover p-6 shadow-lg data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95">
          <DialogPrimitive.Title className="text-lg font-medium mb-2">
            Unsaved Changes
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-muted-foreground mb-6">
            Do you want to save the changes you made to{" "}
            <span className="font-medium text-foreground">{fileName}</span>?
          </DialogPrimitive.Description>

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setPendingCloseFilePath(null)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={discardAndClose}>
              Discard
            </Button>
            <Button onClick={confirmClose}>Save</Button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
