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
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { createAgentConversationTransport } from "@/v4/agentConversationTransport.js";
import { studioKernelOption } from "../types.js";
import {
  buildStudioHandoffDraft,
  availableHandoffTargets,
  createNativeHandoffAttempt,
  performNativeHandoff,
  performStudioHandoff,
  saveHandoffMarkdownWithDialog,
  studioExportFileName,
  type NativeHandoffAttempt,
  type StudioHandoffAttempt,
} from "./sessionHandoff.js";
import { UiAsyncActionGate } from "./uiAsyncActionGate.js";

export function StudioSessionActions({
  service,
  messages,
  exportTranscript,
  sourceKernel,
  workspacePath,
  title,
  statuses,
  handoffDisabled = false,
  onHandoffComplete,
  onNativeHandoffComplete,
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
  onNativeHandoffComplete?: (sessionId: string, workspacePath: string) => void;
}) {
  const { locale } = useKnorviaIntl();
  const zh = locale.startsWith("zh");
  const platform = usePlatform();
  const nativeAgentService = useBaseWorkspaceServices().agentService;
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<StudioKernelId | "">("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const pending = useRef<StudioHandoffAttempt | NativeHandoffAttempt | null>(null);
  const handoffGate = useRef(new UiAsyncActionGate());
  const exportGate = useRef(new UiAsyncActionGate());
  const sourceName = studioKernelOption(sourceKernel, statuses).name;
  useEffect(() => {
    handoffGate.current.activate();
    exportGate.current.activate();
    pending.current = null;
    setBusy(false);
    setExporting(false);
    return () => {
      handoffGate.current.deactivate();
      exportGate.current.deactivate();
    };
  }, [service, nativeAgentService, sourceKernel, workspacePath]);
  const targets = availableHandoffTargets(
    statuses,
    sourceKernel,
    Boolean(nativeAgentService && onNativeHandoffComplete),
  );
  const canHandoff = Boolean(
    (service || (nativeAgentService && onNativeHandoffComplete)) &&
    messages.some((message) => message.kind === "text" && message.sender !== "system") &&
    workspacePath &&
    !sourceKernel.startsWith("ssh:") &&
    !handoffDisabled &&
    targets.length,
  );

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
  const confirm = () => {
    if (!target || !draft.trim()) return;
    handoffGate.current.run(
      async () => {
        const attempt =
          pending.current ??
          (target === "knorvia"
            ? createNativeHandoffAttempt({ sourceKernel, workspacePath, text: draft })
            : {
                targetId: crypto.randomUUID(),
                sourceKernel,
                targetKernel: target,
                workspacePath,
                text: draft,
              });
        pending.current = attempt;
        if ("envelope" in attempt) {
          if (!nativeAgentService || !onNativeHandoffComplete)
            throw new Error("原生会话服务暂不可用");
          const transport = createAgentConversationTransport(nativeAgentService, {
            workspacePath: attempt.workspacePath,
          });
          const sessionId = await performNativeHandoff(transport.sendCommand, attempt);
          return { kind: "native" as const, sessionId, workspacePath: attempt.workspacePath };
        } else {
          if (!service) throw new Error("Studio Runtime 暂不可用");
          await performStudioHandoff(service, attempt);
          return {
            kind: "external" as const,
            kernel: attempt.targetKernel,
            sessionId: attempt.targetId,
          };
        }
      },
      {
        onStart: () => {
          setBusy(true);
          setError("");
        },
        onSuccess: (result) => {
          if (result.kind === "native")
            onNativeHandoffComplete?.(result.sessionId, result.workspacePath);
          else onHandoffComplete(result.kernel, result.sessionId);
        },
        onError: (cause) => setError(cause instanceof Error ? cause.message : String(cause)),
        onSettled: () => setBusy(false),
      },
    );
  };
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
          if (!next && !handoffGate.current.isRunning) setOpen(false);
        }}
      >
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
              <Select
                value={target}
                onValueChange={(value) => setTarget(value as StudioKernelId)}
                disabled={busy || Boolean(pending.current)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={zh ? "选择已可用内核" : "Choose an available kernel"} />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((status) => (
                    <SelectItem key={status.id} value={status.id}>
                      {studioKernelOption(status.id, statuses).name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1 text-ui-sm">
              {zh ? "可编辑摘要" : "Editable summary"}
              <Textarea
                value={draft}
                maxLength={20_000}
                rows={10}
                disabled={busy || Boolean(pending.current)}
                onChange={(event) => setDraft(event.target.value)}
              />
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
                if (!handoffGate.current.isRunning) setOpen(false);
              }}
            >
              {zh ? "取消" : "Cancel"}
            </Button>
            <Button
              type="button"
              disabled={busy || !target || !draft.trim()}
              onClick={() => void confirm()}
            >
              {pending.current
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
