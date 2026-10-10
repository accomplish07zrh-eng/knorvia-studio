import { FolderOpen, Image, LoaderCircle, Video } from "lucide-react";
import type { CreationJob } from "@knorvia/services";
import { Button } from "@/components/ui/button.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { useMediaPreviewUrl } from "../runtime/useMediaPreviewUrl.js";

export function StudioCreationOutput({ job }: { job: CreationJob }) {
  const { intl } = useKnorviaIntl();
  const platform = usePlatform();
  const output = job.outputs[0];
  const { url, error: previewError } = useMediaPreviewUrl(output?.path, job.kind);
  return (
    <div className="relative flex aspect-video items-center justify-center overflow-hidden border-b border-card-border bg-surface text-foreground-subtle">
      {url && job.kind === "image" ? (
        <img src={url} alt={job.prompt} className="size-full object-contain" />
      ) : url && job.kind === "video" ? (
        <video
          src={url}
          controls
          preload="metadata"
          className="size-full object-contain"
          aria-label={job.prompt}
        />
      ) : job.status === "running" || job.status === "queued" ? (
        <LoaderCircle className="size-6 animate-spin opacity-60" aria-hidden="true" />
      ) : job.kind === "image" ? (
        <Image className="size-7 opacity-35" aria-hidden="true" />
      ) : (
        <Video className="size-7 opacity-35" aria-hidden="true" />
      )}
      {previewError ? (
        <span className="absolute bottom-2 left-2 right-2 rounded bg-background/90 px-2 py-1 text-ui-xs text-destructive">
          {previewError}
        </span>
      ) : null}
      {output && platform.openInFileManager ? (
        <Button
          variant="secondary"
          size="icon"
          className="absolute right-2 top-2 size-8 opacity-90"
          title={intl.formatMessage({ id: "studio.creation.openFile" })}
          aria-label={intl.formatMessage({ id: "studio.creation.openFile" })}
          onClick={() => void platform.openInFileManager?.(output.path)}
        >
          <FolderOpen className="size-4" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
