// SPDX-License-Identifier: Apache-2.0
// 闲时任务（Off-Peak Task）领域类型（B41）。
// off_peak_tasks 存 tasks-index.sqlite；与 automation 共用 scheduler 进程与派发管道，
// 但数据表、消息类型、状态机全部独立，禁止往 KnorviaAutomation 上加字段。
import type { KnorviaTaskMode } from "./task-types-core.js";
import type { ModelSelection } from "./model-selection.js";

const OFF_PEAK_STATUS_TABLE = {
  queued: "queued",
  paused: "paused",
  running: "running",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
} as const; // 六态取值冻结
// 客户端执行态六态（服务端准入态 queued/ready/active/expired/settled 是另一根轴）：
// queued 排队等服务端 ready；paused 是用户 Pause 后停止派发；running 为执行中
// （permission/elicitation 在普通 session 内等的时候聚合态照旧 running）；
// completed / failed / cancelled 三者是终态。
export type KnorviaOffPeakTaskStatus = // 六态联合
  (typeof OFF_PEAK_STATUS_TABLE)[keyof typeof OFF_PEAK_STATUS_TABLE];

// 终态集合：不可逆出（状态机不变量）。
export const OFF_PEAK_TERMINAL_STATUSES = ["completed", "failed", "cancelled"] as const; // 终态表

export function isOffPeakTerminalStatus(
  current: KnorviaOffPeakTaskStatus,
): current is "completed" | "failed" | "cancelled" {
  return (OFF_PEAK_TERMINAL_STATUSES as readonly string[]).includes(current); // 终态判 membership
}

// 票据不可用（服务端 400/3102：active 3h 到期 / ready 5min 废票 / settled / 非本人）的稳定错误
// 标记。cli 适配层把该业务码分类为不可重试失败并把标记嵌进错误消息；host 终态回写据此走
// 「同 task_id 重新取号 → resume 续跑」而不是落 failed。跨进程只能靠错误文本传递，标记必须
// 全链路唯一且稳定，勿改；与 apps/cli/packages/adapters/src/model/offpeak-retry.ts 同名常量跨包同值。
export const OFF_PEAK_TICKET_EXPIRED_MARKER = "off-peak-ticket-expired"; // 标记文本勿改

// Off-Peak Provider 与当前账号 Family 同身份；任务保存精确选择，不跨 Family 静默迁移。
const OFF_PEAK_PROVIDER_TABLE = {
  zai: /* zai 家族 */ "account:zai-offpeak-idle-plan",
  bigmodel: /* bigmodel 家族 */ "account:bigmodel-offpeak-idle-plan",
} as const;

export const OFF_PEAK_PROVIDER_IDS = OFF_PEAK_PROVIDER_TABLE;

export function resolveOffPeakProviderId(
  // 家族 → provider ID
  family: /* 归属家族 */ "zai" | "bigmodel",
): (typeof OFF_PEAK_PROVIDER_TABLE)[typeof family] {
  return OFF_PEAK_PROVIDER_TABLE[family]; // 家族键直查
}

const CODING_PLAN_KIND_TABLE = {
  zaiPersonal: "zai-personal",
  bigmodelPersonal: "bigmodel-personal",
  bigmodelTeam: "bigmodel-team",
  zaiTeam: "zai-team",
} as const; // 计划形态四值
// 当前 selected connection 可供 Off-Peak 使用的真实 Coding Plan 形态。
// zai/bigmodel Team Plan 已对称化，所以有 zai-team 这个 kind。
export type OffPeakCodingPlanKind = // 四形态联合
  (typeof CODING_PLAN_KIND_TABLE)[keyof typeof CODING_PLAN_KIND_TABLE];

const UNSUPPORTED_REASON_TABLE = {
  providerFamilyUnselected: "provider_family_unselected",
  providerFamilyApiKeyMode: "provider_family_api_key_mode",
  providerIdentityMismatch: "provider_identity_mismatch",
  connectionUnselected: "connection_unselected",
  startPlanNotSupported: "start_plan_not_supported",
  connectionUnavailable: "connection_unavailable",
  selectionChanged: "selection_changed",
  jwtMissing: "jwt_missing",
} as const; // 不可用原因八值
/**
 * 脱敏的 Coding Plan 支持边界。renderer 只消费该结果，不读 JWT/API Key。
 * `connection_unavailable` 同时覆盖 provider 缺失、disabled、过期和 Team runtime key 失效；
 * 这些情况都不能回退到其它缓存连接。
 */
