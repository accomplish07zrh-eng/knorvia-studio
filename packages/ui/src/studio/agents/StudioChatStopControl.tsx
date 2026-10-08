import { LoaderCircle, Square } from "lucide-react";
import type { StudioRun } from "@knorvia/services";
import { Button } from "@/components/ui/button.js";
export function StudioChatStopControl({
  running,
  stopping,
  enabled,
  zh,
  onStop,
}: {
  running: StudioRun;
  stopping: boolean;
  enabled: boolean;
  zh: boolean;
  onStop: () => Promise<void>;
}) {
  return (
    <Button
      type="button"
      size="icon-md"
      variant="outline"
      disabled={!enabled || stopping || running.cancelRequested}
      aria-label={
        stopping || running.cancelRequested ? (zh ? "正在停止" : "Stopping") : zh ? "停止" : "Stop"
      }
      title={
        stopping || running.cancelRequested ? (zh ? "正在停止" : "Stopping") : zh ? "停止" : "Stop"
      }
      onClick={() => void onStop()}
    >
      {stopping || running.cancelRequested ? (
        <LoaderCircle className="size-3.5 animate-spin" />
      ) : (
        <Square className="size-3.5" />
      )}
    </Button>
  );
}
