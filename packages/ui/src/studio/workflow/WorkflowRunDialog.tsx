import { useRef } from "react";
import { useStudioWorkflowStore } from "../../store/studioWorkflowStore.js";
import { Button } from "../../components/ui/button.js";
import { Textarea } from "../../components/ui/textarea.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog.js";
import { useWorkflowText } from "./useWorkflowText.js";

export function WorkflowRunDialog({
  open,
  onClose,
  onRun,
  busy,
  error,
  workflowId,
}: {
  open: boolean;
  onClose: () => void;
  onRun: (input: string) => Promise<boolean>;
  busy: boolean;
  error?: string;
  workflowId: string;
}) {
  const t = useWorkflowText();
  const input = useStudioWorkflowStore((state) => state.inputDrafts[workflowId] ?? "");
  const saveInput = useStudioWorkflowStore((state) => state.saveInput);
  const submitting = useRef(false);
  const submit = async () => {
    if (busy || submitting.current) return;
    submitting.current = true;
    try {
      if (await onRun(input)) {
        // 重开仍保留未提交输入，ACK 也不能清掉其他窗口/随后输入的新草稿。
        if (useStudioWorkflowStore.getState().inputDrafts[workflowId] === input)
          saveInput(workflowId, "");
        onClose();
      }
    } finally {
      submitting.current = false;
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("run")}</DialogTitle>
          <DialogDescription>{t("inputHint")}</DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          value={input}
          onChange={(event) => saveInput(workflowId, event.target.value)}
          disabled={busy}
          aria-label={t("input")}
          placeholder={t("inputPlaceholder")}
          maxLength={32000}
          className="min-h-28"
          onKeyDown={(event) => {
            if (
              (event.ctrlKey || event.metaKey) &&
              event.key === "Enter" &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        {error && (
          <p role="alert" className="text-ui-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button disabled={busy} onClick={() => void submit()}>
            {t("run")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