export type OffPeakCodingPlanUnsupportedReason = // 八值联合
  (typeof UNSUPPORTED_REASON_TABLE)[keyof typeof UNSUPPORTED_REASON_TABLE];

export type OffPeakCodingPlanSupport = // 可用/不可用二选一
  | {
      supported: /* 可用 */ true;
      kind: /* 计划形态 */ OffPeakCodingPlanKind;
      providerFamily: /* 归属家族 */ "zai" | "bigmodel";
      providerId: /* 精确 provider ID */ string;
    }
  | {
      supported: /* 不可用 */ false;
      reason: /* 脱敏后的原因 */ OffPeakCodingPlanUnsupportedReason;
    };

// 服务端取号额度的即时快照；只用于判断能否创建新 ticket，
// 真实 POST /ticket 仍是最终准入权威。
export type OffPeakTakeNumberAvailability = {
  canTakeNumber: /* 当前是否可取号 */ boolean;
  // 当前不可取号时服务端给出的最早恢复时间，Unix 毫秒。
  nextTakeAt?: /* 最早恢复取号毫秒 */ number;
};

export function isOffPeakTicketExpiredError(text: string | undefined): boolean {
  return Boolean(text?.includes(OFF_PEAK_TICKET_EXPIRED_MARKER)); // 消息含标记即过期
}

// 一条闲时任务：表单创建即取号排队，派发时 createTask 新建 session。
export type KnorviaOffPeakTask = {
  // 本地主键，同时用作服务端 task_id（稳定，跨多个 ticket）。
  offPeakTaskId: /* 本地主键兼服务端 task_id */ string;
  // 服务端取号返回的 Snowflake ticket_id；每次重新取号（3h 到期续跑/Continue 重取）更新。
  serverTicketId?: /* 取号返回的 ticket_id */ string;
  // 表单 Task title。
  title: /* 表单 Task title */ string;
  // 宿主对话 taskId；首次派发成功后回填（表单：新建 session；会话内创建：绑定会话首跑），非空=已跑过。
  conversationId?: /* 宿主对话 taskId */ string;
  /**
   * 运行会话。表单创建首跑后回填；会话内创建在创建时即写当前会话 id，
   * 首跑 resume 该会话而不新建。续跑/中断恢复同样 resume 这个 session。
   */
  sessionId?: /* 运行会话 ID */ string;
  // 绑定会话的当前标题（list 时从 tasks-index 联查，只读派生，不落库）。
  sessionTitle?: /* 绑定会话标题（联查派生） */ string;
  // 表单 Instructions。
  prompt: /* 表单 Instructions */ string;
  // 权限四档全开放，映射现有 KnorviaTaskMode，默认 "default"（Ask for approval）。
  permissionMode: /* 权限四档映射 */ KnorviaTaskMode;
  /**
   * 创建被接受时固定的结构化 Submission 选择。
   *
   * 旧数据库记录可能只有 model/thought_level，读取时暂时为空；这类任务保留给用户修复，
   * 但在补回完整 Selection 前不能进入调度。
   */
  modelSelection?: /* 创建时固定的结构化选择 */ ModelSelection;
  // 旧记录无法可靠恢复 Selection 时的只读诊断事实。
  modelSelectionIssue?: {
    // 旧记录修复诊断
    code: /* 固定 repair-required */ "repair-required";
    legacyModelId?: /* 旧 model 字段 */ string;
    legacyReasoningLevel?: /* 旧 thought_level 字段 */ string;
  };
  // workspaceIdentity?.trim() || workspacePath。
  workspaceKey: /* 身份 key 派生的路由键 */ string;
  workspacePath: /* 工作区路径 */ string;
  workspaceIdentity?: /* 身份 key（远程场景） */ string;
  status: /* 客户端执行态 */ KnorviaOffPeakTaskStatus;
  // FIFO 序依据（服务端权威序由取号顺序决定，本地仅展示/派发排序用）。
  queuedAt: /* 入队毫秒时间戳 */ number;
  startedAt?: /* 开始时间 */ number;
  endedAt?: /* 结束时间 */ number;
  failureReason?: /* 失败原因文本 */ string;
  // 完成通知与状态条展示；复用现有 task diff 回填。
  filesChanged?: /* 完成通知展示的改动文件数 */ number;
  // 终态核销服务端 ack 时间；undefined=未核销，outbox 补报。
  settledAt?: /* 终态核销 ack 毫秒 */ number;
  /**
   * 用户删除本地 History 行的时间。
   * 只控制 History 可见性，不删除 task/session，也不清任何执行字段。
   */
  historyDeletedAt?: /* History 行删除毫秒 */ number;
  // ── 服务端同步快照（host offPeakTaskSync 写 / scheduler 跨进程读）──
  // 取号成功时间（POST /ticket ack）；undefined=未取号。
  registeredAt?: /* 取号成功毫秒 */ number;
  // 服务端 ready（粗阀）：true = 低峰窗口开 + 排到号，scheduler 可认领派发。
  schedulable?: /* 服务端 ready 粗阀 */ boolean;
  // 排队位次，UI "#N in queue"。
  queuePosition?: /* 排队位次 */ number;
  // 下次轮询时间（间隔由服务端 next_poll_after 下发）。
  nextPollAt?: /* 下次轮询毫秒 */ number;
  createdAt: /* 创建时间 */ number;
  updatedAt: /* 更新时间 */ number;
};

