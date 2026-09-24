import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { studioKernelOptions, type StudioKernelId } from "../types.js";
import { useStudioKernelCatalog } from "../agents/useStudioKernelCatalog.js";
import {
  GROUP_LIMITS,
  type StudioGroupConfig,
  type StudioGroupMode,
  type StudioGroupWorkspaceMode,
} from "./groupModel.js";

export function GroupSettingsFields({
  value,
  onChange,
  formId,
}: {
  value: StudioGroupConfig;
  onChange: (value: StudioGroupConfig) => void;
  formId: string;
}) {
  const { intl } = useKnorviaIntl();
  const { statuses } = useStudioKernelCatalog();
  const t = (id: string) => intl.formatMessage({ id: `studio.groups.${id}` });
  return (
    <>
      <div className="space-y-1.5">
        <label htmlFor={`${formId}-host`} className="text-ui-base font-medium">
          {t("host")}
        </label>
        <Select
          value={value.host}
          onValueChange={(host) => onChange({ ...value, host: host as StudioKernelId })}
        >
          <SelectTrigger id={`${formId}-host`} className="w-full" size="lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {studioKernelOptions(statuses, value.members)
              .filter((kernel) => value.members.includes(kernel.id))
              .map((kernel) => (
                <SelectItem key={kernel.id} value={kernel.id}>
                  {kernel.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <p className="text-ui-sm text-foreground-subtle">{t("hostHint")}</p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${formId}-mode`} className="text-ui-base font-medium">
          {t("mode")}
        </label>
        <Select
          value={value.mode}
          onValueChange={(mode) => onChange({ ...value, mode: mode as StudioGroupMode })}
        >
          <SelectTrigger id={`${formId}-mode`} className="w-full" size="lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">{t("manual")}</SelectItem>
            <SelectItem value="task">{t("task")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${formId}-workspace`} className="text-ui-base font-medium">
          {t("workspaceMode")}
        </label>
        <Select
          value={value.workspaceMode}
          onValueChange={(workspaceMode) =>
            onChange({ ...value, workspaceMode: workspaceMode as StudioGroupWorkspaceMode })
          }
        >
          <SelectTrigger id={`${formId}-workspace`} className="w-full" size="lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="isolated">{t("isolated")}</SelectItem>
            <SelectItem value="shared">{t("shared")}</SelectItem>
          </SelectContent>
        </Select>
        {value.workspaceMode === "shared" ? (
          <p className="text-ui-sm text-foreground-subtle">{t("sharedHint")}</p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${formId}-summary`} className="text-ui-base font-medium">
          {t("summary")}
        </label>
        <Textarea
          id={`${formId}-summary`}
          rows={3}
          maxLength={GROUP_LIMITS.summary}
          placeholder={t("summaryPlaceholder")}
          value={value.sharedSummary}
          onChange={(event) => onChange({ ...value, sharedSummary: event.target.value })}
        />
        <p className="text-ui-sm text-foreground-subtle">{t("privacy")}</p>
      </div>
    </>
  );
}
