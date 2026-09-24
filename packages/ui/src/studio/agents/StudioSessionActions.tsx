import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, Download } from "lucide-react";
import type {
  IStudioRuntimeService,
  StudioKernelId,
  StudioKernelStatus,
  StudioMessage,
} from "@knorvia/services";
import { Button } from "@/components/ui/button.js";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { studioKernelOption } from "../types.js";
import {
  buildStudioHandoffDraft,
  performStudioHandoff,
  studioExportFileName,
  type StudioHandoffAttempt,
} from "./sessionHandoff.js";

export function StudioSessionActions({
  service, messages, exportTranscript, sourceKernel, workspacePath, title, statuses, handoffDisabled = false, onHandoffComplete,
}: {
  service: IStudioRuntimeService | undefined;
  messages: readonly StudioMessage[];
  exportTranscript: () => Promise<string>;
  sourceKernel: StudioKernelId;
  workspacePath: string;
  title: string;
  statuses: readonly StudioKernelStatus[];
  handoffDisabled?: boolean;
  onHandoffComplete: (kernel: StudioKernelId, sessionId: string) => void;
}) {
  const { locale } = useKnorviaIntl();
  const zh = locale.startsWith("zh");
  const platform = usePlatform();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<StudioKernelId | "">("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const pending = useRef<StudioHandoffAttempt | null>(null);
  const active = useRef(true);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const exportInFlight = useRef(false);
  const sourceName = studioKernelOption(sourceKernel, statuses).name;
  useEffect(() => {
    active.current = true;
    const current = ++generation.current;
    inFlight.current = false;
    exportInFlight.current = false;
    setBusy(false);
    setExporting(false);
    return () => {
      if (generation.current === current) active.current = false;
    };
  }, [service, sourceKernel, workspacePath]);
  const targets = statuses.filter((status) =>
    status.installed && !status.error && status.id !== sourceKernel &&
    status.id !== "knorvia" && !status.id.startsWith("ssh:"));
  const canHandoff = Boolean(service && messages.some((message) =>
    message.kind === "text" && message.sender !== "system") &&
    workspacePath && !sourceKernel.startsWith("ssh:") && !handoffDisabled && targets.length);

  const start = () => {
    if (!canHandoff) return;
    if (pending.current) {
      setTarget(pending.current.targetKernel);
      setDraft(pending.current.text);
    } else {
      setTarget("");
      setDraft(buildStudioHandoffDraft(messages, sourceName, zh).text);
    }
    setError("");
    setOpen(true);
  };
  const confirm = async () => {
    if (inFlight.current || !service || !target || !draft.trim()) return;
    const attempt = pending.current ?? {
      targetId: crypto.randomUUID(), sourceKernel, targetKernel: target,
      workspacePath, text: draft,
    };
    pending.current = attempt;
    inFlight.current = true;
    const current = generation.current;
    setBusy(true);
    setError("");
    try {
      await performStudioHandoff(service, attempt);
      if (active.current && generation.current === current)
        onHandoffComplete(attempt.targetKernel, attempt.targetId);
    } catch (cause) {
      if (active.current && generation.current === current)
        setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (generation.current === current) {
        inFlight.current = false;
        if (active.current) setBusy(false);
      }
    }
  };
  const exportMarkdown = async () => {
    if (exportInFlight.current) return;
    exportInFlight.current = true;
    const current = generation.current;
    setExporting(true);
    setExportStatus("");
    try {
      const markdown = await exportTranscript();
      const bytes = new TextEncoder().encode(markdown);
      const suggestedName = studioExportFileName(title);
      if (platform.saveFile) {
        const result = await platform.saveFile({ data: bytes.buffer as ArrayBuffer, suggestedName });
        if (result.canceled) return;
        if (!result.success) throw new Error(result.error || "保存失败");
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
      if (active.current && generation.current === current)
        setExportStatus(zh ? "已导出 Markdown" : "Markdown exported");
    } catch (cause) {
      if (active.current && generation.current === current)
        setExportStatus(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (generation.current === current) {
        exportInFlight.current = false;
        if (active.current) setExporting(false);
      }
    }
  };
  return (
    <>
      <div className="flex shrink-0 items-center justify-end gap-1 border-b border-border px-3 py-1">
        <Button type="button" variant="ghost" size="sm" disabled={!canHandoff} onClick={start}>
          <ArrowRightLeft className="size-3.5" />
          {zh ? "交给其他内核" : "Hand off"}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={exporting} onClick={() => void exportMarkdown()}>
          <Download className="size-3.5" />
          {zh ? "导出 Markdown" : "Export Markdown"}
        </Button>
        {exportStatus && <span role="status" className="max-w-48 truncate text-ui-xs text-foreground-subtle" title={exportStatus}>{exportStatus}</span>}
      </div>
      <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) setOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{zh ? "交给其他内核继续" : "Continue with another kernel"}</DialogTitle>
            <DialogDescription>
              {zh
                ? "以下摘要只取当前已加载的可见消息，不含私有记忆或工具原始输出。检查并编辑后才会发给新会话。"
                : "This draft uses loaded visible messages only, without private memory or raw tool output. Review it before sending to a new conversation."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1 text-ui-sm">
              {zh ? "目标内核" : "Target kernel"}
              <Select value={target} onValueChange={(value) => setTarget(value as StudioKernelId)} disabled={busy || Boolean(pending.current)}>
                <SelectTrigger><SelectValue placeholder={zh ? "选择已可用内核" : "Choose an available kernel"} /></SelectTrigger>
                <SelectContent>{targets.map((status) => (
                  <SelectItem key={status.id} value={status.id}>{studioKernelOption(status.id, statuses).name}</SelectItem>
                ))}</SelectContent>
              </Select>
            </label>
            <label className="grid gap-1 text-ui-sm">
              {zh ? "可编辑摘要" : "Editable summary"}
              <Textarea value={draft} maxLength={20_000} rows={10} disabled={busy || Boolean(pending.current)} onChange={(event) => setDraft(event.target.value)} />
            </label>
            {error && <p role="alert" className="text-ui-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>{zh ? "取消" : "Cancel"}</Button>
            <Button type="button" disabled={busy || !target || !draft.trim()} onClick={() => void confirm()}>
              {pending.current ? (zh ? "重试接力" : "Retry handoff") : (zh ? "确认并发送" : "Confirm and send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
