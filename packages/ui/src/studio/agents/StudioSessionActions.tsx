import { useEffect, useRef, useState } from "react";
import { HANDOFF_TEXT_LIMIT } from "@knorvia/shared";
import { ArrowRightLeft, Download } from "lucide-react";
import type { StudioKernelId } from "@knorvia/services";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { studioKernelOption } from "../types.js";
import { saveHandoffMarkdownWithDialog, studioExportFileName } from "./sessionHandoff.js";
import { useSessionHandoff, type SessionHandoffInput } from "./useSessionHandoff.js";
import { UiAsyncActionGate } from "./uiAsyncActionGate.js";
import { HandoffTaskEditor } from "./HandoffTaskEditor.js";

export function StudioSessionActions(
  props: SessionHandoffInput & {
    title: string;
    exportTranscript: () => Promise<string>;
  },
) {
  const {
    title,
    exportTranscript,
    service,
    sourceKernel,
    sourceSessionId,
    workspacePath,
    workspaceIdentity,
  } = props;
  const { locale } = useKnorviaIntl();
  const zh = locale.startsWith("zh");
  const platform = usePlatform();
  const {
    open,
    target,
    setTarget,
    draft,
    busy,
    previewing,
    draftEdited,
    previewRecord,
    error,
    notesError,
    storageIssue,
    dirty,
    targets,
    canHandoff,
    start,
    close,
    confirm,
    saveNotes,
    refreshPreview,
    hasPending,
    editDraft,
    retrySave,
  } = useSessionHandoff(props);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const exportGate = useRef(new UiAsyncActionGate());
  useEffect(() => {
    exportGate.current.activate();
    setExporting(false);
    return () => exportGate.current.deactivate();
  }, [service, sourceKernel, sourceSessionId, workspacePath, workspaceIdentity]);
  const exportMarkdown = () => {
    exportGate.current.run(
      async () => {
        const markdown = await exportTranscript();
        const bytes = new TextEncoder().encode(markdown);
        const suggestedName = studioExportFileName(title);
        if (platform.saveFile) {
          return saveHandoffMarkdownWithDialog(platform.saveFile, bytes, suggestedName);
        } else {
          const url = URL.createObjectURL(new Blob([bytes], { type: "text/markdown" }));
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = suggestedName;
          document.body.append(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        return true;
      },
      {
        onStart: () => {
          setExporting(true);
          setExportStatus("");
        },
        onSuccess: (saved) => {
          if (saved) setExportStatus(zh ? "已导出 Markdown" : "Markdown exported");
        },
        onError: (cause) => setExportStatus(cause instanceof Error ? cause.message : String(cause)),
        onSettled: () => setExporting(false),
      },
    );
  };
  return (
    <>
      <div className="flex shrink-0 items-center justify-end gap-1 border-b border-border px-3 py-1">
        <Button type="button" variant="ghost" size="sm" disabled={!canHandoff} onClick={start}>
          <ArrowRightLeft className="size-3.5" />
          {zh ? "交给其他内核" : "Hand off"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={exporting}
          onClick={() => void exportMarkdown()}
        >
          <Download className="size-3.5" />
          {zh ? "导出 Markdown" : "Export Markdown"}
        </Button>
        {exportStatus && (
          <span
            role="status"
            className="max-w-48 truncate text-ui-xs text-foreground-subtle"
            title={exportStatus}
          >
            {exportStatus}
          </span>
        )}
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <DialogContent className="flex max-h-[90dvh] max-w-lg flex-col">
          <DialogHeader>
            <DialogTitle>{zh ? "交给其他内核继续" : "Continue with another kernel"}</DialogTitle>
            <DialogDescription>
              {zh
                ? "持久任务记录与已加载的可见摘录将交给新会话。缺失项需补充；检查并编辑后才发送，不转换模型私有状态。"
                : "Durable task notes and loaded visible excerpts go to a new conversation. Supply missing context, then review and edit before sending. Private model state is not converted."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 gap-3 overflow-y-auto pr-1">
            {previewing && (
              <p role="status">
                {zh ? "正在刷新预览与核验引用…" : "Refreshing preview and checking references…"}
              </p>
            )}
            {previewRecord && (
              <HandoffTaskEditor
                key={JSON.stringify(previewRecord)}
                record={previewRecord}
                zh={zh}
                disabled={busy || previewing || hasPending}
                onSave={saveNotes}
              />
            )}
            {previewRecord && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy || previewing || hasPending}
                onClick={() => refreshPreview(previewRecord)}
              >
                {zh ? "刷新预览（替换全文编辑）" : "Refresh preview (replace full-text edits)"}
              </Button>
            )}
            {(notesError || storageIssue || dirty) && (
              <div role="alert" className="text-ui-sm text-foreground-subtle">
                <p>
                  {notesError ||
                    (zh
                      ? "本机任务记录尚未成功持久化；重载可能丢失未保存内容。"
                      : "Local task notes have not been persisted; reload may lose unsaved context.")}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || previewing}
                  onClick={() => {
                    retrySave();
                  }}
                >
                  {zh ? "重试保存" : "Retry saving"}
                </Button>
              </div>
            )}
            <label className="grid gap-1 text-ui-sm">
              {zh ? "目标内核" : "Target kernel"}
              <Select
                value={target}
                onValueChange={(value) => setTarget(value as StudioKernelId)}
                disabled={busy || previewing || hasPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder={zh ? "选择已可用内核" : "Choose an available kernel"} />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((status) => (
                    <SelectItem key={status.id} value={status.id}>
                      {studioKernelOption(status.id, props.statuses).name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1 text-ui-sm">
              {zh ? "可编辑摘要" : "Editable summary"}
              <Textarea
                aria-label={zh ? "可编辑摘要" : "Editable summary"}
                className="field-sizing-fixed min-h-40 max-h-64 resize-y"
                value={draft}
                maxLength={HANDOFF_TEXT_LIMIT}
                rows={10}
                disabled={busy || previewing || hasPending}
                onChange={(event) => {
                  editDraft(event.target.value);
                }}
              />
              <span className="text-ui-xs text-foreground-subtle">
                {draft.length} / {HANDOFF_TEXT_LIMIT} {zh ? "字符" : "characters"}
                {draftEdited ? (zh ? " · 全文已由用户编辑" : " · Full text edited by user") : ""}
              </span>
            </label>
            {error && (
              <p role="alert" className="text-ui-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                close();
              }}
            >
              {zh ? "取消" : "Cancel"}
            </Button>
            <Button
              type="button"
              disabled={
                busy || previewing || !target || !draft.trim() || draft.length > HANDOFF_TEXT_LIMIT
              }
              onClick={() => void confirm()}
            >
              {hasPending
                ? zh
                  ? "重试接力"
                  : "Retry handoff"
                : zh
                  ? "确认并发送"
                  : "Confirm and send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
