import { useEffect, useRef, useState } from "react";
import { Ellipsis, MessageCircle, Plus, Settings2, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { useStudioGroupStore } from "@/store/studioGroupStore.js";
import { GroupComposer } from "./GroupComposer.js";
import { GroupDetailsPanel } from "./GroupDetailsPanel.js";
import { GroupEditDialog } from "./GroupEditDialog.js";
import { GroupKernelAvatar } from "./GroupMembersField.js";
import { GroupMetricsBar } from "./GroupMetricsBar.js";
import { GroupProgressPanel } from "./GroupProgressPanel.js";
import { useStudioGroups } from "./useStudioGroups.js";
import { StudioTimeline } from "../runtime/StudioTimeline.js";
import { activeGroupRun } from "./groupSubmission.js";

export function StudioGroupsPage({
  groupId,
  onSelectGroup,
  onOpenAgentSettings,
  createRequest = 0,
  onCreateRequestHandled,
}: {
  groupId: string | null;
  onSelectGroup: (id: string | null) => void;
  onOpenAgentSettings: () => void;
  createRequest?: number;
  onCreateRequestHandled?: () => void;
}) {
  const { intl } = useKnorviaIntl();
  const t = (id: string) => intl.formatMessage({ id: `studio.groups.${id}` });
  const runtime = useStudioGroups(groupId ?? undefined);
  const groups = runtime.groups;
  const storageIssue = useStudioGroupStore((state) => state.storageIssue);
  const retrySave = useStudioGroupStore((state) => state.retrySave);
  const group = groups.find((item) => item.id === groupId) ?? null;
  const [dialog, setDialog] = useState<"create" | "edit" | "delete" | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const running = activeGroupRun(runtime.timeline?.runs);
  const groupMetrics = runtime.timeline?.groupMetrics;
  const latestRun = runtime.timeline?.runs[0];
  const hasContent = Boolean(runtime.timeline?.messages.length || runtime.timeline?.runs.length);
  const handledCreateRequest = useRef(0);
  const selectedGroup = useRef(groupId);
  selectedGroup.current = groupId;
  useEffect(() => {
    setError("");
    setDialog(null);
  }, [groupId]);
  useEffect(() => {
    if (createRequest > 0 && createRequest !== handledCreateRequest.current) {
      handledCreateRequest.current = createRequest;
      setDialog("create");
      onCreateRequestHandled?.();
    }
  }, [createRequest, onCreateRequestHandled]);

  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-col bg-background text-foreground"
      data-testid="studio-groups-page"
    >
      <header className="flex min-h-12 shrink-0 items-center gap-3 border-b border-border px-4 py-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-ui-base font-medium">{group?.name ?? t("title")}</h1>
          {group ? (
            <p className="text-ui-xs text-foreground-subtle">
              {intl.formatMessage(
                { id: "studio.groups.memberCount" },
                { count: group.members.length },
              )}
            </p>
          ) : null}
        </div>
        {group ? (
          <>
            <div className="hidden items-center gap-1 sm:flex">
              {group.members.map((member) => (
                <GroupKernelAvatar key={member} kernelId={member} />
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label={t("details")}
              title={t("details")}
              aria-expanded={detailsOpen}
              onClick={() => setDetailsOpen(!detailsOpen)}
            >
              <Users />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  aria-label={t("edit")}
                  title={t("edit")}
                >
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled={Boolean(running)} onSelect={() => setDialog("edit")}>
                  <Settings2 />
                  {t("edit")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={Boolean(running)}
                  variant="destructive"
                  onSelect={() => setDialog("delete")}
                >
                  <Trash2 />
                  {t("delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <Button type="button" variant="ghost" size="lg" onClick={() => setDialog("create")}>
            <Plus />
            {t("create")}
          </Button>
        )}
      </header>
      {(error || runtime.error || runtime.importError) && (
        <div
          role="alert"
          className="flex items-center gap-2 border-b border-border px-4 py-2 text-ui-sm text-destructive"
        >
          <span className="min-w-0 flex-1 break-words">
            {error || runtime.error || runtime.importError}
          </span>
          {runtime.importError && (
            <Button variant="ghost" size="sm" onClick={runtime.retryImport}>
              {t("retrySave")}
            </Button>
          )}
        </div>
      )}
      {storageIssue ? (
        <div
          role="alert"
          className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-ui-sm text-foreground-subtle"
        >
          <span>{t(`storage.${storageIssue}`)}</span>
          {storageIssue === "write-failed" ? (
            <Button type="button" variant="outline" size="sm" onClick={retrySave}>
              {t("retrySave")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {group ? (
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative flex min-h-0 lg:contents">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:col-start-1 lg:row-start-1">
              {latestRun?.taskMode ? (
                <GroupProgressPanel key={latestRun.id} timeline={runtime.timeline} />
              ) : null}
              {hasContent ? (
                <StudioTimeline targetId={group.id} />
              ) : (
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-8">
                  <div className="max-w-md text-center">
                    <MessageCircle className="mx-auto mb-4 size-7 text-foreground-subtlest" />
                    <h2 className="line-clamp-4 whitespace-pre-wrap break-words text-ui-lg font-medium">
                      {group.goal || group.name}
                    </h2>
                    <p className="mt-3 text-ui-sm leading-relaxed text-foreground-subtle">
                      {t(group.mode === "manual" ? "manualHint" : "taskHint")}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-3 text-foreground-subtle"
                      onClick={() => setDialog("edit")}
                    >
                      <Settings2 />
                      {t("edit")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
            {detailsOpen ? (
              <GroupDetailsPanel
                group={group}
                onClose={() => setDetailsOpen(false)}
                onEdit={() => setDialog("edit")}
                onOpenAgentSettings={onOpenAgentSettings}
              />
            ) : null}
          </div>
          <div className="min-w-0 lg:col-start-1 lg:row-start-2">
            <GroupComposer
              key={group.id}
              group={group}
              onEditProject={() => setDialog("edit")}
              onChangeMode={async (mode) => {
                await runtime.save({ ...group, mode }, group);
              }}
            />
            {groupMetrics?.runId === latestRun?.id ? (
              <div className="mx-auto w-full max-w-3xl px-4 pb-3 sm:px-6">
                <GroupMetricsBar metrics={groupMetrics} />
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-md text-center">
            <Users className="mx-auto mb-4 size-8 text-foreground-subtlest" />
            <h2 className="text-ui-lg font-medium">{t("emptyTitle")}</h2>
            <p className="mt-3 text-ui-base leading-relaxed text-foreground-subtle">
              {t(groups.length > 0 ? "selectHint" : "emptyDescription")}
            </p>
            <Button type="button" size="lg" className="mt-5" onClick={() => setDialog("create")}>
              <Plus />
              {t("create")}
            </Button>
          </div>
        </div>
      )}
      {dialog === "create" || (dialog === "edit" && group) ? (
        <GroupEditDialog
          key={dialog === "edit" ? group?.id : "new"}
          group={dialog === "edit" ? group : null}
          frozen={dialog === "edit" && Boolean(running)}
          onClose={() => setDialog(null)}
          onSave={async (config, identity) => {
            const selectedAtStart = selectedGroup.current;
            const id = await runtime.save(config, identity);
            if (selectedGroup.current === selectedAtStart) onSelectGroup(id);
          }}
        />
      ) : null}
      <Dialog
        open={dialog === "delete" && Boolean(group)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDialog(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {intl.formatMessage(
                { id: "studio.groups.deleteDescription" },
                { name: group?.name ?? "" },
              )}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-ui-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => setDialog(null)}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting || Boolean(running)}
              onClick={() =>
                void (async () => {
                  if (!group || deletingRef.current || running) return;
                  deletingRef.current = true;
                  setDeleting(true);
                  setError("");
                  try {
                    await runtime.remove(group.id);
                    setDialog(null);
                    if (selectedGroup.current === group.id) onSelectGroup(null);
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : String(cause));
                  } finally {
                    deletingRef.current = false;
                    setDeleting(false);
                  }
                })()
              }
            >
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
