import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown, Hand, LoaderCircle, Square } from "lucide-react";
import type { LexicalChatInputHandle } from "@/LexicalChatInput.js";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { ChatPromptEditor } from "@/prompt-editor/ChatPromptEditor.js";
import { ConversationComposerSurface } from "@/prompt-editor/ConversationComposerSurface.js";
import { ChatMetricsBar } from "@/chat-input-toolbar/ChatMetricsBar.js";
import { externalChatMetrics } from "@/chat-input-toolbar/chatMetrics.js";
import { useStudioAgentStore } from "@/store/studioAgentStore.js";
import { reportStudioFirstMessageAccepted } from "@/onboarding/studioFirstRunGuideEvents.js";
import { ConversationDraftEmptyState } from "@/v4/ConversationDraftEmptyState.js";
import { CONVERSATION_DRAFT_LAYOUT } from "@/v4/conversationDraftLayout.js";
import { getConversationContentWidthClassName } from "@/v4/conversationLayout.js";
import { studioKernelOption, type StudioKernelId } from "../types.js";
import { STUDIO_DRAFT_TEXT_LIMIT } from "./agentDrafts.js";
import { StudioAgentStorageNotice } from "./StudioAgentStorageNotice.js";
import {
  StudioDraftProjectMenu,
  type StudioDraftProjectMenuProps,
} from "./StudioDraftProjectMenu.js";
import { useStudioRuntime } from "../runtime/useStudioRuntime.js";
import { StudioTimeline } from "../runtime/StudioTimeline.js";
import { resolveStudioChatSelection } from "./chatSelections.js";
import { submitStudioChat } from "./chatSubmission.js";
import { StudioChatModelControls, StudioChatOptionsNotice } from "./StudioChatModelControls.js";
import { useStudioChatOptions } from "./useStudioChatOptions.js";
import { useStudioKernelCatalog } from "./useStudioKernelCatalog.js";
import { StudioSessionActions } from "./StudioSessionActions.js";
import { exportStudioConversationMarkdown } from "./sessionHandoff.js";

