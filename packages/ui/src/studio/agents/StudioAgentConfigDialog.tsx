import { useId, useRef, useState } from "react";
import type { StudioKernelConfig, StudioKernelStatus } from "@knorvia/services";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { useConfirmDialog } from "@/hooks/useConfirmDialog.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { useStudioAgentStore } from "@/store/studioAgentStore.js";
import {
  isStudioAgentConfig,
  type StudioExternalKernelId,
  type StudioPermissionPreference,
} from "./agentDrafts.js";
import { StudioAgentStorageNotice } from "./StudioAgentStorageNotice.js";
import { editedStudioAgentConfig } from "./agentConfig.js";

export function StudioAgentConfigDialog({
  kernelId,
  name,
  config,
  status,
  onSave,
  onClose,
  onSaved,
  onOpenManagement,
}: {
  kernelId: StudioExternalKernelId;
  name: string;
  config: StudioKernelConfig;
  status?: StudioKernelStatus;
  onSave: (config: StudioKernelConfig) => Promise<void>;
  onClose: () => void;
  onSaved: () => void;
  onOpenManagement?: () => void;
}) {
  const { intl, locale } = useKnorviaIntl();
  const confirm = useConfirmDialog();
  const formId = useId();
  const saveConfig = useStudioAgentStore((state) => state.saveConfig);
  const [path, setPath] = useState(config.executablePath);
  const [permission, setPermission] = useState(config.permission);
  const [model, setModel] = useState(config.model ?? "");
  const remote = kernelId.startsWith("ssh:");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const openManagement = async () => {
    if (!onOpenManagement || inFlight.current) return;
    const changed =
      path.trim() !== config.executablePath.trim() ||
      permission !== config.permission ||
      model.trim() !== (config.model ?? "").trim();
    if (
      changed &&
      !(await confirm({
        title: intl.formatMessage({ id: "studio.agents.discardConfigTitle" }),
        description: intl.formatMessage({ id: "studio.agents.discardConfigDescription" }),
        confirmLabel: intl.formatMessage({ id: "studio.agents.discardConfig" }),
        cancelLabel: intl.formatMessage({ id: "studio.agents.cancel" }),
      }))
    )
      return;
    onOpenManagement();
  };
  const unsupportedPermission = (value: StudioPermissionPreference) =>
    value === "read-only"
      ? status?.capabilities.readOnly !== true
      : value === "full-access"
        ? status?.capabilities.fullAccess !== true
        : false;
  const commit = async (next: StudioKernelConfig) => {
    if (inFlight.current) return;
    if (
      !isStudioAgentConfig(next) ||
      (next.model &&
        (next.model.length > 256 || /[\r\n]/.test(next.model) || next.model.includes("\0")))
    ) {
      setError(intl.formatMessage({ id: "studio.agents.error.invalid-config" }));
      return;
    }
    if (unsupportedPermission(next.permission)) {
      setError(intl.formatMessage({ id: "studio.agents.permissionUnsupported" }));
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      await onSave(next);
      // 后端已持久化才更新草稿副本；本机草稿缓存失败由 StorageNotice 单独呈现。
      saveConfig(kernelId, { executablePath: next.executablePath, permission: next.permission });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };
  const reset = async () => {
    if (
      !(await confirm({
        title: intl.formatMessage({ id: "studio.agents.resetConfigTitle" }, { name }),
        description: intl.formatMessage({ id: "studio.agents.resetConfigDescription" }),
        confirmLabel: intl.formatMessage({ id: "studio.agents.resetConfig" }),
        cancelLabel: intl.formatMessage({ id: "studio.agents.cancel" }),
      }))
    )
      return;
    await commit({ executablePath: "", permission: "ask" });
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !inFlight.current) onClose();
      }}
    >
      <DialogContent
        className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg"
        showCloseButton={!saving}
        onEscapeKeyDown={(event) => {
          if (inFlight.current) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (inFlight.current) event.preventDefault();
        }}
      >
        <DialogHeader className="pr-6">
          <DialogTitle>
            {intl.formatMessage({ id: "studio.agents.configureTitle" }, { name })}
          </DialogTitle>
          <DialogDescription>
            {intl.formatMessage({ id: "studio.agents.configureDescription" })}
          </DialogDescription>
        </DialogHeader>
        <form
          id={formId}
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void commit(
              editedStudioAgentConfig(config, {
                executablePath: remote ? "" : path.trim(),
                permission,
                ...(model.trim() ? { model: model.trim() } : {}),
              }),
            );
          }}
        >
          {!remote ? (
            <div className="space-y-2">
              <label htmlFor={`${formId}-path`} className="text-ui-base font-medium">
                {intl.formatMessage({ id: "studio.agents.path" })}
              </label>
              <Input
                id={`${formId}-path`}
                className="w-full font-mono"
                value={path}
                disabled={saving}
                maxLength={4096}
                spellCheck={false}
                placeholder={intl.formatMessage({ id: "studio.agents.pathPlaceholder" })}
                aria-describedby={`${formId}-path-hint`}
                onChange={(event) => setPath(event.target.value)}
              />
              <p id={`${formId}-path-hint`} className="text-ui-sm leading-5 text-foreground-subtle">
                {intl.formatMessage({ id: "studio.agents.pathHint" })}
              </p>
            </div>
          ) : (
            <p className="text-ui-sm text-foreground-subtle">
              {locale.startsWith("zh")
                ? "程序路径由已连接的 SSH 服务器检测；此处只设置权限和模型。"
                : "The connected SSH server detects the executable. Set permissions and model here."}
            </p>
          )}
          <div className="space-y-2">
            <label htmlFor={`${formId}-model`} className="text-ui-base font-medium">
              {intl.formatMessage({ id: "studio.agents.model" })}
            </label>
            <Input
              id={`${formId}-model`}
              value={model}
              disabled={saving}
              maxLength={256}
              spellCheck={false}
              placeholder={intl.formatMessage({ id: "studio.agents.modelPlaceholder" })}
              aria-describedby={`${formId}-model-hint`}
              onChange={(event) => setModel(event.target.value)}
            />
            <p id={`${formId}-model-hint`} className="text-ui-sm leading-5 text-foreground-subtle">
              {intl.formatMessage({ id: "studio.agents.modelHint" })}
            </p>
          </div>
          <div className="space-y-2">
            <label htmlFor={`${formId}-permission`} className="text-ui-base font-medium">
              {intl.formatMessage({ id: "studio.agents.preference" })}
            </label>
            <Select
              value={permission}
              disabled={saving}
              onValueChange={(value) => setPermission(value as StudioPermissionPreference)}
            >
              <SelectTrigger
                id={`${formId}-permission`}
                size="lg"
                className="w-full"
                aria-describedby={`${formId}-permission-hint`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {(["read-only", "ask", "full-access"] as const).map((value) => (
                  <SelectItem key={value} value={value} disabled={unsupportedPermission(value)}>
                    {intl.formatMessage({ id: `studio.agents.permission.${value}` })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p
              id={`${formId}-permission-hint`}
              className="text-ui-sm leading-5 text-foreground-subtle"
            >
              {intl.formatMessage({ id: "studio.agents.preferenceHint" })}
            </p>
            {status?.capabilities.readOnly === false ? (
              <p className="text-ui-sm leading-5 text-foreground-subtle">
                {intl.formatMessage({ id: "studio.agents.readOnlyUnsupported" })}
              </p>
            ) : !status ? (
              <p className="text-ui-sm leading-5 text-foreground-subtle">
                {intl.formatMessage({ id: "studio.agents.capabilitiesUnknown" })}
              </p>
            ) : null}
            {unsupportedPermission(permission) ? (
              <p role="alert" className="text-ui-sm text-destructive">
                {intl.formatMessage({ id: "studio.agents.permissionUnsupported" })}
              </p>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="text-ui-sm text-destructive">
              {error}
            </p>
          ) : null}
          <StudioAgentStorageNotice />
        </form>
        <DialogFooter className="sm:justify-between">
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => {
                void reset();
              }}
            >
              {intl.formatMessage({ id: "studio.agents.resetConfig" })}
            </Button>
            {onOpenManagement ? (
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => void openManagement()}
              >
                {intl.formatMessage({ id: "studio.agents.managementOpen" })}
              </Button>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
              {intl.formatMessage({ id: "studio.agents.cancel" })}
            </Button>
            <Button
              type="submit"
              form={formId}
              disabled={saving || unsupportedPermission(permission)}
            >
              {intl.formatMessage({ id: saving ? "studio.agents.saving" : "studio.agents.save" })}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
