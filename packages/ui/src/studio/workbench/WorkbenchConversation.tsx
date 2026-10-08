import { useCallback, useEffect, useRef, useState } from "react";
import { useServices } from "@/hooks/useServices.js";
import { useWorkspaceServicesResolution } from "@/hooks/useWorkspaceServices.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { remoteAgentServiceGeneration } from "@/lib/remoteAgentServiceGeneration.js";
import { SessionPane } from "@/v4/SessionPane.js";
import { PaneRestoredGuard } from "@/v4/WorkbenchPane.js";
import { V4PaneConversationProvider } from "@/v4/V4ConversationContext.js";
import { StudioExternalChat } from "../agents/StudioExternalChat.js";
import type { StudioDraftProjectMenuProps } from "../agents/StudioDraftProjectMenu.js";
import { useStudioRuntime } from "../runtime/useStudioRuntime.js";
import { claimWorkbenchConnection } from "./workbenchConnection.js";
import { useTaskWorkbench } from "./workbenchStore.js";
import type { WorkbenchTile } from "./workbenchModel.js";

export interface WorkbenchConversationProps {
  pane: string;
  tile: WorkbenchTile;
  focused: boolean;
  visible: boolean;
  isDesktop: boolean;
  workspaceMenuProps: StudioDraftProjectMenuProps;
  onOpenAgentSettings(): void;
}
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="p-5 text-ui-sm text-foreground-subtle">
      {children}
    </p>
  );
}
function useBindingUpdate(pane: string, tile: WorkbenchTile, service: object | undefined) {
  const latest = useRef({ live: true, pane, tile, service });
  latest.current = { ...latest.current, pane, tile, service };
  useEffect(() => {
    latest.current.live = true;
    return () => {
      latest.current.live = false;
    };
  }, []);
  return (patch: Partial<WorkbenchTile>) => {
    const current = latest.current;
    // 等待创建/交接期间 Host、会话或组件换代时，旧回执只属于原目标。
    if (
      !current.live ||
      current.service !== service ||
      current.tile.id !== tile.id ||
      current.tile.sessionId !== tile.sessionId ||
      current.tile.kernel !== tile.kernel
    )
      return;
    useTaskWorkbench.getState().update(current.pane, patch, tile.id);
  };
}
function KnorviaConversation(props: WorkbenchConversationProps) {
  const { tile, pane, focused, visible, isDesktop } = props;
  const { locale } = useKnorviaIntl(),
    zh = locale.startsWith("zh");
  const service = useServices().agentService;
  const generation = remoteAgentServiceGeneration(service);
  const target = `${generation}:${tile.sessionId}`;
  const [verified, setVerified] = useState("");
  const [missing, setMissing] = useState("");
  const update = useBindingUpdate(pane, tile, service);
  const confirm = useCallback(() => setVerified(target), [target]);
  const absent = useCallback(() => setMissing(target), [target]);
  if (!claimWorkbenchConnection(tile.id, service))
    return (
      <Notice>
        {zh
          ? "连接已变化，请在单聊核对并重新加入工作台。"
          : "The Host changed. Verify this conversation in Chats and add it again."}
      </Notice>
    );
  if (missing === target)
    return (
      <Notice>
        {zh
          ? "当前项目中未找到此会话，格子已保留。"
          : "This conversation was not found in the project. Its tile is preserved."}
      </Notice>
    );
  // 恢复会话先核对当前 endpoint 的真实索引，不把已删除会话当作新任务。
  if (tile.sessionId && verified !== target)
    return (
      <>
        <Notice>{zh ? "正在核对会话连接…" : "Checking the conversation connection…"}</Notice>
        <PaneRestoredGuard
          paneId={pane}
          scope={tile.scope}
          sessionId={tile.sessionId}
          onConfirmed={confirm}
          onMissing={absent}
        />
      </>
    );
  return (
    <SessionPane
      key={generation}
      paneId={`task-workbench-${tile.id}`}
      sessionId={tile.sessionId}
      {...tile.scope}
      isDesktop={isDesktop}
      focused={focused}
      telemetryVisible={visible}
      onSessionCreated={(id) => {
        setVerified(`${generation}:${id}`);
        update({ sessionId: id, existing: true });
      }}
      onSessionDeleted={() => {
        setMissing(target);
      }}
      onHandoffComplete={(kernel, sessionId) => update({ kernel, sessionId, existing: true })}
    />
  );
}
function ExternalConversation({
  tile,
  pane,
  workspaceMenuProps,
  onOpenAgentSettings,
}: WorkbenchConversationProps) {
  const { locale } = useKnorviaIntl(),
    zh = locale.startsWith("zh");
  const runtime = useStudioRuntime(tile.sessionId ?? undefined);
  const update = useTaskWorkbench((state) => state.update);
  const bind = useBindingUpdate(pane, tile, runtime.service);
  const conversation = runtime.overview?.conversations.find((item) => item.id === tile.sessionId);
  const matched =
    conversation?.kernel === tile.kernel &&
    (!tile.existing || conversation.workspacePath === tile.scope.workspacePath);
  const sameHost = runtime.service && claimWorkbenchConnection(tile.id, runtime.service);
  useEffect(() => {
    // 草稿项目仍由原聊天组件控制；首次受理后以 Host 的目录固化绑定。
    if (sameHost && matched && conversation && !tile.existing)
      update(
        pane,
        { existing: true, scope: { workspacePath: conversation.workspacePath } },
        tile.id,
      );
  }, [sameHost, matched, conversation, tile.existing, tile.id, pane, update]);
  if (!sameHost)
    return (
      <Notice>
        {zh
          ? "连接不可用或已变化，请在单聊核对后重新加入工作台。"
          : "The Host is unavailable or changed. Verify the chat before adding it again."}
      </Notice>
    );
  if (!runtime.ready)
    return (
      <Notice>{runtime.error || (zh ? "正在连接会话…" : "Connecting to the conversation…")}</Notice>
    );
  if ((tile.existing || conversation) && !matched)
    return (
      <Notice>
        {zh
          ? "当前 Host 中未找到匹配的内核和项目，会话格子已保留。"
          : "The kernel and project do not match this Host. The tile is preserved."}
      </Notice>
    );
  return (
    <StudioExternalChat
      key={`${runtime.connectionKey}:${tile.sessionId}`}
      kernelId={tile.kernel}
      sessionId={tile.sessionId!}
      workspaceMenuProps={workspaceMenuProps}
      onOpenAgentSettings={onOpenAgentSettings}
      onHandoffComplete={(kernel, sessionId) => bind({ kernel, sessionId, existing: true })}
      onNativeHandoffComplete={(sessionId, workspacePath) =>
        bind({ kernel: "knorvia", sessionId, scope: { workspacePath }, existing: true })
      }
    />
  );
}
export function WorkbenchConversation(props: WorkbenchConversationProps) {
  return props.tile.kernel === "knorvia" ? (
    <KnorviaScope {...props} />
  ) : (
    <ExternalConversation {...props} />
  );
}
function KnorviaScope(props: WorkbenchConversationProps) {
  const { workspacePath, workspaceIdentity, remoteSessionId } = props.tile.scope;
  const target = useWorkspaceServicesResolution(
    workspacePath,
    remoteSessionId ?? null,
    workspaceIdentity ?? null,
  );
  const { locale } = useKnorviaIntl();
  if (!target.rpcReady)
    return (
      <Notice>
        {locale.startsWith("zh")
          ? "等待项目连接，格子已保留。"
          : "Waiting for the project connection. This tile is preserved."}
      </Notice>
    );
  // 重连可能替换 endpoint；索引守卫、SessionPane 和 provider 必须使用同一个已解析坐标。
  const scope = { ...props.tile.scope, remoteSessionId: target.remoteSessionId ?? undefined };
  return (
    <V4PaneConversationProvider scope={scope}>
      <KnorviaConversation {...props} tile={{ ...props.tile, scope }} />
    </V4PaneConversationProvider>
  );
}
