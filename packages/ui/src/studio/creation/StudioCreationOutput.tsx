import { useEffect, useState } from "react";
import { FolderOpen, Image, LoaderCircle, Video } from "lucide-react";
import type { CreationJob, MediaPreviewPreparation } from "@knorvia/services";
import { Button } from "@/components/ui/button.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";

export function StudioCreationOutput({ job }: { job: CreationJob }) {
  const { intl } = useKnorviaIntl();
  const platform = usePlatform();
  const media = useBaseWorkspaceServices().mediaPreviewService;
  const files = useBaseWorkspaceServices().fileService;
  const output = job.outputs[0];
  const [preview, setPreview] = useState<MediaPreviewPreparation | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [previewError, setPreviewError] = useState("");

  useEffect(() => {
    if (!output) return;
    let disposed = false;
    let prepared: MediaPreviewPreparation | null = null;
    if (job.kind === "image") {
      void files
        .readMediaPreview({ path: output.path, maxBytes: 8 * 1024 * 1024 })
        .then((value) => {
          if (!disposed) setImageUrl(`data:${value.mediaType};base64,${value.dataBase64}`);
        })
        .catch((cause) => {
          if (!disposed) setPreviewError(cause instanceof Error ? cause.message : String(cause));
        });
      return () => {
        disposed = true;
      };
    }
    if (!media) return;
    void media
      .prepare({ path: output.path, expectedKind: "video" })
      .then((value) => {
        if (disposed) {
          if (value.kind === "host-range-url" && media.release)
            void media.release({ previewId: value.previewId });
          return;
        }
        prepared = value;
        setPreview(value);
        setPreviewError("");
      })
      .catch((cause) => {
        if (!disposed) setPreviewError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      disposed = true;
      if (prepared?.kind === "host-range-url" && media.release)
        void media.release({ previewId: prepared.previewId });
    };
  }, [files, job.kind, media, output]);

  const url =
    job.kind === "image"
      ? imageUrl
      : preview?.kind === "inline"
        ? `data:${preview.mediaType};base64,${preview.dataBase64}`
        : preview?.url;
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
