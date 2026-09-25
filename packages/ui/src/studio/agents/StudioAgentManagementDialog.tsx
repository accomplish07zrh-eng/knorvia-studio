import type { StudioKernelStatus } from "@knorvia/services";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { StudioAgentProbeDetails } from "./StudioAgentProbeDetails.js";

export type StudioManagementAction = "install" | "update" | "uninstall" | "update-existing";

export function StudioAgentManagementDialog({
  name,
  status,
  studioManagedInstaller,
  busyAction,
  error,
  notice,
  onAction,
  onReprobe,
  onClose,
}: {
  name: string;
  status?: StudioKernelStatus;
  studioManagedInstaller: boolean;
  busyAction?: StudioManagementAction;
  error?: string;
  notice?: string;
  onAction: (action: StudioManagementAction) => void;
  /** 必须走跳过协议缓存的重探路径，界面显示本次真实结果。 */
  onReprobe: () => void;
  onClose: () => void;
}) {
  const { intl } = useKnorviaIntl();
  const origin = status?.origin;
  const busy = Boolean(busyAction);
  const existing = status?.installed && origin === "external";
  const separate = status?.installed && origin === "managed";
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {intl.formatMessage({ id: "studio.agents.managementTitle" }, { name })}
          </DialogTitle>
          <DialogDescription>
            {intl.formatMessage({
              id: separate
                ? "studio.agents.managementSeparateActive"
                : existing
                  ? "studio.agents.managementExisting"
                  : "studio.agents.managementMissing",
            })}
          </DialogDescription>
        </DialogHeader>
        {status?.executablePath ? (
          <p className="break-all rounded-md bg-surface px-3 py-2 font-mono text-ui-xs text-foreground-subtle select-text">
            {status.executablePath}
          </p>
        ) : null}
        <StudioAgentProbeDetails status={status} cliName={name} />
        <div className="space-y-4">
          {existing ? (
            <div className="space-y-2">
              <p className="text-ui-sm font-medium">
                {intl.formatMessage({ id: "studio.agents.existingInstallation" })}
              </p>
              <p className="text-ui-sm leading-5 text-foreground-subtle">
                {intl.formatMessage({
                  id: status.externalUpdate
                    ? "studio.agents.existingUpdateReady"
                    : "studio.agents.existingUpdateUnavailable",
                })}
              </p>
              {status.externalUpdate ? (
                <Button disabled={busy} onClick={() => onAction("update-existing")}>
                  {busyAction === "update-existing" ? <RefreshCw className="animate-spin" /> : null}
                  {intl.formatMessage({ id: "studio.agents.updateExisting" })}
                </Button>
              ) : null}
            </div>
          ) : null}
          {studioManagedInstaller ? (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-ui-sm font-medium">
                {intl.formatMessage({ id: "studio.agents.separateInstallation" })}
              </p>
              <p className="text-ui-sm leading-5 text-foreground-subtle">
                {intl.formatMessage({ id: "studio.agents.separateExplanation" })}
              </p>
              <div className="flex flex-wrap gap-2">
                {(separate ? (["update", "uninstall"] as const) : (["install"] as const)).map(
                  (action) => (
                    <Button
                      key={action}
                      variant="outline"
                      disabled={busy || !status}
                      onClick={() => onAction(action)}
                    >
                      {busyAction === action ? <RefreshCw className="animate-spin" /> : null}
                      {intl.formatMessage({
                        id:
                          action === "install"
                            ? "studio.agents.installManaged"
                            : action === "update"
                              ? "studio.agents.update"
                              : "studio.agents.uninstall",
                      })}
                    </Button>
                  ),
                )}
              </div>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="break-words text-ui-sm text-destructive">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="text-ui-sm text-foreground-subtle">
              {notice}
            </p>
          ) : null}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="ghost" disabled={busy} onClick={onReprobe}>
            <RefreshCw />
            {intl.formatMessage({ id: "studio.agents.reprobe" })}
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            {intl.formatMessage({ id: "studio.agents.managementClose" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
