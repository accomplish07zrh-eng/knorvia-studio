import { useId, useRef, useState } from "react";
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
import { Folder } from "lucide-react";
import { useSelectDirectory } from "@/hooks/usePlatform.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import {
  GROUP_LIMITS,
  newGroupConfig,
  normalizeGroupConfig,
  type StudioGroup,
  type StudioGroupConfig,
} from "./groupModel.js";
import { GroupMembersField } from "./GroupMembersField.js";
import { GroupSettingsFields } from "./GroupSettingsFields.js";

export function GroupEditDialog({
  group,
  onClose,
  onSave,
  frozen = false,
}: {
  group: StudioGroup | null;
  onClose: () => void;
  frozen?: boolean;
  onSave: (
    config: StudioGroupConfig,
    identity: Pick<StudioGroup, "id" | "createdAt"> & { updatedAt?: number },
  ) => Promise<void>;
}) {
  const { intl } = useKnorviaIntl();
  const t = (id: string) => intl.formatMessage({ id: `studio.groups.${id}` });
  const formId = useId();
  const identity = useRef(group ?? { id: crypto.randomUUID(), createdAt: Date.now() });
  const selectDirectory = useSelectDirectory();
  const [value, setValue] = useState<StudioGroupConfig>(() =>
    group
      ? {
          name: group.name,
          goal: group.goal,
          members: [...group.members],
          host: group.host,
          sharedSummary: group.sharedSummary,
          mode: group.mode,
          workspaceMode: group.workspaceMode,
          workspacePath: group.workspacePath,
        }
      : newGroupConfig(),
  );
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (submitting.current || frozen) return;
    const normalized = normalizeGroupConfig(value);
    if (!normalized) {
      setInvalid(true);
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await onSave(normalized, identity.current);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[85dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(group ? "edit" : "create")}</DialogTitle>
          <DialogDescription>
            {t(group ? "editDescription" : "createDescription")}
          </DialogDescription>
        </DialogHeader>
        <form
          id={formId}
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <fieldset className="space-y-4" disabled={busy || frozen}>
            <div className="space-y-1.5">
              <label htmlFor={`${formId}-name`} className="text-ui-base font-medium">
                {t("name")}
              </label>
              <Input
                id={`${formId}-name`}
                autoFocus
                size="lg"
                value={value.name}
                maxLength={GROUP_LIMITS.name}
                placeholder={t("namePlaceholder")}
                aria-invalid={invalid && !value.name.trim()}
                onChange={(event) => {
                  setValue({ ...value, name: event.target.value });
                  setInvalid(false);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${formId}-goal`} className="text-ui-base font-medium">
                {t("goal")}
              </label>
              <Textarea
                id={`${formId}-goal`}
                rows={2}
                value={value.goal}
                maxLength={GROUP_LIMITS.goal}
                placeholder={t("goalPlaceholder")}
                onChange={(event) => setValue({ ...value, goal: event.target.value })}
              />
            </div>
            <GroupMembersField
              value={value.members}
              onChange={(members) =>
                setValue({
                  ...value,
                  members,
                  host: members.includes(value.host) ? value.host : members[0]!,
                })
              }
            />
            <label className="grid gap-1.5 text-ui-base font-medium">
              {t("project")}
              <div className="flex gap-2">
                <Input
                  value={value.workspacePath ?? ""}
                  maxLength={4096}
                  placeholder={t("projectPlaceholder")}
                  onChange={(event) => setValue({ ...value, workspacePath: event.target.value })}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon-lg"
                  aria-label={t("selectProject")}
                  onClick={() =>
                    void selectDirectory()
                      .then((path) => {
                        if (path) setValue((old) => ({ ...old, workspacePath: path }));
                      })
                      .catch((cause) => setError(String(cause)))
                  }
                >
                  <Folder />
                </Button>
              </div>
            </label>
            {group ? (
              <GroupSettingsFields formId={formId} value={value} onChange={setValue} />
            ) : null}
          </fieldset>
          {frozen && (
            <p role="status" className="text-ui-sm text-foreground-subtle">
              {t("editingFrozen")}
            </p>
          )}
          {error && (
            <p role="alert" className="text-ui-sm text-destructive">
              {error}
            </p>
          )}
          {invalid ? (
            <p role="alert" className="text-ui-sm text-destructive">
              {t("invalid")}
            </p>
          ) : null}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button type="submit" form={formId} size="lg" disabled={busy || frozen}>
            {t(group ? "save" : "create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
