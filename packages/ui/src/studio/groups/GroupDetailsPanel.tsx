import { Settings2, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { studioKernelOption } from "../types.js";
import { useStudioKernelCatalog } from "../agents/useStudioKernelCatalog.js";
import type { StudioGroup } from "./groupModel.js";
import { GroupKernelAvatar } from "./GroupMembersField.js";
import { StudioRunHistory } from "../runtime/StudioRunHistory.js";

export function GroupDetailsPanel({
  group,
  onClose,
  onEdit,
  onOpenAgentSettings,
}: {
  group: StudioGroup;
  onClose: () => void;
  onEdit: () => void;
  onOpenAgentSettings: () => void;
}) {
  const { intl } = useKnorviaIntl();
  const { statuses, inspected } = useStudioKernelCatalog();
  const t = (id: string) => intl.formatMessage({ id: `studio.groups.${id}` });
  return (
    <aside
      aria-label={t("details")}
      className="absolute inset-y-0 right-0 z-10 flex w-72 max-w-full shrink-0 flex-col border-l border-border bg-card shadow-md lg:static lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:shadow-none"
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-4">
        <h2 className="text-ui-base font-medium">{t("details")}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-md"
          aria-label={t("closeDetails")}
          title={t("closeDetails")}
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4">
        <section className="space-y-2">
          <h3 className="text-ui-sm font-medium text-foreground-subtle">{t("goal")}</h3>
          <p className="whitespace-pre-wrap break-words text-ui-base">
            {group.goal || t("noGoal")}
          </p>
        </section>
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-ui-sm font-medium text-foreground-subtle">{t("members")}</h3>
            <Button type="button" variant="ghost" size="sm" onClick={onOpenAgentSettings}>
              {t("manageAgents")}
            </Button>
          </div>
          <ul className="space-y-3">
            {group.members.map((member) => {
              const kernel = studioKernelOption(member, statuses);
              const unavailable =
                inspected &&
                !kernel.builtin &&
                statuses.find((item) => item.id === member)?.installed !== true;
              return (
                <li key={member} className="flex items-center gap-2">
                  <GroupKernelAvatar kernelId={member} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ui-base">{kernel.name}</p>
                    <p className="text-ui-xs text-foreground-subtle">
                      {t(unavailable ? "unavailable" : kernel.builtin ? "builtin" : "external")}
                    </p>
                  </div>
                  {group.host === member ? (
                    <span className="rounded-sm bg-tag px-1.5 py-0.5 text-ui-xs text-foreground-subtle">
                      {t("host")}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
        <section className="space-y-2">
          <h3 className="text-ui-sm font-medium text-foreground-subtle">{t("project")}</h3>
          <p className="break-all text-ui-sm">{group.workspacePath || t("selectProject")}</p>
        </section>
        <section className="space-y-2">
          <h3 className="text-ui-sm font-medium text-foreground-subtle">{t("workspaceMode")}</h3>
          <p className="text-ui-base">{t(group.workspaceMode)}</p>
        </section>
        <section className="space-y-2">
          <h3 className="text-ui-sm font-medium text-foreground-subtle">{t("summary")}</h3>
          <p className="whitespace-pre-wrap break-words text-ui-base">
            {group.sharedSummary || t("noSummary")}
          </p>
          <p className="flex items-start gap-1.5 text-ui-sm leading-relaxed text-foreground-subtle">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            {t("privacy")}
          </p>
        </section>
        <Button type="button" variant="outline" className="w-full" onClick={onEdit}>
          <Settings2 />
          {t("edit")}
        </Button>
        <section className="space-y-2">
          <h3 className="text-ui-sm font-medium text-foreground-subtle">{t("history")}</h3>
          <StudioRunHistory targetId={group.id} />
        </section>
      </div>
    </aside>
  );
}