// 创建闲时任务的入参（workspace 由调用方从上下文注入；取号在 service 层先行，成功才落库）。
export type KnorviaOffPeakTaskCreateParams = {
  title: /* 表单 Task title */ string;
  prompt: /* 表单 Instructions */ string;
  permissionMode: /* 权限模式 */ KnorviaTaskMode;
  modelSelection: /* 固定的结构化选择 */ ModelSelection;
  workspacePath: /* 工作区路径 */ string;
  workspaceIdentity?: /* 身份 key */ string;
  // 会话内创建：绑定创建时所在会话，首跑 resume 该会话（对齐 CronCreate targetTaskId）。表单创建不传。
  boundSessionId?: /* 会话内创建时绑定的会话 */ string;
};

const TICKET_INITIAL_STATE_TABLE = {
  queued: "queued",
  ready: "ready",
  active: "active",
  expired: "expired",
  settled: "settled",
  notFound: "not_found",
} as const; // 票态六值
// 创建边界返回的稳定票态；与服务端票态同值，但不暴露 server ticket ID。
export type OffPeakTaskTicketInitialState =
  (typeof TICKET_INITIAL_STATE_TABLE)[keyof typeof TICKET_INITIAL_STATE_TABLE];

const CREATE_FAILURE_STAGE_TABLE = {
  clientValidation: "client_validation",
  ticketRequest: "ticket_request",
  localPersist: "local_persist",
} as const;
export type OffPeakTaskCreateFailureStage =
  (typeof CREATE_FAILURE_STAGE_TABLE)[keyof typeof CREATE_FAILURE_STAGE_TABLE];

const CREATE_ERROR_CATEGORY_TABLE = {
  clientValidation: "client_validation",
  eligibility3101: "eligibility_3101",
  quota3103: "quota_3103",
  network: "network",
  invalidResponse: "invalid_response",
  localPersist: "local_persist",
  unknown: "unknown",
} as const;
export type OffPeakTaskCreateErrorCategory =
  (typeof CREATE_ERROR_CATEGORY_TABLE)[keyof typeof CREATE_ERROR_CATEGORY_TABLE];

/**
 * 创建 RPC 的判别联合。失败只保留稳定分类/业务码，禁止把 raw error 或响应体带过 RPC。
 * providerName 已在 Host 侧收窄为显式安全 hostname，不允许传完整 URL。
 */
export type OffPeakTaskCreateResult =
  | {
      ok: /* 创建成功 */ true;
      task: /* 落库后的任务 */ KnorviaOffPeakTask;
      ticketInitialState: /* 票态 */ OffPeakTaskTicketInitialState;
      queuePosition?: /* 排队位次 */ number;
      providerName: /* 安全 hostname */ string;
    }
  | {
      ok: /* 创建失败 */ false;
      failureStage: /* 失败阶段 */ OffPeakTaskCreateFailureStage;
      errorCategory: /* 稳定分类 */ OffPeakTaskCreateErrorCategory;
      errorCode: /* 业务码 */ string;
      providerName: /* 安全 hostname */ string;
    };
