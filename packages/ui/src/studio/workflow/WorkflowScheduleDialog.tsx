import { useEffect, useState } from "react";
import { useServices } from "@/hooks/useServices.js";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { Input } from "@/components/ui/input.js";
import { Textarea } from "@/components/ui/textarea.js";
import type { StudioWorkflow } from "./types.js";
import { validateWorkflowGraph } from "./graph.js";
import { useWorkflowText } from "./useWorkflowText.js";

export function WorkflowScheduleDialog({
  workflow,
  open,
  saved,
  onClose,
}: {
  workflow: StudioWorkflow;
  open: boolean;
  saved: boolean;
  onClose: () => void;
}) {
  const t = useWorkflowText();
  const { agentService } = useServices();
  const [title, setTitle] = useState(() => t("scheduleDefaultTitle", { name: workflow.name }));
  const [prompt, setPrompt] = useState(() => t("scheduleDefaultInput"));
  const [time, setTime] = useState("09:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(false);
  useEffect(() => {
    if (open) {
      setError("");
      setCreated(false);
    }
  }, [open]);
  const submit = async () => {
    if (busy || !saved || !workflow.workspacePath || validateWorkflowGraph(workflow).length) return;
    const parts = /^(\d{2}):(\d{2})$/.exec(time);
    if (!parts || Number(parts[1]) > 23 || Number(parts[2]) > 59 || !title.trim() || !prompt.trim())
      return;
    setBusy(true);
    setError("");
    try {
      await agentService.createAutomation({
        title: title.trim(),
        prompt: prompt.trim(),
        cronExpr: `${Number(parts[2])} ${Number(parts[1])} * * *`,
        recurring: true,
        workspacePath: workflow.workspacePath,
        studioWorkflowId: workflow.id,
      });
      setCreated(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("schedule")}</DialogTitle>
          <DialogDescription>{t("scheduleDescription")}</DialogDescription>
        </DialogHeader>
        {created ? (
          <p role="status" className="text-ui-sm">
            {t("scheduleCreated")}
          </p>
        ) : (
          <div className="grid gap-3">
            <label className="grid gap-1 text-ui-sm">
              {t("scheduleTitle")}
              <Input
                value={title}
                maxLength={100}
                onChange={(event) => setTitle(event.target.value)}
                disabled={busy}
              />
            </label>
            <label className="grid gap-1 text-ui-sm">
              {t("scheduleTime")}
              <Input
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                disabled={busy}
              />
            </label>
            <label className="grid gap-1 text-ui-sm">
              {t("scheduleInput")}
              <Textarea
                value={prompt}
                maxLength={32000}
                onChange={(event) => setPrompt(event.target.value)}
                disabled={busy}
              />
            </label>
            {error && (
              <p role="alert" className="text-ui-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t("close")}
          </Button>
          {!created && (
            <Button
              disabled={busy || !saved || !title.trim() || !prompt.trim()}
              onClick={() => void submit()}
            >
              {t("scheduleCreate")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
