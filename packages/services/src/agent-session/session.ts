import { ServiceChannels } from "@knorvia/shared";
import type {
  TraceId,
  KnorviaAgentMcpServer,
  KnorviaDeliveryKind,
  KnorviaMessageWithParts,
  ModelSelection,
  KnorviaPermissionRequestParams,
  KnorviaUserInputRequestParams,
  KnorviaUserInputResponse,
  KnorviaSessionInfo,
  KnorviaSessionImportHistory,
  KnorviaSessionEvent,
  KnorviaSessionMode,
  KnorviaSessionPersistence,
  KnorviaSessionStateSnapshot,
  KnorviaStateUpdatedNotification,
  KnorviaWorkspacePresentation,
} from "@knorvia/shared";
import { createServiceDescriptor } from "#src/descriptors.js";

export interface KnorviaSessionWorkspaceTarget {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
}

export type KnorviaSessionReadWorkspacePresentationParams = KnorviaSessionWorkspaceTarget;

export interface KnorviaTaskTarget extends KnorviaSessionWorkspaceTarget {
  sessionId: string;
}

export interface KnorviaSessionCreateParams extends KnorviaSessionWorkspaceTarget {
  /** 仅导入事务使用的预分配 ID；普通新会话继续由 Agent 分配。 */
  sessionId?: string;
  sessionTraceId?: TraceId;
  parentSessionId?: string;
  mode?: KnorviaSessionMode;
  model?: ModelSelection;
  persistence?: KnorviaSessionPersistence;
  thoughtLevel?: string;
  mcpServers?: KnorviaAgentMcpServer[];
  importedHistory?: KnorviaSessionImportHistory;
}

export interface KnorviaSessionResumeParams extends KnorviaTaskTarget {
  model?: ModelSelection;
  thoughtLevel?: string;
  mcpServers?: KnorviaAgentMcpServer[];
  /**
   * 默认广播 resume 得到的历史快照，并让 shadow 订阅请求初始 snapshot。
   * 续聊发送前的 runtime 预恢复会关闭它，避免旧终态快照覆盖本地已开始的新输入运行态。
   */
  broadcastSnapshot?: boolean;
}

export interface KnorviaSessionListParams extends KnorviaSessionWorkspaceTarget {
  includeArchived?: boolean;
  limit?: number;
}

export interface KnorviaSessionReadParams extends KnorviaTaskTarget {
  deliveryKind?: KnorviaDeliveryKind;
  messageLimit?: number;
  afterSeq?: number;
}

export interface KnorviaSessionMessagesParams extends KnorviaTaskTarget {
  afterMessageId?: string;
  limit?: number;
}

export interface KnorviaSessionEventsParams extends KnorviaTaskTarget {
  afterSeq?: number;
  limit?: number;
}

export interface KnorviaSessionSetModelParams extends KnorviaTaskTarget {
  model: ModelSelection;
  expectedRevision?: number;
  persistAsWorkspaceLastUsed?: boolean;
}

export interface KnorviaSessionSetThoughtLevelParams extends KnorviaTaskTarget {
  thoughtLevel?: string;
  expectedRevision?: number;
  persistAsWorkspaceLastUsed?: boolean;
}

export interface KnorviaSessionSetModeParams extends KnorviaTaskTarget {
  mode: KnorviaSessionMode;
  expectedRevision?: number;
}

export interface KnorviaSessionSubscribeParams extends KnorviaTaskTarget {
  deliveryKind: KnorviaDeliveryKind;
  afterSeq?: number;
  includeSnapshot?: boolean;
  eventCoalescing?: {
    mode: "background-summary";
    intervalMs?: number;
  };
}

export type KnorviaSessionServiceEvent =
  | { type: "session.event"; event: KnorviaSessionEvent }
  | { type: "state.updated"; notification: KnorviaStateUpdatedNotification }
  | { type: "permission.request"; request: KnorviaPermissionRequestParams }
  | { type: "userInput.request"; request: KnorviaUserInputRequestParams }
  | {
      type: "userInput.response";
      requestId: string;
      response: KnorviaUserInputResponse;
    }
  | { type: "snapshot"; snapshot: KnorviaSessionStateSnapshot };

export interface KnorviaSessionInitializeResult {
  available: boolean;
  workspaceKey: string;
  protocolName?: string;
  protocolVersion?: number;
  transportKind?: "stdio" | "websocket";
  reason?: string;
  reasonCode?: "provider_not_ready";
}

export interface KnorviaSessionWorkspaceRuntimeIdentity {
  generation: number;
  identity: string;
  processId?: number;
  workspaceKey: string;
}

export interface IKnorviaSessionService {
  initializeWorkspace(
    params: KnorviaSessionWorkspaceTarget,
  ): Promise<KnorviaSessionInitializeResult>;
  getWorkspaceRuntimeIdentity(
    params: KnorviaSessionWorkspaceTarget,
  ): Promise<KnorviaSessionWorkspaceRuntimeIdentity>;
  readWorkspacePresentation(
    params: KnorviaSessionReadWorkspacePresentationParams,
  ): Promise<KnorviaWorkspacePresentation>;
  createSession(params: KnorviaSessionCreateParams): Promise<KnorviaSessionStateSnapshot>;
  resumeSession(params: KnorviaSessionResumeParams): Promise<KnorviaSessionStateSnapshot>;
  listSessions(params: KnorviaSessionListParams): Promise<KnorviaSessionInfo[]>;
  readSession(params: KnorviaSessionReadParams): Promise<KnorviaSessionStateSnapshot>;
  readSessionMessages(params: KnorviaSessionMessagesParams): Promise<KnorviaMessageWithParts[]>;
  readSessionEvents(params: KnorviaSessionEventsParams): Promise<KnorviaSessionEvent[]>;
  promoteDeferredDraftSession(params: KnorviaTaskTarget): Promise<void>;
  closeSession(params: KnorviaTaskTarget): Promise<void>;
  closeDeferredDraftSession(params: KnorviaTaskTarget): Promise<boolean>;
  setModel(params: KnorviaSessionSetModelParams): Promise<KnorviaSessionStateSnapshot>;
  setThoughtLevel(
    params: KnorviaSessionSetThoughtLevelParams,
  ): Promise<KnorviaSessionStateSnapshot>;
  setMode(params: KnorviaSessionSetModeParams): Promise<KnorviaSessionStateSnapshot>;
  // renderer 订阅面走 agentService 的 conversation/sessions-index 帧通道。
}

export const IKnorviaSessionService = createServiceDescriptor<IKnorviaSessionService>(
  ServiceChannels.KnorviaSession,
);
