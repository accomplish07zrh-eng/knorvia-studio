import { useEffect, useRef, useState } from "react";
import { Cloud, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useConfirmDialog } from "@/hooks/useConfirmDialog.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { useStudioAgentStore } from "@/store/studioAgentStore.js";
import { useStudioRuntime } from "../runtime/useStudioRuntime.js";
import {
  studioKernelOption,
  studioKernelOptions,
  studioManagesKernel,
  type StudioKernelId,
} from "../types.js";
import { isExternalKernel, type StudioExternalKernelId } from "./agentDrafts.js";
import { StudioAgentConfigDialog } from "./StudioAgentConfigDialog.js";
import {
  StudioAgentManagementDialog,
  type StudioManagementAction,
} from "./StudioAgentManagementDialog.js";
import { StudioAgentStorageNotice } from "./StudioAgentStorageNotice.js";
import { StudioKernelCard } from "./StudioKernelCard.js";
import { useStudioKernelCatalog } from "./useStudioKernelCatalog.js";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
const defaultConfig = { executablePath: "", permission: "ask" } as const;

export function StudioAgentsSection({
  onOpenModels,
  onConnectSsh,
}: {
  onOpenModels?: () => void;
  onConnectSsh?: () => void;
}) {
  const { intl, locale } = useKnorviaIntl();
  const confirm = useConfirmDialog();
  const runtime = useStudioRuntime();
  const { service, ready } = runtime;
  const {
    statuses,
    checking,
    inspected,
    error: inspectionError,
    refresh: inspect,
    reprobe,
  } = useStudioKernelCatalog();
  const kernels = studioKernelOptions(statuses);
  const [editing, setEditing] = useState<StudioExternalKernelId | null>(null);
  const [managementKernel, setManagementKernel] = useState<StudioExternalKernelId | null>(null);
  const [saved, setSaved] = useState(false);
  const [localBusy, setBusy] = useState<{
    kernel: StudioExternalKernelId;
    action: StudioManagementAction;
  } | null>(null);
  const management = useStudioAgentStore((state) => state.management);
  const manageKernel = useStudioAgentStore((state) => state.manageKernel);
  const busy =
    management && management.service === service && management.pending ? management : localBusy;
  const managementError = management && management.service === service ? management.error : "";
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reprovingKernel, setReprovingKernel] = useState<StudioKernelId | null>(null);
  const mounted = useRef(false);
  const operation = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const manage = async (kernel: StudioExternalKernelId, action: StudioManagementAction) => {
    if (!service || !ready || operation.current || busy || checking) return;
    const status = statuses.find((candidate) => candidate.id === kernel);
    if (!status || status.remoteWorkspacePath) return;
    if (action === "update-existing") {
      if (status.origin !== "external" || !status.externalUpdate) return;
    } else if (
      !studioManagesKernel(kernel, status) ||
      (action === "install" ? status.origin === "managed" : status.origin !== "managed")
    )
      return;
    operation.current = true;
    setBusy({ kernel, action });
    setSaved(false);
    setError("");
    setNotice("");
    try {
      if (
        action === "uninstall" &&
        !(await confirm({
          title: intl.formatMessage(
            { id: "studio.agents.uninstallTitle" },
            { name: studioKernelOption(kernel, statuses).name },
          ),
          description: intl.formatMessage(
            { id: "studio.agents.uninstallDescription" },
            { path: status.executablePath ?? "" },
          ),
          confirmLabel: intl.formatMessage({ id: "studio.agents.uninstall" }),
          cancelLabel: intl.formatMessage({ id: "studio.agents.cancel" }),
        }))
      )
        return;
      if (
        action === "update-existing" &&
        !(await confirm({
          title: intl.formatMessage(
            { id: "studio.agents.updateExistingTitle" },
            { name: studioKernelOption(kernel, statuses).name },
          ),
          description: intl.formatMessage(
            { id: "studio.agents.updateExistingDescription" },
            { path: status.executablePath ?? "" },
          ),
          confirmLabel: intl.formatMessage({ id: "studio.agents.updateExisting" }),
          cancelLabel: intl.formatMessage({ id: "studio.agents.cancel" }),
        }))
      )
        return;
      // 操作状态跨设置页保留；Host 原子维护路径，UI 不再二次整包写回旧配置。
      const succeeded = await manageKernel(service, { kernel, action });
      if (succeeded) {
        runtime.refresh();
        if (mounted.current)
          setNotice(intl.formatMessage({ id: "studio.agents.managementComplete" }));
      }
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause));
    } finally {
      operation.current = false;
      if (mounted.current) {
        setBusy(null);
        // 管理动作会改动安装副本或版本：必须绕过缓存重新探测。
        void reprobe();
      }
    }
  };

  return (
    <section
      className="space-y-4"
      data-testid="studio-agents-section"
      aria-label={intl.formatMessage({ id: "studio.agents.title" })}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-ui-base leading-6 text-foreground-subtle">
          {intl.formatMessage({ id: "studio.agents.description" })}
        </p>
        <div className="flex items-center gap-2">
          {onConnectSsh ? (
            <Button variant="outline" size="sm" onClick={onConnectSsh}>
              <Cloud />
              {locale.startsWith("zh") ? "连接 SSH Agent" : "Connect SSH Agent"}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={!ready || checking || Boolean(busy)}
            onClick={() => {
              runtime.refresh();
              void inspect();
            }}
          >
            <RefreshCw className={checking ? "animate-spin" : undefined} />
            {intl.formatMessage({
              id: checking ? "studio.agents.checking" : "studio.agents.inspect",
            })}
          </Button>
        </div>
      </div>
      <p className="text-ui-sm leading-5 text-foreground-subtle">
        {intl.formatMessage({ id: "studio.agents.sharedResources" })}
      </p>
      {!ready ? (
        <p role="status" className="text-ui-sm text-foreground-subtle">
          {runtime.error ??
            intl.formatMessage({
              id: service ? "studio.agents.loading" : "studio.agents.runtimeUnavailable",
            })}
        </p>
      ) : null}
      {error || managementError || inspectionError ? (
        <p role="alert" className="break-words text-ui-sm text-destructive">
          {error || managementError || inspectionError}
        </p>
      ) : null}
      <StudioAgentStorageNotice />
      <div className="space-y-3">
        {kernels.map((kernel) => {
          const config = runtime.overview?.configs[kernel.id];
          const status = statuses.find((candidate) => candidate.id === kernel.id);
          const managing = busy?.kernel === kernel.id;
          const externalId = isExternalKernel(kernel.id) ? kernel.id : undefined;
          const manageableId =
            externalId && !externalId.startsWith("ssh:") ? externalId : undefined;
          return (
            <StudioKernelCard
              key={kernel.id}
              kernel={kernel}
              status={status}
              config={config ?? defaultConfig}
              inspected={inspected}
              managing={managing}
              reprobing={reprovingKernel === kernel.id}
              busy={!ready || Boolean(busy)}
              onConfigure={
                kernel.builtin
                  ? onOpenModels
                  : externalId
                    ? () => {
                        setSaved(false);
                        setEditing(externalId);
                      }
                    : undefined
              }
              onManage={
                manageableId
                  ? () => {
                      setError("");
                      setNotice("");
                      setManagementKernel(manageableId);
                    }
                  : undefined
              }
              onReprobe={() => {
                setError("");
                setNotice("");
                setReprovingKernel(kernel.id);
                runtime.refresh();
                void reprobe().finally(() => {
                  if (mounted.current) setReprovingKernel(null);
                });
              }}
            />
          );
        })}
      </div>
      {saved ? (
        <p role="status" className="text-ui-sm text-foreground-subtle">
          {intl.formatMessage({ id: "studio.agents.saved" })}
        </p>
      ) : null}
      {editing && runtime.overview ? (
        <StudioAgentConfigDialog
          key={editing}
          kernelId={editing}
          name={studioKernelOption(editing, statuses).name}
          config={runtime.overview.configs[editing] ?? defaultConfig}
          status={statuses.find((item) => item.id === editing)}
          onSave={async (config) => {
            await runtime.command({ type: "configure", kernel: editing, config });
          }}
          onClose={() => setEditing(null)}
          onOpenManagement={
            editing.startsWith("ssh:")
              ? undefined
              : () => {
                  setEditing(null);
                  setError("");
                  setNotice("");
                  setManagementKernel(editing);
                }
          }
          onSaved={() => {
            setEditing(null);
            setSaved(true);
            runtime.refresh();
            // 选择/更换程序后必须显式重探：路径变了就不能沿用旧的协议结论。
            void reprobe();
          }}
        />
      ) : null}
      {managementKernel ? (
        <StudioAgentManagementDialog
          name={studioKernelOption(managementKernel, statuses).name}
          status={statuses.find((item) => item.id === managementKernel)}
          studioManagedInstaller={studioManagesKernel(
            managementKernel,
            statuses.find((item) => item.id === managementKernel),
          )}
          busyAction={busy?.kernel === managementKernel ? busy.action : undefined}
          error={error || (management?.kernel === managementKernel ? managementError : "")}
          notice={notice}
          onAction={(action) => void manage(managementKernel, action)}
          onReprobe={() => {
            setNotice("");
            runtime.refresh();
            void reprobe();
          }}
          onClose={() => setManagementKernel(null)}
        />
      ) : null}
    </section>
  );
}