/** Same presentation components as Knorvia; native CLI state stays in the Host service. */
export function StudioExternalChat({
  kernelId,
  sessionId,
  workspaceMenuProps,
  onOpenAgentSettings,
  onHandoffComplete,
  onNativeHandoffComplete,
}: {
  kernelId: StudioKernelId;
  sessionId: string;
  workspaceMenuProps: StudioDraftProjectMenuProps;
  onOpenAgentSettings: () => void;
  onHandoffComplete: (kernel: StudioKernelId, sessionId: string) => void;
  onNativeHandoffComplete: (sessionId: string, workspacePath: string) => void;
}) {
  const { intl, locale } = useKnorviaIntl();
  const zh = locale.startsWith("zh");
  const inputApiRef = useRef<LexicalChatInputHandle | null>(null);
  const storedDraft = useStudioAgentStore((state) => state.drafts[sessionId]);
  const saveDraft = useStudioAgentStore((state) => state.saveDraft);
  const acknowledgeDraft = useStudioAgentStore((state) => state.acknowledgeDraft);
  const actionError = useStudioAgentStore((state) => state.actionError);
  const setSelection = useStudioAgentStore((state) => state.setDraftSelection);
  const runtime = useStudioRuntime(sessionId);
  const [submitting, setSubmitting] = useState(false);
  const submissionInFlight = useRef(false);
  const stoppingInFlight = useRef(false);
  const [stopping, setStopping] = useState(false);
  const mounted = useRef(true);
  const [error, setError] = useState("");
  const draft = storedDraft?.kernelId === kernelId ? storedDraft : undefined;
  const conversation = runtime.overview?.conversations.find(
    (item) => item.id === sessionId && item.kernel === kernelId,
  );
  const { statuses } = useStudioKernelCatalog();
  const remote = kernelId.startsWith("ssh:");
  const remoteStatus = statuses.find((item) => item.id === kernelId);
  const remoteOnline = !remote || Boolean(remoteStatus?.installed);
  const text = draft?.text ?? "";
  const textTooLong = text.length > STUDIO_DRAFT_TEXT_LIMIT;
  const workspacePath =
    conversation?.workspacePath ??
    (remote ? remoteStatus?.remoteWorkspacePath : draft?.workspacePath) ??
    "";
  const kernel = studioKernelOption(kernelId, statuses);
  const config = runtime.overview?.configs[kernelId];
  const permission = config?.permission ?? "ask";
  const selection = resolveStudioChatSelection(draft?.selection, conversation?.selection, config);
  const modelOptions = useStudioChatOptions(
    runtime.service,
    kernelId,
    workspacePath,
    config,
    selection.model,
  );
  const scope = `studio-external:${kernelId}:${sessionId}`;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    // 重新打开会话后，另一个已卸载实例收到 ACK 或显式重置草稿时，同步当前原生编辑器。
    const input = inputApiRef.current;
    if (input && input.getMarkdown() !== text) input.setText(text);
  }, [text]);
  const hasContent = Boolean(runtime.timeline?.messages.length || runtime.timeline?.runs.length);
  const running =
    runtime.timeline?.runs.find((run) => ["running", "waiting"].includes(run.state)) ??
    runtime.timeline?.runs.find((run) => run.state === "queued");
  const submit = async (value: string) => {
    // Enter 和按钮共用业务入口；React state 更新前也不能再次发出相同轮次。
    if (
      submissionInFlight.current ||
      !runtime.ready ||
      !remoteOnline ||
      !value.trim() ||
      !workspacePath ||
      value.length > STUDIO_DRAFT_TEXT_LIMIT
    )
      return;
    submissionInFlight.current = true;
    setSubmitting(true);
    setError("");
    try {
      await submitStudioChat(
        { sessionId, kernel: kernelId, workspacePath, text: value, selection },
        runtime.command,
      );
      reportStudioFirstMessageAccepted();
      acknowledgeDraft(sessionId, kernelId, value);
    } catch (error) {
      if (mounted.current) setError(error instanceof Error ? error.message : String(error));
    } finally {
      submissionInFlight.current = false;
      if (mounted.current) setSubmitting(false);
    }
  };
  const stop = async () => {
    if (!running || stoppingInFlight.current || running.cancelRequested || !runtime.service) return;
    stoppingInFlight.current = true;
    setStopping(true);
    setError("");
    try {
      await runtime.command({ type: "cancel", runId: running.id });
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      stoppingInFlight.current = false;
      if (mounted.current) setStopping(false);
    }
  };
  const contentWidth = getConversationContentWidthClassName({
    centeredEmptyLayout: !hasContent,
    statusPanelLayout: "none",
  });
  const composer = (
    <div className="chat-composer-region z-20 w-full shrink-0 @container/composer">
      <StudioAgentStorageNotice />
      <ConversationComposerSurface
        contextHeader={
          conversation || remote ? (
            <p
              className="truncate px-4 py-2 text-ui-sm text-foreground-subtle"
              title={workspacePath}
            >
              {remote
                ? `SSH · ${remoteStatus?.remoteEnvironmentLabel ?? "离线"} · ${workspacePath}`
                : workspacePath}
            </p>
          ) : (
            <StudioDraftProjectMenu
              {...workspaceMenuProps}
              kernelId={kernelId}
              sessionId={sessionId}
              workspacePath={workspacePath}
            />
          )
        }
      >
        <ChatPromptEditor
          key={scope}
          workspacePath={workspacePath}
          workspaceIdentity={scope}
          taskId={null}
          initialValue={text}
          inputApiRef={inputApiRef}
          inputTestId="studio-external-composer-input"
          placeholder={intl.formatMessage(
            { id: "studio.agents.chatPlaceholder" },
            { name: kernel.name },
          )}
          submitLabel={zh ? "发送" : "Send"}
          submitDisabled={
            !runtime.ready || !remoteOnline || submitting || !workspacePath || textTooLong
          }
          enableMentionPanel={false}
          enableSlashCommands={Boolean(modelOptions.options?.commands?.length)}
          nativeSlashCommands={modelOptions.options?.commands}
          nativeSlashOnly
          className="p-0"
          onChange={(value) => {
            saveDraft(sessionId, kernelId, value);
          }}
          onSubmit={(value) => {
            void submit(value);
            return false;
          }}
          leadingActions={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onOpenAgentSettings}
              aria-label={intl.formatMessage({ id: `studio.agents.permission.${permission}` })}
              title={intl.formatMessage({ id: `studio.agents.permission.${permission}` })}
              className="size-7 gap-1 rounded-lg p-0 text-ui-base @xl/composer:w-auto @xl/composer:px-2"
            >
              <Hand className="size-4" />
              <span className="hidden @xl/composer:inline">
                {intl.formatMessage({ id: `studio.agents.permission.${permission}` })}
              </span>
              <ChevronDown className="hidden size-3.5 @xl/composer:block" />
            </Button>
          }
          submitControl={
            <div className="flex min-w-0 items-center gap-1">
              <StudioChatModelControls
                {...modelOptions}
                selection={selection}
                disabled={!runtime.ready}
                onChange={(next) => {
                  setSelection(sessionId, kernelId, next);
                }}
                onRetry={modelOptions.retry}
              />
              {running && (
                <Button
                  type="button"
                  size="icon-md"
                  variant="outline"
                  disabled={!runtime.service || stopping || running.cancelRequested}
                  aria-label={
                    stopping || running.cancelRequested
                      ? zh
                        ? "正在停止"
                        : "Stopping"
                      : zh
                        ? "停止"
                        : "Stop"
                  }
                  title={
                    stopping || running.cancelRequested
                      ? zh
                        ? "正在停止"
                        : "Stopping"
                      : zh
                        ? "停止"
                        : "Stop"
                  }
                  onClick={() => void stop()}
                >
                  {stopping || running.cancelRequested ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <Square className="size-3.5" />
                  )}
                </Button>
              )}
              <Button
                type="submit"
                size="icon-md"
                disabled={
                  !runtime.ready ||
                  !remoteOnline ||
                  submitting ||
                  !workspacePath ||
                  !text.trim() ||
                  textTooLong
                }
                aria-label={zh ? "发送" : "Send"}
                className="rounded-lg bg-brand text-ui-base text-foreground-inverse hover:bg-brand/80"
              >
                <ArrowUp className="size-4" />
              </Button>
            </div>
          }
        />
      </ConversationComposerSurface>
      {hasContent && runtime.timeline ? (
        <ChatMetricsBar metrics={externalChatMetrics(runtime.timeline)} />
      ) : null}
      <StudioChatOptionsNotice
        {...modelOptions}
        selection={selection}
        onRetry={modelOptions.retry}
      />
      {(!runtime.ready ||
        !remoteOnline ||
        !workspacePath ||
        error ||
        runtime.error ||
        actionError) && (
        <p
          role={error || runtime.error || actionError ? "alert" : "status"}
          className="mt-2 break-words px-2 text-ui-sm text-foreground-subtle"
        >
          {error ||
            runtime.error ||
            (!remoteOnline &&
              (zh
                ? "SSH Agent 已离线，请重连对应服务器"
                : "SSH Agent offline. Reconnect the server.")) ||
            (actionError && intl.formatMessage({ id: `studio.agents.error.${actionError}` })) ||
            (!runtime.ready
              ? runtime.service
                ? zh
                  ? "正在读取对话…"
                  : "Loading conversation…"
                : intl.formatMessage({ id: "studio.agents.sendUnavailable" })
              : zh
                ? "选择项目后即可发送"
                : "Select a project to send")}
        </p>
      )}
    </div>
  );
  return (
    <section
      className="@container/conversation flex h-full min-h-0 min-w-0 flex-col text-foreground"
      data-testid="studio-external-chat"
      data-kernel-id={kernelId}
    >
      {conversation && hasContent && (
        <StudioSessionActions
          service={runtime.service}
          messages={runtime.timeline?.messages ?? []}
          exportTranscript={() => {
            if (!runtime.service) throw new Error("Studio Runtime unavailable");
            return exportStudioConversationMarkdown(
              runtime.service,
              sessionId,
              conversation.title || kernel.name,
              kernel.name,
            );
          }}
          sourceKernel={kernelId}
          workspacePath={workspacePath}
          title={conversation.title || kernel.name}
          statuses={statuses}
          onHandoffComplete={onHandoffComplete}
          onNativeHandoffComplete={onNativeHandoffComplete}
        />
      )}
      {hasContent ? (
        <>
          <StudioTimeline targetId={sessionId} />
          <div className={cn("mx-auto shrink-0 px-4 pb-4", contentWidth)}>{composer}</div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]">
          <div className={CONVERSATION_DRAFT_LAYOUT}>
            <ConversationDraftEmptyState />
            <div className={cn("mx-auto w-full", contentWidth)}>{composer}</div>
          </div>
        </div>
      )}
    </section>
  );
}
