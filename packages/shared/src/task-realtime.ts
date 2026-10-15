// SPDX-License-Identifier: Apache-2.0
// task realtime 共享合约：事件/lease/owner-command 类型面（纯声明）。
// 运行时 zod schema 与 resolveWorkspaceKey 在 task-realtime-core.ts（幸存面）；
// 基础传输类型在 task-types-core.ts。本文件与旧 realtime 总线组同生命周期。
import type {
  KnorviaTaskClientMode,
  KnorviaTaskRuntimeCommand,
  KnorviaTaskMeta,
  TraceId,
  TaskRealtimeReason,
  TaskStreamWatermark,
  TaskStreamMirrorUserMessageOp,
  TaskStreamMirrorStreamEventOp,
  TaskStreamMirrorOp,
} from "./task-types-core.js";
import type { KnorviaPermissionResponse } from "./protocol-legacy-types.js";
import type { WorkspaceHookReviewDecision } from "./protocol-v4/workspace-hook-review.js";

export type TaskRealtimeEnvelope = {
  eventId: /* 事件标识 */ string;
  workspacePath: /* 工作区路径 */ string;
  workspaceIdentity?: /* 身份 key（远程场景） */ string;
  workspaceKey: /* 身份 key 派生的路由键 */ string;
  traceId: /* 链路追踪 ID */ TraceId;
  createdAt: /* 产生时刻毫秒 */ number;
};

export type TaskRealtimeInvalidationBaseEvent = TaskRealtimeEnvelope & {
  reason: /* 失效原因 */ TaskRealtimeReason;
  streamWatermark?: /* 失效时的水位 */ TaskStreamWatermark;
};

export type TaskSnapshotInvalidatedEvent = TaskRealtimeInvalidationBaseEvent & {
  type: /* 判别标签 */ "task_snapshot_invalidated";
  taskId: /* 目标任务 */ string;
};

export type WorkspaceTaskListInvalidatedEvent = TaskRealtimeInvalidationBaseEvent & {
  type: /* 判别标签 */ "workspace_task_list_invalidated";
  taskId?: /* 关联任务；列表级失效可缺席 */ string;
  taskMeta?: /* 任务元信息快照 */ KnorviaTaskMeta;
};

export type TaskStreamMirrorTarget = {
  workspacePath: /* 工作区路径 */ string;
  workspaceIdentity?: /* 身份 key（远程场景） */ string;
  workspaceKey: /* 路由键 */ string;
  taskId: /* 目标任务 */ string;
  runId: /* 目标运行 */ string;
  traceId: /* 链路追踪 ID */ TraceId;
  ownerClientId?: /* 属主客户端 */ string;
  ownerDeviceLabel?: /* 属主设备标签 */ string;
};

export type TaskStreamMirrorPublishOp =
  | TaskStreamMirrorUserMessageOp
  | TaskStreamMirrorStreamEventOp;

export type TaskStreamMirrorBatchEvent = TaskRealtimeEnvelope & {
  type: /* 判别标签 */ "task_stream_mirror_batch";
  taskId: /* 目标任务 */ string;
  runId: /* 目标运行 */ string;
  ownerClientId?: /* 属主客户端 */ string;
  ownerDeviceLabel?: /* 属主设备标签 */ string;
  batchSeq: /* 批次序号 */ number;
  fromSeq: /* 批内起始序号 */ number;
  toSeq: /* 批内结束序号 */ number;
  ops: /* 镜像操作序列 */ TaskStreamMirrorOp[];
  terminal: /* 是否终态批次 */ boolean;
};

export type TaskRealtimeDeliveryPurpose = "observer" | "relay_owner";

export type TaskRealtimeHostDeliveryKind = "desktop_window" | "relay_bridge";

export type TaskRunLeaseTarget = TaskStreamMirrorTarget;

export type TaskRunLeaseAcquireRequest = TaskRunLeaseTarget & {
  leaseRequestId: /* 租约请求标识 */ string;
};

type LeaseAcquired = {
  leaseRequestId: /* 租约请求标识 */ string;
  acquired: /* 是否取得租约 */ true;
  ownerHostId: /* 当前属主 Host */ string;
};

type LeaseOwnedElsewhere = {
  leaseRequestId: /* 租约请求标识 */ string;
  acquired: /* 是否取得租约 */ false;
  ownerHostId: /* 当前属主 Host */ string;
  reason: /* 拒绝原因：被其他 Host 持有 */ "owned_by_other_host";
};

export type TaskRunLeaseResult = LeaseAcquired | LeaseOwnedElsewhere;

type StopGenerationCommand = {
  commandRequestId: /* 命令请求标识 */ string;
  type: /* 判别标签 */ "stop_generation";
  workspacePath: /* 工作区路径 */ string;
  workspaceIdentity?: /* 身份 key（远程场景） */ string;
  workspaceKey: /* 路由键 */ string;
  taskId: /* 目标任务 */ string;
  runId: /* 目标运行 */ string;
};

type RespondPermissionCommand = {
  commandRequestId: /* 命令请求标识 */ string;
  type: /* 判别标签 */ "respond_permission";
  workspacePath: /* 工作区路径 */ string;
  workspaceIdentity?: /* 身份 key（远程场景） */ string;
  workspaceKey: /* 路由键 */ string;
  taskId: /* 目标任务 */ string;
  runId: /* 目标运行 */ string;
  permissionRequestId: /* 被回应的权限请求 */ string;
  optionId: /* 被选择的选项 */ string;
  response: /* 权限回应载荷 */ KnorviaPermissionResponse;
};

