import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type {
  CreationKind,
  CreationModel,
  CreationModelInput,
  CreationProtocol,
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
import { Input } from "@/components/ui/input.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { cn } from "@/components/lib/utils.js";

const DEFAULT_MAPPING = {
  requestPath: "/generate",
  requestTemplate: '{"model":"{{model}}","prompt":"{{prompt}}"}',
  outputPath: "data.0.url",
};

function emptyModel(kind: CreationKind): CreationModelInput {
  return {
    name: "",
    kind,
    protocol: kind === "image" ? "openai-images" : "json-api",
    baseUrl: kind === "image" ? "https://api.openai.com" : "",
    model: "",
    enabled: true,
    apiKey: "",
    apiMapping: { ...DEFAULT_MAPPING },
  };
}

function editModel(model: CreationModel): CreationModelInput {
  return {
    id: model.id,
    name: model.name,
    kind: model.kind,
    protocol: model.protocol,
    baseUrl: model.baseUrl,
    model: model.model,
    enabled: model.enabled,
    workflowJson: model.workflowJson ?? "",
    apiMapping: model.apiMapping ?? { ...DEFAULT_MAPPING },
    apiKey: "",
  };
}

export function StudioCreationModelDialog({
  open,
  onOpenChange,
  models,
  initialKind,
  onSaved,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  models: CreationModel[];
  initialKind: CreationKind;
  onSaved(): void;
}) {
  const { intl } = useKnorviaIntl();
  const t = (key: string) => intl.formatMessage({ id: `studio.creation.${key}` });
  const service = useBaseWorkspaceServices().creationService;
  const [draft, setDraft] = useState<CreationModelInput>(() => emptyModel(initialKind));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!draft.id) setDraft(emptyModel(initialKind));
    // 重新打开对话框时不保留危险操作的确认状态。
    setConfirmDelete(false);
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在打开时初始化，新输入过程不应重置表单。
  }, [open]);

  const patch = (change: Partial<CreationModelInput>) =>
    setDraft((previous) => ({ ...previous, ...change }));
  const patchMapping = (change: Partial<NonNullable<CreationModelInput["apiMapping"]>>) =>
    setDraft((previous) => ({
      ...previous,
      apiMapping: {
        ...(previous.apiMapping ?? DEFAULT_MAPPING),
        ...change,
      },
    }));

  const save = async () => {
    if (!service || busy) return;
    setBusy(true);
    setError("");
    try {
      const saved = await service.saveModel(draft);
      setDraft(editModel(saved));
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!service || !draft.id || !confirmDelete || busy) return;
    setBusy(true);
    setError("");
    try {
      await service.deleteModel(draft.id);
      setDraft(emptyModel(initialKind));
      setConfirmDelete(false);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] max-w-3xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
          <DialogTitle className="text-ui-lg">{t("models")}</DialogTitle>
          <DialogDescription className="text-ui-sm">{t("apiKeyHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 md:grid-cols-[190px_minmax(0,1fr)]">
          <aside className="flex max-h-40 flex-col gap-1 overflow-y-auto border-b border-border bg-surface px-2 py-3 md:max-h-none md:border-b-0 md:border-r">
            <Button
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={() => {
                setDraft(emptyModel(initialKind));
                setConfirmDelete(false);
                setError("");
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              {t("newModel")}
            </Button>
            {models.map((model) => (
              <button
                type="button"
                key={model.id}
                onClick={() => {
                  setDraft(editModel(model));
                  setConfirmDelete(false);
                  setError("");
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-ui-sm hover:bg-surface-hover",
                  draft.id === model.id && "bg-card-selected",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{model.name}</span>
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    model.configured && model.enabled ? "bg-success" : "bg-foreground-subtlest",
                  )}
                  aria-hidden="true"
                />
              </button>
            ))}
          </aside>
          <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-ui-sm text-foreground-subtle">
                {t("modelName")}
                <Input
                  value={draft.name}
                  maxLength={100}
                  onChange={(event) => patch({ name: event.target.value })}
                />
              </label>
              <label className="grid gap-1.5 text-ui-sm text-foreground-subtle">
                {t("modelId")}
                <Input
                  value={draft.model}
                  maxLength={200}
                  onChange={(event) => patch({ model: event.target.value })}
                />
              </label>
              <label className="grid gap-1.5 text-ui-sm text-foreground-subtle">
                {t("title")}
                <select
                  value={draft.kind}
                  onChange={(event) => {
                    const kind = event.target.value as CreationKind;
                    patch({
                      kind,
                      protocol:
                        kind === "video" && draft.protocol === "openai-images"
                          ? "json-api"
                          : draft.protocol,
                    });
                  }}
                  className="h-9 rounded-md border border-input-border bg-input px-2 text-ui-base text-foreground"
                >
                  <option value="image">{t("image")}</option>
                  <option value="video">{t("video")}</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-ui-sm text-foreground-subtle">
                {t("protocol")}
                <select
                  value={draft.protocol}
                  onChange={(event) => {
                    const protocol = event.target.value as CreationProtocol;
                    patch({
                      protocol,
                      baseUrl:
                        draft.baseUrl ||
                        (protocol === "comfyui"
                          ? "http://127.0.0.1:8188"
                          : protocol === "openai-images"
                            ? "https://api.openai.com"
                            : ""),
                    });
                  }}
                  className="h-9 rounded-md border border-input-border bg-input px-2 text-ui-base text-foreground"
                >
                  {draft.kind === "image" ? (
                    <option value="openai-images">{t("protocol.openai-images")}</option>
                  ) : null}
                  <option value="json-api">{t("protocol.json-api")}</option>
                  <option value="comfyui">{t("protocol.comfyui")}</option>
                </select>
              </label>
            </div>
            <label className="grid gap-1.5 text-ui-sm text-foreground-subtle">
              {t("baseUrl")}
              <Input
                value={draft.baseUrl}
                placeholder="https://api.example.com"
                onChange={(event) => patch({ baseUrl: event.target.value })}
              />
            </label>
            <label className="grid gap-1.5 text-ui-sm text-foreground-subtle">
              {t("apiKey")}
              <Input
                type="password"
                autoComplete="off"
                value={draft.apiKey ?? ""}
                placeholder={draft.id ? t("apiKeyHint") : ""}
                onChange={(event) => patch({ apiKey: event.target.value })}
              />
            </label>
            {draft.protocol === "comfyui" ? (
              <label className="grid gap-1.5 text-ui-sm text-foreground-subtle">
                {t("workflowJson")}
                <Textarea
                  value={draft.workflowJson ?? ""}
                  onChange={(event) => patch({ workflowJson: event.target.value })}
                  spellCheck={false}
                  className="min-h-32 resize-y font-mono text-ui-sm"
                  placeholder={'{"1":{"class_type":"...","inputs":{"text":"{{prompt}}"}}}'}
                />
                {draft.kind === "video" ? <span className="text-ui-xs">{t("comfyFrameHint")}</span> : null}
              </label>
            ) : null}
            {draft.protocol === "json-api" ? (
              <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
                <p className="text-ui-base font-medium">{t("advanced")}</p>
                <p className="text-ui-sm text-foreground-subtle">{t("mappingHint")}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    ["requestPath", "outputPath", "taskIdPath", "pollPath", "statusPath"] as const
                  ).map((key) => (
                    <label key={key} className="grid gap-1.5 text-ui-sm text-foreground-subtle">
                      {t(key)}
                      <Input
                        value={draft.apiMapping?.[key] ?? ""}
                        onChange={(event) => patchMapping({ [key]: event.target.value })}
                      />
                    </label>
                  ))}
                </div>
                <label className="grid gap-1.5 text-ui-sm text-foreground-subtle">
                  {t("requestTemplate")}
                  <Textarea
                    value={draft.apiMapping?.requestTemplate ?? ""}
                    onChange={(event) => patchMapping({ requestTemplate: event.target.value })}
                    spellCheck={false}
                    className="min-h-24 resize-y font-mono text-ui-sm"
                  />
                </label>
              </div>
            ) : null}
            <label className="flex items-center gap-2 text-ui-sm text-foreground-subtle">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) => patch({ enabled: event.target.checked })}
              />
              {t("enabled")}
            </label>
            {error ? (
              <p className="text-ui-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>
        <DialogFooter className="flex shrink-0 items-center gap-2 border-t border-border px-5 py-3">
          {draft.id ? (
            <Button
              variant="ghost"
              size="sm"
              className="mr-auto text-destructive"
              disabled={busy}
              onClick={() => (confirmDelete ? void remove() : setConfirmDelete(true))}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              {confirmDelete ? `${t("delete")}？` : t("delete")}
            </Button>
          ) : (
            <div className="mr-auto" />
          )}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
          <Button size="sm" disabled={busy || !service} onClick={() => void save()}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
