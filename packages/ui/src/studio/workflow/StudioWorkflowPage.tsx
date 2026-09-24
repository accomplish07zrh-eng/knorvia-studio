import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "../../components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog.js";
import { Input } from "../../components/ui/input.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select.js";
import { useStudioWorkflowStore } from "../../store/studioWorkflowStore.js";
import { useKnorviaIntl } from "../../i18n/IntlProvider.js";
import {
  createWorkflowGraph,
  WORKFLOW_LIMITS,
  WORKFLOW_TEMPLATES,
  type StudioWorkflow,
  type WorkflowTemplate,
} from "./types.js";
import { duplicateWorkflow } from "./workflowDrafts.js";
import { useStudioWorkflows } from "./useStudioWorkflows.js";
import { WorkflowLibrary } from "./WorkflowLibrary.js";
import { WorkflowEditor } from "./WorkflowEditor.js";
import { useWorkflowText } from "./useWorkflowText.js";
import { useWorkflowFiles } from "./useWorkflowFiles.js";
import { createWorkflowActionScope } from "./workflowActionScope.js";

export function StudioWorkflowPage({ workspacePath }: { workspacePath?: string }) {
  const t = useWorkflowText();
  const { locale } = useKnorviaIntl();
  const store = useStudioWorkflowStore();
  const runtime = useStudioWorkflows();
  const files = useWorkflowFiles();
  const service = useRef(runtime.service);
  service.current = runtime.service;
  const [actionScope] = useState(() =>
    createWorkflowActionScope(() => ({
      selectedId: useStudioWorkflowStore.getState().selectedId,
      service: service.current,
    })),
  );
  useEffect(() => {
    actionScope.activate();
    const unsubscribe = useStudioWorkflowStore.subscribe((next, previous) => {
      if (next.selectedId !== previous.selectedId) actionScope.invalidate();
    });
    return () => {
      unsubscribe();
      actionScope.dispose();
    };
  }, [actionScope]);
  useEffect(() => {
    actionScope.invalidate();
  }, [actionScope, runtime.service]);
  const [dialog, setDialog] = useState<{
    kind: "create" | "rename" | "delete";
    workflow?: StudioWorkflow;
  } | null>(null);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<WorkflowTemplate>("blank");
  const [limitError, setLimitError] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [notice, setNotice] = useState("");
  const [importedId, setImportedId] = useState<string | null>(null);
  const creatingId = useRef(crypto.randomUUID());
  const workflow = store.workflows.find((item) => item.id === store.selectedId);
  const openCreate = (initialTemplate: WorkflowTemplate) => {
    setName(t("untitled"));
    setTemplate(initialTemplate);
    setDialog({ kind: "create" });
    creatingId.current = crypto.randomUUID();
    setError("");
  };
  const openRename = (item: StudioWorkflow) => {
    if (busyRef.current) return;
    setError("");
    setName(item.name);
    setDialog({ kind: "rename", workflow: item });
  };
  const duplicate = (item: StudioWorkflow) => {
    if (store.workflows.length >= 200) {
      setLimitError(true);
      return;
    }
    void perform(async (isCurrent) => {
      const copy = duplicateWorkflow(item, t("copyName", { name: item.name }));
      await runtime.save(copy);
      if (isCurrent()) store.select(copy.id);
    });
  };
  const remove = (item: StudioWorkflow) => {
    if (busyRef.current) return;
    setError("");
    setDialog({ kind: "delete", workflow: item });
  };
  const perform = async (operation: (isCurrent: () => boolean) => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const isCurrent = actionScope.capture();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation(isCurrent);
    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const exportFile = (item: StudioWorkflow) =>
    void perform(async (isCurrent) => {
      if ((await files.save(item)) && isCurrent()) setNotice(t("exported"));
    });
  const confirm = () =>
    perform(async (isCurrent) => {
      if (dialog?.kind === "delete" && dialog.workflow) await runtime.remove(dialog.workflow.id);
      else if (dialog?.kind === "rename" && dialog.workflow) {
        const current = useStudioWorkflowStore
          .getState()
          .workflows.find((item) => item.id === dialog.workflow!.id);
        if (!current) throw new Error(t("missingWorkflow"));
        await runtime.save({ ...current, name: name.trim(), updatedAt: Date.now() });
        if (
          useStudioWorkflowStore.getState().workflows.find((item) => item.id === current.id)
            ?.name === current.name
        )
          store.rename(dialog.workflow.id, name);
      } else if (dialog?.kind === "create") {
        if (store.workflows.length >= 200) {
          setLimitError(true);
          return;
        }
        const created: StudioWorkflow = {
          id: creatingId.current,
          name: name.trim(),
          workspacePath: workspacePath ?? "",
          ...createWorkflowGraph(template, locale.startsWith("zh") ? "zh" : "en"),
          updatedAt: Date.now(),
        };
        await runtime.save(created);
        if (isCurrent()) store.select(created.id);
      }
      // 删除和新建成功会改变选中项；只关闭本次提交的确认框。
      setDialog((current) => (current === dialog ? null : current));
    });
  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-col bg-background text-foreground"
      aria-label={t("title")}
      data-testid="studio-workflows"
    >
      <input
        ref={files.input}
        type="file"
        hidden
        accept=".json,application/json"
        aria-label={t("import")}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void perform(async (isCurrent) => {
            if (!runtime.ready || !store.hydrated || store.storageProblem === "corrupt")
              throw new Error(t("notConnected"));
            if (store.workflows.length >= 200) throw new Error(t("limit"));
            const result = await files.read(file, workspacePath);
            await runtime.save(result.workflow);
            if (isCurrent()) {
              setImportedId(result.workflow.id);
              store.select(result.workflow.id);
              setNotice(t(result.issues.length ? "importedDraft" : "imported"));
            }
          });
        }}
      />
      {notice && (
        <div
          role="status"
          className="flex items-center gap-2 border-b border-border px-4 py-2 text-ui-sm text-foreground-subtle"
        >
          <span className="min-w-0 flex-1 break-words">{notice}</span>
          <Button variant="ghost" size="sm" onClick={() => setNotice("")}>
            {t("close")}
          </Button>
        </div>
      )}
      {(error || runtime.error || runtime.importError) && !dialog && (
        <div
          role="alert"
          className="flex items-center gap-2 border-b border-border px-4 py-2 text-ui-sm text-destructive"
        >
          <span className="min-w-0 flex-1 break-words">
            {error || runtime.error || runtime.importError}
          </span>
          {runtime.importError && (
            <Button variant="ghost" size="sm" onClick={runtime.retryImport}>
              {t("retry")}
            </Button>
          )}
        </div>
      )}
      {store.storageProblem && (
        <div
          role="alert"
          className="flex items-start gap-2 border-b border-border bg-surface px-4 py-2 text-ui-sm text-foreground-subtle"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <span className="flex-1">
            {t(store.storageProblem === "corrupt" ? "storageCorrupt" : "storageUnavailable")}
          </span>
          {store.storageProblem !== "corrupt" && (
            <Button variant="outline" size="sm" onClick={store.save}>
              {t("save")}
            </Button>
          )}
        </div>
      )}
      {limitError && (
        <div
          role="alert"
          className="flex items-center justify-between px-4 py-2 text-ui-sm text-warning"
        >
          <span>{t("limit")}</span>
          <Button variant="ghost" size="sm" onClick={() => setLimitError(false)}>
            {t("close")}
          </Button>
        </div>
      )}
      {workflow ? (
        <WorkflowEditor
          key={workflow.id}
          workflow={workflow}
          onBack={() => store.select(null)}
          onRename={openRename}
          onDuplicate={duplicate}
          onDelete={remove}
          onImport={files.open}
          onExport={exportFile}
          initialValidation={importedId === workflow.id}
        />
      ) : (
        <WorkflowLibrary
          workflows={store.workflows}
          disabled={!store.hydrated || store.storageProblem === "corrupt" || !runtime.ready || busy}
          onCreate={openCreate}
          onOpen={store.select}
          onRename={openRename}
          onDuplicate={duplicate}
          onDelete={remove}
          onImport={files.open}
          onExport={exportFile}
        />
      )}
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setDialog(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] max-w-md overflow-y-auto">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void confirm();
            }}
            className="grid gap-4"
          >
            <DialogHeader>
              <DialogTitle>
                {t(
                  dialog?.kind === "create"
                    ? "new"
                    : dialog?.kind === "delete"
                      ? "deleteTitle"
                      : "rename",
                )}
              </DialogTitle>
              <DialogDescription>
                {dialog?.kind === "delete"
                  ? t("deleteDescription", { name: dialog.workflow?.name ?? "" })
                  : t("definitionHint")}
              </DialogDescription>
            </DialogHeader>
            {dialog?.kind !== "delete" && (
              <label className="grid gap-2 text-ui-base">
                {t("name")}
                <Input
                  autoFocus
                  value={name}
                  maxLength={WORKFLOW_LIMITS.name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  disabled={busy}
                />
              </label>
            )}
            {dialog?.kind === "create" && (
              <Select
                value={template}
                onValueChange={(value) => setTemplate(value as WorkflowTemplate)}
                disabled={busy}
              >
                <SelectTrigger className="w-full" aria-label={t("new")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORKFLOW_TEMPLATES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {t(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {error && (
              <p role="alert" className="text-ui-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setDialog(null)}>
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                variant={dialog?.kind === "delete" ? "destructive" : "default"}
                disabled={busy || !runtime.ready || (dialog?.kind !== "delete" && !name.trim())}
              >
                {t(
                  dialog?.kind === "create"
                    ? "create"
                    : dialog?.kind === "delete"
                      ? "delete"
                      : "save",
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
