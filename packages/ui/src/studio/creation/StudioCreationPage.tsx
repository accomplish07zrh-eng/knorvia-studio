import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, LoaderCircle, Settings2, Video } from "lucide-react";
import {
  creationReferenceSlots,
  type CreationJob,
  type CreationKind,
  type CreationModel,
} from "@knorvia/services";
import { Button } from "@/components/ui/button.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { cn } from "@/components/lib/utils.js";
import { StudioCreationModelDialog } from "./StudioCreationModelDialog.js";
import { StudioCreationHistory } from "./StudioCreationHistory.js";
import { CreationAttachments, CreationFileButtons } from "./CreationFiles.js";
import {
  assertCreationFiles,
  CREATION_SLOTS,
  creationFileInputs,
  type CreationFiles,
} from "./creationInput.js";

const NO_FILES: CreationFiles = { reference: null, firstFrame: null, lastFrame: null };

export function StudioCreationPage() {
  const { intl } = useKnorviaIntl();
  const t = useCallback(
    (key: string, values?: Record<string, string>) =>
      intl.formatMessage({ id: `studio.creation.${key}` }, values),
    [intl],
  );
  const creation = useBaseWorkspaceServices().creationService;
  const [kind, setKind] = useState<CreationKind>("image");
  const [models, setModels] = useState<CreationModel[]>([]);
  const [jobs, setJobs] = useState<CreationJob[]>([]);
  const [modelId, setModelId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<CreationFiles>(NO_FILES);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [managing, setManaging] = useState(false);
  const [pendingCancel, setPendingCancel] = useState<string | null>(null);
  const [pendingRetry, setPendingRetry] = useState<string | null>(null);
  const pendingRequest = useRef<{ signature: string; id: string; files: CreationFiles } | null>(
    null,
  );
  const draftEpoch = useRef(0);
  const submittingRef = useRef(false);

  const refresh = useCallback(
    async (clearError = false) => {
      if (!creation) {
        setError("当前运行环境尚未提供创作服务");
        setLoading(false);
        return;
      }
      try {
        const [modelItems, jobItems] = await Promise.all([
          creation.listModels(),
          creation.listJobs(),
        ]);
        setModels(modelItems);
        setJobs(jobItems);
        if (clearError) setError("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoading(false);
      }
    },
    [creation],
  );

  useEffect(() => {
    void refresh(true);
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  const availableModels = useMemo(
    () => models.filter((model) => model.kind === kind && model.enabled && model.configured),
    [models, kind],
  );
  const selectedModel = availableModels.find((model) => model.id === modelId) ?? availableModels[0];
  const referenceSlots = selectedModel ? creationReferenceSlots(selectedModel) : null;
  // 修改草稿（文字、模型、参考图）都推进 epoch，迟到的提交结果不会清掉新输入。
  const editDraft = (clearFiles: boolean) => {
    draftEpoch.current++;
    if (clearFiles) setFiles(NO_FILES);
  };

  const submit = async () => {
    if (!creation || submittingRef.current || !selectedModel || !prompt.trim()) return;
    submittingRef.current = true;
    const submittedEpoch = draftEpoch.current;
    setSubmitting(true);
    setError("");
    try {
      assertCreationFiles(files, referenceSlots);
      const normalizedPrompt = prompt.trim();
      const signature = JSON.stringify([kind, selectedModel.id, normalizedPrompt]);
      if (
        pendingRequest.current?.signature !== signature ||
        CREATION_SLOTS.some((slot) => pendingRequest.current?.files[slot] !== files[slot])
      )
        pendingRequest.current = { signature, id: crypto.randomUUID(), files };
      const requestId = pendingRequest.current.id;
      const job = await creation.createJob({
        requestId,
        kind,
        modelId: selectedModel.id,
        prompt: normalizedPrompt,
        ...(await creationFileInputs(files)),
      });
      setJobs((items) => [job, ...items.filter((item) => item.id !== job.id)]);
      if (draftEpoch.current === submittedEpoch) {
        setPrompt("");
        setFiles(NO_FILES);
      }
      pendingRequest.current = null;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const retry = async (job: CreationJob) => {
    if (!creation || pendingRetry || job.status !== "failed") return;
    setPendingRetry(job.id);
    setError("");
    try {
      const created = await creation.retryJob(job.id);
      setJobs((items) => [created, ...items.filter((item) => item.id !== created.id)]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPendingRetry(null);
    }
  };

  const cancel = async (job: CreationJob) => {
    if (!creation || pendingCancel) return;
    setPendingCancel(job.id);
    setError("");
    try {
      const changed = await creation.cancelJob(job.id);
      setJobs((items) => items.map((item) => (item.id === changed.id ? changed : item)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPendingCancel(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-5 py-3">
        <div
          className="flex items-center gap-1 rounded-lg bg-surface p-1"
          role="group"
          aria-label={t("title")}
        >
          {(["image", "video"] as const).map((item) => {
            const Icon = item === "image" ? Image : Video;
            return (
              <button
                key={item}
                type="button"
                aria-pressed={kind === item}
                onClick={() => {
                  editDraft(true);
                  setKind(item);
                }}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-ui-base transition-colors",
                  kind === item
                    ? "bg-card text-foreground shadow-xs"
                    : "text-foreground-subtle hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {t(item)}
              </button>
            );
          })}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setManaging(true)}>
          <Settings2 className="size-4" aria-hidden="true" />
          {t("models")}
        </Button>
      </div>

      <StudioCreationHistory
        jobs={jobs}
        models={models}
        draftKind={kind}
        pendingCancel={pendingCancel}
        pendingRetry={pendingRetry}
        onCancel={(job) => void cancel(job)}
        onRetry={(job) => void retry(job)}
        onReuse={(job) => {
          editDraft(true);
          setPrompt(job.prompt);
          pendingRequest.current = null;
        }}
      />
      <div className="shrink-0 border-t border-border/50 bg-background px-4 py-4 md:px-8">
        <div className="mx-auto w-full max-w-3xl">
          {!loading && !availableModels.length ? (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-ui-sm text-foreground-subtle">
              <span>{t("noModel", { kind: t(kind) })}</span>
              <Button variant="outline" size="sm" onClick={() => setManaging(true)}>
                {t("configure")}
              </Button>
            </div>
          ) : null}
          <div className="rounded-xl border border-input-border bg-card shadow-sm focus-within:border-input-border-focused">
            <Textarea
              value={prompt}
              onChange={(event) => {
                editDraft(false);
                setPrompt(event.target.value);
              }}
              maxLength={8000}
              rows={3}
              placeholder={t(kind === "image" ? "imageHint" : "videoHint")}
              aria-label={t(kind === "image" ? "imageHint" : "videoHint")}
              className="min-h-24 resize-y border-0 bg-transparent px-4 py-3 shadow-none focus-visible:ring-0"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
            <CreationAttachments
              files={files}
              t={t}
              onRemove={(slot) => {
                editDraft(false);
                setFiles((current) => ({ ...current, [slot]: null }));
              }}
            />
            <div className="flex flex-wrap items-center gap-2 border-t border-border/40 px-3 py-2">
              <CreationFileButtons
                t={t}
                enabled={{
                  reference: Boolean(referenceSlots?.image),
                  firstFrame: Boolean(referenceSlots?.firstFrame),
                  lastFrame: Boolean(referenceSlots?.lastFrame),
                }}
                onPick={(slot, file) => {
                  editDraft(false);
                  setFiles((current) => ({ ...current, [slot]: file }));
                }}
              />
              <div className="min-w-0 flex-1" />
              {availableModels.length ? (
                <label className="flex min-w-0 items-center gap-2 text-ui-sm text-foreground-subtle">
                  <span className="sr-only">{t("model")}</span>
                  <select
                    value={selectedModel?.id ?? ""}
                    onChange={(event) => {
                      editDraft(true);
                      setModelId(event.target.value);
                    }}
                    className="max-w-48 rounded-md border border-border bg-background px-2 py-1.5 text-ui-sm text-foreground"
                  >
                    {availableModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <Button
                size="sm"
                disabled={!creation || !selectedModel || !prompt.trim() || submitting}
                onClick={() => void submit()}
              >
                {submitting ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                {t(submitting ? "generating" : "generate")}
              </Button>
            </div>
          </div>
          <div className="mt-2 flex items-start justify-between gap-3 text-ui-xs text-foreground-subtle">
            <span>{t("note")}</span>
            {error ? (
              <button
                type="button"
                className="text-destructive underline"
                onClick={() => void refresh(true)}
              >
                {error} · {t("retry")}
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <StudioCreationModelDialog
        open={managing}
        onOpenChange={setManaging}
        models={models}
        initialKind={kind}
        onSaved={() => {
          editDraft(false);
          void refresh(true);
        }}
      />
    </div>
  );
}
