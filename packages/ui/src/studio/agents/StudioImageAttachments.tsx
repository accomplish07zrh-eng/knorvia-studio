import { useState } from "react";
import { X } from "lucide-react";
import type { StudioImageRef } from "@knorvia/services";
import { Button } from "@/components/ui/button.js";
import { ChatMediaAttachmentPreviewDialog } from "@/ChatMediaAttachmentPreviewDialog.js";

export function StudioImageAttachments({
  images,
  onRemove,
  zh,
}: {
  images: Array<StudioImageRef & { dataBase64?: string }>;
  onRemove?: (id: string) => void;
  zh: boolean;
}) {
  const [preview, setPreview] = useState<string>();
  const selected = images.find((v) => v.id === preview);
  return (
    <div className="flex flex-wrap gap-2 px-3 py-2" data-testid="studio-image-attachments">
      {images.map((image) => (
        <div key={image.id} className="relative w-24 rounded-lg border border-border p-1">
          <button
            type="button"
            className="w-full text-left"
            onClick={() => setPreview(image.id)}
            disabled={!image.dataBase64}
            aria-label={`${zh ? "预览" : "Preview"} ${image.filename}`}
          >
            {image.dataBase64 ? (
              <img
                className="h-16 w-full rounded-md object-contain"
                src={`data:${image.mimeType};base64,${image.dataBase64}`}
                alt={image.filename}
              />
            ) : (
              <span className="block text-ui-xs">
                {zh ? "图片内容已失效，请重新添加" : "Image unavailable; add it again"}
              </span>
            )}
            <span className="block truncate text-ui-xs" title={image.filename}>
              {image.filename}
            </span>
          </button>
          {onRemove && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="absolute -right-1 -top-1"
              aria-label={`${zh ? "移除" : "Remove"} ${image.filename}`}
              onClick={() => onRemove(image.id)}
            >
              <X className="size-3" />
            </Button>
          )}
        </div>
      ))}
      <ChatMediaAttachmentPreviewDialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setPreview(undefined);
        }}
        attachment={
          selected?.dataBase64
            ? {
                filename: selected.filename,
                mediaType: selected.mimeType,
                url: `data:${selected.mimeType};base64,${selected.dataBase64}`,
              }
            : null
        }
      />
    </div>
  );
}