type RespondElicitationCommand = {
  commandRequestId: /* 命令请求标识 */ string;
  type: /* 判别标签 */ "respond_elicitation";
  workspacePath: /* 工作区路径 */ string;
  workspaceIdentity?: /* 身份 key（远程场景） */ string;
  workspaceKey: /* 路由键 */ string;
  taskId: /* 目标任务 */ string;
  runId: /* 目标运行 */ string;
  elicitationRequestId: /* 被回应的征询请求 */ string;
  action: /* 回应动作 */ "accept" | "decline" | "cancel";
  content?: /* 补充内容 */ Record<string, unknown>;
};

type RespondWorkspaceHookReviewCommand = {
  commandRequestId: /* 命令请求标识 */ string;
  type: /* 判别标签 */ "respond_workspace_hook_review";
  workspacePath: /* 工作区路径 */ string;
  workspaceIdentity?: /* 身份 key（远程场景） */ string;
  workspaceKey: /* 路由键 */ string;
  remoteSessionId?: /* 远程会话标识 */ string;
  taskId: /* 目标任务 */ string;
  runId: /* 目标运行 */ string;
  sessionId: /* 目标会话 */ string;
  bundleDigest: /* hook bundle 摘要 */ string;
  reviewFlowId: /* 审核流标识 */ string;
  generation: /* 审核代数 */ number;
  interactionId: /* 交互标识 */ string;
  decision: /* 审核决定 */ WorkspaceHookReviewDecision;
};

type EnqueueTaskCommand = {
  commandRequestId: /* 命令请求标识 */ string;
  type: /* 判别标签 */ "enqueue_task_command";
  workspacePath: /* 工作区路径 */ string;
  workspaceIdentity?: /* 身份 key（远程场景） */ string;
  workspaceKey: /* 路由键 */ string;
  taskId: /* 目标任务 */ string;
  runId: /* 目标运行 */ string;
  taskCommand: /* 入队的运行时命令 */ Extract<KnorviaTaskRuntimeCommand, { type: "send_prompt" }>;
};

type PromoteTaskCommand = {
  commandRequestId: /* 命令请求标识 */ string;
  type: /* 判别标签 */ "promote_task_command";
  workspacePath: /* 工作区路径 */ string;
  workspaceIdentity?: /* 身份 key（远程场景） */ string;
  workspaceKey: /* 路由键 */ string;
  taskId: /* 目标任务 */ string;
  runId: /* 目标运行 */ string;
  commandId: /* 被提升的命令 */ string;
  clientMode: /* 提升目标模式 */ Extract<KnorviaTaskClientMode, "web-remote-replayable">;
};

type CancelTaskCommand = {
  commandRequestId: /* 命令请求标识 */ string;
  type: /* 判别标签 */ "cancel_task_command";
  workspacePath: /* 工作区路径 */ string;
  workspaceIdentity?: /* 身份 key（远程场景） */ string;
  workspaceKey: /* 路由键 */ string;
  taskId: /* 目标任务 */ string;
  runId: /* 目标运行 */ string;
  commandId: /* 被取消的命令 */ string;
  clientMode: /* 取消来源模式 */ Extract<KnorviaTaskClientMode, "web-remote-replayable">;
};

export type TaskOwnerCommandRequest =
  | StopGenerationCommand
  | RespondPermissionCommand
  | RespondElicitationCommand
  | RespondWorkspaceHookReviewCommand
  | EnqueueTaskCommand
  | PromoteTaskCommand
  | CancelTaskCommand;

export type TaskOwnerCommandDelivery = TaskOwnerCommandRequest & {
  requesterHostId: /* 发起方 Host */ string;
};

const OWNER_COMMAND_ERROR_TABLE = {
  NO_ACTIVE_TASK_OWNER: true,
  STALE_TASK_OWNER_COMMAND: true,
  OWNER_COMMAND_FAILED: true,
} as const;
export type TaskOwnerCommandErrorCode = keyof typeof OWNER_COMMAND_ERROR_TABLE;

type OwnerCommandSucceeded = {
  commandRequestId: /* 命令请求标识 */ string;
  success: /* 是否成功 */ true;
  taskCommand?: /* 成功时派生的运行时命令 */ KnorviaTaskRuntimeCommand;
};

type OwnerCommandFailed = {
  commandRequestId: /* 命令请求标识 */ string;
  success: /* 是否成功 */ false;
  error: /* 可读错误文本 */ string;
  code?: /* 结构化错误码 */ TaskOwnerCommandErrorCode;
};

export type TaskOwnerCommandResult = OwnerCommandSucceeded | OwnerCommandFailed;

export type TaskRealtimeEvent =
  | TaskSnapshotInvalidatedEvent
  | WorkspaceTaskListInvalidatedEvent
  | TaskStreamMirrorBatchEvent;

export type TaskRealtimeDeliveredEvent = TaskRealtimeEvent & {
  originHostId: /* 事件来源 Host */ string;
  deliveryPurpose?: /* 投递用途 */ TaskRealtimeDeliveryPurpose;
};
