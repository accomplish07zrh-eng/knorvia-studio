import { useState } from "react";
import {
  HANDOFF_FIELD_KEYS,
  editHandoffRecord,
  handoffFieldLimit,
  type HandoffFieldKey,
  type SessionHandoffRecord,
} from "@knorvia/shared";
import { Button } from "@/components/ui/button.js";
import { Textarea } from "@/components/ui/textarea.js";
import { HANDOFF_FIELD_LABELS } from "./taskHandoff.js";

/** Explicit save keeps durable task notes separate from one-off full-text redaction. */
export function HandoffTaskEditor({
  record,
  zh,
  disabled,
  onSave,
}: {
  record: SessionHandoffRecord;
  zh: boolean;
  disabled: boolean;
  onSave: (record: SessionHandoffRecord) => void;
}) {
  const [fields, setFields] = useState(
    () =>
      Object.fromEntries(
        HANDOFF_FIELD_KEYS.map((key) => [key, record.fields[key]?.text ?? ""]),
      ) as Record<HandoffFieldKey, string>,
  );
  const [references, setReferences] = useState(record.references.join("\n"));
  const refs = references
    .split("\n")
    .map((ref) => ref.trim())
    .filter(Boolean);
  const refsInvalid = refs.length > 20 || refs.some((ref) => ref.length > 240);
  return (
    <details className="grid gap-2 text-ui-sm">
      <summary className="cursor-pointer">
        {zh ? "持久任务记录（本机保存）" : "Durable task notes (saved locally)"}
      </summary>
      <div className="mt-2 grid max-h-64 gap-2 overflow-y-auto pr-1">
        <p className="text-foreground-subtle">
          {zh
            ? "只有已加载的首个用户目标可自动摘录。其他字段由你补充；保存会刷新并替换全文预览。"
            : "Only the loaded original user goal can be captured automatically. Supply other fields yourself. Saving refreshes and replaces the full preview."}
        </p>
        {HANDOFF_FIELD_KEYS.map((key) => (
          <label key={key} className="grid gap-1">
            {HANDOFF_FIELD_LABELS[key][zh ? 0 : 1]}
            <Textarea
              rows={2}
              value={fields[key]}
              maxLength={handoffFieldLimit(key)}
              disabled={disabled}
              onChange={(event) => setFields((old) => ({ ...old, [key]: event.target.value }))}
            />
          </label>
        ))}
        <label className="grid gap-1">
          {zh
            ? "文件／成果相对路径（每行一条，最多 20 条）"
            : "Relative file / artifact paths (one per line, max 20)"}
          <Textarea
            rows={3}
            value={references}
            maxLength={5000}
            disabled={disabled}
            onChange={(event) => setReferences(event.target.value)}
          />
        </label>
        {refsInvalid && (
          <p role="alert">
            {zh
              ? "引用超出条数或每条 240 字符上限"
              : "References exceed count or 240-character path limit"}
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || refsInvalid}
          onClick={() => onSave(editHandoffRecord(record, fields, refs))}
        >
          {zh ? "保存任务记录并刷新预览" : "Save task notes and refresh preview"}
        </Button>
      </div>
    </details>
  );
}
