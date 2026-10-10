import { FileText, FolderOpen } from "lucide-react";
import type { StudioMediaRef } from "@knorvia/services";
import { Button } from "@/components/ui/button.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useMediaPreviewUrl } from "./useMediaPreviewUrl.js";

/**
 * 外部内核原生产出的媒体（specs/knorvia-kernel-native-media-20261010.md）：
 * 图片、视频、音频直接呈现；其他文件只给名称与「在文件夹中显示」。读取失败只影响本项。
 */
export function StudioMessageMedia({
  messageId,
  media,
  zh,
}: {
  messageId: string;
  media: StudioMediaRef[];
  zh: boolean;
}) {
  return (
    <div data-studio-message-id={messageId} className="flex flex-col gap-2">
      {media.map((item, index) => (
        <MediaItem key={`${item.uri ?? item.name ?? ""}:${index}`} item={item} zh={zh} />
      ))}
    </div>
  );
}

function MediaItem({ item, zh }: { item: StudioMediaRef; zh: boolean }) {
  const platform = usePlatform();
  const { url, error } = useMediaPreviewUrl(item.omitted ? undefined : item.uri, item.kind);
  const name = item.name || item.uri || item.kind;
  const local =
    item.uri && !/^https?:\/\//i.test(item.uri) ? item.uri.replace(/^file:\/\//i, "") : "";
  const reveal =
    local && platform.openInFileManager ? (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 shrink-0 p-0"
        title={zh ? "在文件夹中显示" : "Show in folder"}
        aria-label={zh ? "在文件夹中显示" : "Show in folder"}
        onClick={() => void platform.openInFileManager?.(local)}
      >
        <FolderOpen className="size-3.5" aria-hidden="true" />
      </Button>
    ) : null;
  const caption = (
    <div className="flex items-center gap-1 text-ui-xs text-foreground-subtle">
      <span className="min-w-0 flex-1 truncate" title={item.uri ?? name}>
        {name}
      </span>
      {reveal}
    </div>
  );
  if (item.omitted)
    return (
      <p role="status" className="text-ui-xs text-foreground-subtle">
        {zh ? `${name}：内容过大，未保存。` : `${name}: too large to keep.`}
      </p>
    );
  if (item.kind === "file" || (!url && !error))
    return (
      <div
        data-testid="studio-message-media"
        data-media-kind={item.kind}
        className="flex max-w-md items-center gap-2 rounded-xl border border-border px-3 py-2"
      >
        <FileText className="size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
        <div className="min-w-0 flex-1">{caption}</div>
      </div>
    );
  return (
    <figure
      data-testid="studio-message-media"
      data-media-kind={item.kind}
      className="max-w-xl space-y-1"
    >
      {error ? (
        <p role="alert" className="rounded-xl border border-border px-3 py-2 text-ui-xs">
          {zh ? `无法预览：${error}` : `Preview unavailable: ${error}`}
        </p>
      ) : item.kind === "image" ? (
        <img
          src={url}
          alt={name}
          className="max-h-[28rem] max-w-full rounded-xl border border-border object-contain"
        />
      ) : item.kind === "video" ? (
        <video
          src={url}
          controls
          preload="metadata"
          aria-label={name}
          className="max-h-[28rem] max-w-full rounded-xl border border-border bg-black"
        />
      ) : (
        <audio src={url} controls preload="metadata" aria-label={name} className="w-full" />
      )}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
