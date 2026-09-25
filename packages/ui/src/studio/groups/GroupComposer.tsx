import { useEffect, useRef, useState } from "react";
import { ArrowUp, AtSign, Folder, MessagesSquare, Network, Square } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { reportStudioFirstMessageAccepted } from "@/onboarding/studioFirstRunGuideEvents.js";
import { useStudioGroupStore } from "@/store/studioGroupStore.js";
import { studioKernelOptions } from "../types.js";
import { useStudioKernelCatalog } from "../agents/useStudioKernelCatalog.js";
import { useStudioRuntime } from "../runtime/useStudioRuntime.js";
import { activeGroupRun, submitGroupDraft } from "./groupSubmission.js";
import {
  GROUP_LIMITS,
  insertGroupMention,
  type StudioGroup,
  type StudioGroupMode,
} from "./groupModel.js";

export function GroupComposer({
  group,
  onEditProject,
  onChangeMode,
}: {
  group: StudioGroup;
  onEditProject: () => void;
  onChangeMode: (mode: StudioGroupMode) => Promise<void>;
}) {
  const { intl, locale } = useKnorviaIntl();
  const { statuses } = useStudioKernelCatalog();
  const t = (id: string) => intl.formatMessage({ id: `studio.groups.${id}` });
  const saveDraft = useStudioGroupStore((state) => state.saveDraft);
  const clearDraftIfUnchanged = useStudioGroupStore((state) => state.clearDraftIfUnchanged);
  const storageIssue = useStudioGroupStore((state) => state.storageIssue);
  const runtime = useStudioRuntime(group.id);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [stopping, setStopping] = useState(false);
  const stopInFlight = useRef(false);
  const stopAttempt = useRef(0);
  const stoppedRun = useRef<string | null>(null);
  const [error, setError] = useState("");
  const latestDraft = useRef(group.draft);
  latestDraft.current = group.draft;
  const running = activeGroupRun(runtime.timeline?.runs);
  useEffect(() => {
    if (stoppedRun.current && stoppedRun.current !== running?.id) {
      stoppedRun.current = null;
      stopAttempt.current++;
      stopInFlight.current = false;
      setStopping(false);
    }
  }, [running?.id]);
  const action = async (operation: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const send = () =>
    action(async () => {
      if (!runtime.ready) return;
      const epoch = stopAttempt.current;
      const accepted = await submitGroupDraft({
        group,
        active: running,
        command: runtime.command,
        currentDraft: () => latestDraft.current,
        clearDraft: (submitted) => clearDraftIfUnchanged(group.id, submitted),
        canSubmit: () => epoch === stopAttempt.current && !stoppedRun.current,
      });
      if (accepted) reportStudioFirstMessageAccepted();
    });
  const stop = async () => {
    if (!running || stopInFlight.current) return;
    // 停止不与发送共用 busy，否则网络等待会让用户失去停止入口。
    stoppedRun.current = running.id;
    const attempt = ++stopAttempt.current;
    stopInFlight.current = true;
    setStopping(true);
    setError("");
    try {
      await runtime.command({ type: "cancel", runId: running.id });
    } catch (cause) {
      // 回执丢失不能证明停止未被接受，保留发送冻结并允许重试同一次停止。
      if (attempt === stopAttempt.current) {
        setStopping(false);
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (attempt === stopAttempt.current) stopInFlight.current = false;
    }
  };
  const input = useRef<HTMLTextAreaElement>(null);
  const caret = useRef({ start: group.draft.length, end: group.draft.length });
  const [mentionOpen, setMentionOpen] = useState(false);
  const members = studioKernelOptions(statuses, group.members).filter((kernel) =>
    group.members.includes(kernel.id),
  );
  const offlineRemoteMembers = members.filter(
    (kernel) =>
      kernel.id.startsWith("ssh:") &&
      !statuses.some((status) => status.id === kernel.id && status.installed),
  );
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4 sm:px-6">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mb-1 max-w-full text-foreground-subtle"
        onClick={onEditProject}
        disabled={Boolean(running)}
        title={group.workspacePath || t("selectProject")}
      >
        <Folder className="size-4 shrink-0" />
        <span className="truncate">
          {group.workspacePath?.split(/[\\/]/).filter(Boolean).at(-1) || t("selectProject")}
        </span>
      </Button>
      <div
        data-knorvia-composer=""
        className="rounded-2xl border border-input-border bg-input shadow-sm"
      >
        <Textarea
          ref={input}
          aria-label={t("composerLabel")}
          placeholder={t(running?.taskMode ? "steer" : "composerPlaceholder")}
          data-testid="studio-group-composer"
          value={group.draft}
          maxLength={GROUP_LIMITS.draft}
          className="min-h-28 max-h-64 rounded-t-2xl rounded-b-none border-0 bg-transparent px-4 pt-4 pb-2 focus-visible:ring-0"
          onSelect={(event) => {
            caret.current = {
              start: event.currentTarget.selectionStart,
              end: event.currentTarget.selectionEnd,
            };
          }}
          onChange={(event) => {
            const { value, selectionStart, selectionEnd } = event.currentTarget;
            latestDraft.current = value;
            caret.current = { start: selectionStart, end: selectionEnd };
            saveDraft(group.id, value);
            if (value.slice(0, selectionStart).endsWith("@")) setMentionOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <div className="flex flex-wrap items-center gap-1 px-3 pb-3">
          <DropdownMenu open={mentionOpen} onOpenChange={setMentionOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label={t("mention")}
                title={t("mention")}
              >
                <AtSign />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                input.current?.focus();
              }}
            >
              <DropdownMenuItem
                onSelect={() => {
                  const next = insertGroupMention(
                    group.draft,
                    caret.current.start,
                    caret.current.end,
                    "all",
                  );
                  if (next.text.length > GROUP_LIMITS.draft) return;
                  latestDraft.current = next.text;
                  saveDraft(group.id, next.text);
                  caret.current = { start: next.cursor, end: next.cursor };
                  requestAnimationFrame(() => {
                    input.current?.focus();
                    input.current?.setSelectionRange(next.cursor, next.cursor);
                  });
                }}
              >
                @{t("allMembers")}
              </DropdownMenuItem>
              {members.map((kernel) => (
                <DropdownMenuItem
                  key={kernel.id}
                  onSelect={() => {
                    const next = insertGroupMention(
                      group.draft,
                      caret.current.start,
                      caret.current.end,
                      kernel.id,
                    );
                    if (next.text.length > GROUP_LIMITS.draft) return;
                    latestDraft.current = next.text;
                    saveDraft(group.id, next.text);
                    caret.current = { start: next.cursor, end: next.cursor };
                    requestAnimationFrame(() => {
                      input.current?.focus();
                      input.current?.setSelectionRange(next.cursor, next.cursor);
                    });
                  }}
                >
                  @{kernel.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Select
            value={group.mode}
            disabled={busy || !runtime.ready || Boolean(running)}
            onValueChange={(mode) => void action(() => onChangeMode(mode as StudioGroupMode))}
          >
            <SelectTrigger variant="ghost" size="lg" aria-label={t("mode")}>
              {group.mode === "manual" ? (
                <MessagesSquare className="size-4" />
              ) : (
                <Network className="size-4" />
              )}
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">{t("manual")}</SelectItem>
              <SelectItem value="task">{t("task")}</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            {group.draft ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-foreground-subtle"
                onClick={() => {
                  latestDraft.current = "";
                  saveDraft(group.id, "");
                }}
              >
                {t("clearDraft")}
              </Button>
            ) : null}
            {running && (
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                aria-label={t(stopping || running.cancelRequested ? "stopping" : "stop")}
                title={t(stopping || running.cancelRequested ? "stopping" : "stop")}
                disabled={stopping || running.cancelRequested}
                onClick={() => void stop()}
              >
                <Square className="size-4" />
              </Button>
            )}
            <Button
              type="button"
              size="icon-lg"
              disabled={
                busy ||
                Boolean(stoppedRun.current) ||
                running?.cancelRequested ||
                !runtime.ready ||
                (group.mode === "task" && offlineRemoteMembers.length > 0 && !running) ||
                !group.draft.trim() ||
                !group.workspacePath
              }
              aria-label={t("send")}
              aria-describedby="studio-group-send-status"
              onClick={() => void send()}
            >
              <ArrowUp />
            </Button>
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-ui-xs text-foreground-subtlest">
        <span id="studio-group-send-status">
          {t(
            stoppedRun.current || running?.cancelRequested
              ? "stopping"
              : !runtime.ready
                ? "notConnected"
                : running?.taskMode
                  ? "steer"
                  : running
                    ? "running"
                    : "ready",
          )}
        </span>
        {!storageIssue ? <span>{t(group.draft ? "saved" : "local")}</span> : null}
      </div>
      {offlineRemoteMembers.length > 0 ? (
        <p role="status" className="mt-2 text-ui-sm text-foreground-subtle">
          {locale.startsWith("zh")
            ? `SSH Agent ${offlineRemoteMembers.map((member) => member.name).join("、")} 已离线；重连对应服务器后才能派发给这些成员。`
            : `SSH agents ${offlineRemoteMembers.map((member) => member.name).join(", ")} are offline. Reconnect their servers before assigning work.`}
        </p>
      ) : null}
      {error && (
        <p role="alert" className="mt-2 break-words text-ui-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
