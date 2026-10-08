import { StudioChatPermissionControl } from "./StudioChatPermissionControl.js";
import { StudioChatStopControl } from "./StudioChatStopControl.js";
import { useStudioChatImages } from "./useStudioChatImages.js";
import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
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
import {
  CONVERSATION_DRAFT_LAYOUT,
  CONVERSATION_DRAFT_COMPOSER_LAYOUT,
} from "@/v4/conversationDraftLayout.js";
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
import { StudioSendRefusalError, type StudioSendRefusal } from "./kernelSendGate.js";
import { studioAuthHint } from "./kernelProbeView.js";
import { StudioSendRefusalNotice } from "./StudioSendRefusalNotice.js";
import { StudioChatModelControls, StudioChatOptionsNotice } from "./StudioChatModelControls.js";
import { useStudioChatOptions } from "./useStudioChatOptions.js";
import { useStudioKernelCatalog } from "./useStudioKernelCatalog.js";
import { StudioSessionActions } from "./StudioSessionActions.js";
import { type StudioImageInput } from "@knorvia/services";
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
  const [refusal, setRefusal] = useState<StudioSendRefusal | null>(null);
  const draft = storedDraft?.kernelId === kernelId ? storedDraft : undefined;
  const conversation = runtime.overview?.conversations.find(
    (item) => item.id === sessionId && item.kernel === kernelId,
  );
  const { statuses, reprobe } = useStudioKernelCatalog();
  const remote = kernelId.startsWith("ssh:");
  const status = statuses.find((item) => item.id === kernelId);
  const remoteOnline = !remote || Boolean(status?.installed);
  const text = draft?.text ?? "";
  const textTooLong = text.length > STUDIO_DRAFT_TEXT_LIMIT;
  const workspacePath =
    conversation?.workspacePath ??
    (remote ? status?.remoteWorkspacePath : draft?.workspacePath) ??
    "";
  const kernel = studioKernelOption(kernelId, statuses);
  const authHint = studioAuthHint(status, kernel.name);
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
  const imageInput = useStudioChatImages({
    sessionId,
    kernelId,
    workspacePath,
    selection,
    conversationSelection: conversation?.selection,
    config,
    modelOptions,
    runtime,
    draft,
    zh,
    mounted,
    setError,
  });
  const { images, capturing } = imageInput;
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
      (!value.trim() && !images.length && !draft?.imageSubmission) ||
      capturing ||
      !workspacePath ||
      value.length > STUDIO_DRAFT_TEXT_LIMIT
    )
      return;
    submissionInFlight.current = true;
    setSubmitting(true);
    setError("");
    setRefusal(null);
    try {
      if (await imageInput.retry()) return;
      imageInput.assertSend();
      // 发送前用当前内核的真实能力校验；被拒时不会发出任何命令，也不会改写模型或权限。
      await submitStudioChat(
        {
          sessionId,
          kernel: kernelId,
          workspacePath,
          text: value,
          selection,
          permission,
          status,
          kernelName: kernel.name,
          attachments: images.length ? (images as StudioImageInput[]) : undefined,
          isCurrent: imageInput.isCurrent,
        },
        imageInput.command,
      );
      reportStudioFirstMessageAccepted();
      if (!images.length) acknowledgeDraft(sessionId, kernelId, value);
    } catch (error) {
      if (error instanceof StudioSendRefusalError) {
        if (mounted.current) setRefusal(error.refusal);
      } else if (mounted.current) setError(error instanceof Error ? error.message : String(error));
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
                ? `SSH · ${status?.remoteEnvironmentLabel ?? "离线"} · ${workspacePath}`
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
            !runtime.ready ||
            !remoteOnline ||
            submitting ||
            capturing ||
            !workspacePath ||
            textTooLong
          }
          {...imageInput.editorProps}
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
            <StudioChatPermissionControl permission={permission} onClick={onOpenAgentSettings} />
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
                <StudioChatStopControl
                  running={running}
                  stopping={stopping}
                  enabled={Boolean(runtime.service)}
                  zh={zh}
                  onStop={stop}
                />
              )}
              <Button
                type="submit"
                size="icon-md"
                disabled={
                  !runtime.ready ||
                  !remoteOnline ||
                  submitting ||
                  !workspacePath ||
                  capturing ||
                  (!text.trim() && !images.length && !draft?.imageSubmission) ||
                  textTooLong
                }
                aria-label={
                  draft?.imageSubmission
                    ? zh
                      ? "重试原提交"
                      : "Retry original submission"
                    : zh
                      ? "发送"
                      : "Send"
                }
                // 与 Knorvia 发送按钮同一外观：圆形；不可发送时退回中性色，避免空输入仍显示为可点的黑色。
                className="rounded-full bg-primary text-ui-base text-primary-foreground hover:bg-primary/85 disabled:bg-secondary disabled:text-foreground-subtlest disabled:opacity-100"
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
      {refusal ? (
        <StudioSendRefusalNotice
          refusal={refusal}
          authHint={authHint}
          cliName={kernel.name}
          canReprobe={Boolean(runtime.service)}
          onReprobe={() => {
            setRefusal(null);
            void reprobe();
          }}
        />
      ) : null}
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
          sourceSessionId={sessionId}
          historyStartKnown={
            runtime.timeline !== undefined && runtime.timeline.nextBefore === undefined
          }
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
            <div className={cn("mx-auto w-full", CONVERSATION_DRAFT_COMPOSER_LAYOUT, contentWidth)}>
              {composer}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
