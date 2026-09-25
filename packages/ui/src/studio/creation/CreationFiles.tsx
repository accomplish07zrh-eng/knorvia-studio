import { useRef } from "react";
import { Image, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  CREATION_IMAGE_TYPES,
  CREATION_SLOTS,
  type CreationFiles,
  type CreationSlot,
} from "./creationInput.js";

type Text = (key: string) => string;

/** 已附加的参考图与首尾帧；参考图不带槽位标签，首尾帧显示槽位名。 */
export function CreationAttachments(props: {
  files: CreationFiles;
  onRemove: (slot: CreationSlot) => void;
  t: Text;
}) {
  const { files, onRemove, t } = props;
  return CREATION_SLOTS.map((slot) => {
    const file = files[slot];
    if (!file) return null;
    const frame = slot !== "reference";
    return (
      <div
        key={slot}
        className="flex items-center gap-2 px-4 pb-2 text-ui-sm text-foreground-subtle"
      >
        <Image className="size-4" aria-hidden="true" />
        {frame ? <span className="shrink-0">{t(slot)}</span> : null}
        <span className="max-w-52 truncate">{file.name}</span>
        <button
          type="button"
          aria-label={frame ? `${t("removeReference")} ${t(slot)}` : t("removeReference")}
          onClick={() => onRemove(slot)}
          className={
            frame ? "rounded-full p-1 hover:bg-surface-hover" : "rounded p-1 hover:bg-surface-hover"
          }
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  });
}

/** 隐藏的文件选择框与各槽位的添加按钮；只显示当前模型支持的槽位。 */
export function CreationFileButtons(props: {
  enabled: Record<CreationSlot, boolean>;
  onPick: (slot: CreationSlot, file: File | null) => void;
  t: Text;
}) {
  const { enabled, onPick, t } = props;
  const inputs = {
    reference: useRef<HTMLInputElement>(null),
    firstFrame: useRef<HTMLInputElement>(null),
    lastFrame: useRef<HTMLInputElement>(null),
  };
  return (
    <>
      {CREATION_SLOTS.map((slot) => (
        <input
          key={slot}
          ref={inputs[slot]}
          type="file"
          accept={CREATION_IMAGE_TYPES.join(",")}
          className="hidden"
          onChange={(event) => {
            onPick(slot, event.target.files?.[0] ?? null);
            event.target.value = "";
          }}
        />
      ))}
      {CREATION_SLOTS.map((slot) =>
        enabled[slot] ? (
          <Button
            key={slot}
            variant="ghost"
            size="sm"
            title={t(slot === "reference" ? "referenceHint" : "frameHint")}
            onClick={() => inputs[slot].current?.click()}
          >
            <Plus className="size-4" aria-hidden="true" />
            {t(slot)}
          </Button>
        ) : null,
      )}
    </>
  );
}
