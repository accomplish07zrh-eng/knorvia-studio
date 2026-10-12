import type {
  ActiveToolCall,
  CollaborationMode,
  PendingPermission,
  PendingSteerInputInfo,
  SessionProjection,
  SessionStatus,
} from "../interfaces/session.port.js";

// 保留 canonical template、默认值及 module 初始化时间；不计为新的原创表达。
export const initialSessionProjection = {
  createdAt: new Date(),
  updatedAt: new Date(),
  mode: "build" as CollaborationMode,
  status: "idle" as SessionStatus,
  turnCount: 0,
  totalTokenCount: 0,
  contextUsed: 0,
  contextWindow: 200000,
  pendingPermissions: [] as PendingPermission[],
  pendingSteerInputs: [] as PendingSteerInputInfo[],
  activeToolCalls: [] as ActiveToolCall[],
  streamingToolLedger: [] as SessionProjection["streamingToolLedger"],
  backgroundTasks: [] as SessionProjection["backgroundTasks"],
  currentTurnId: undefined as string | undefined,
  lastError: undefined as SessionProjection["lastError"],
  lastCompact: undefined as SessionProjection["lastCompact"],
  lastCheckpoint: undefined as SessionProjection["lastCheckpoint"],
  lastStreamRecoveryAnchor: undefined as SessionProjection["lastStreamRecoveryAnchor"],
  lastRewind: undefined as SessionProjection["lastRewind"],
  target: undefined as SessionProjection["target"],
  targetCompletionVerifications: [] as SessionProjection["targetCompletionVerifications"],
  targetCompletionVerificationTimeline:
    [] as SessionProjection["targetCompletionVerificationTimeline"],
};
