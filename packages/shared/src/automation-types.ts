// SPDX-License-Identifier: Apache-2.0
// 定时任务（Automation）领域类型与 runId 解析（B40）。
// automation / automation_runs 存 tasks-index.sqlite；此处是跨 services/cli/desktop/ui
// 复用的 camelCase 领域类型，sqlite 列名是 snake_case。
import type { KnorviaTaskMode } from "./task-types-core.js";
import type { ModelSelection } from "./model-selection.js";

// 单个本地任务索引允许保留的定时任务定义总数；所有生命周期状态都计入。
const AUTOMATION_LIMITS = { createLimit: 20 } as const;

export const AUTOMATION_CREATE_LIMIT = AUTOMATION_LIMITS.createLimit;

const CREATE_LIMIT_ERROR_TEXT = "AUTOMATION_CREATE_LIMIT_REACHED";
export const AUTOMATION_CREATE_LIMIT_ERROR_CODE = CREATE_LIMIT_ERROR_TEXT;

export function isAutomationCreateLimitError(thrown: unknown): boolean {
  const text = typeof thrown === "string" ? thrown : thrown instanceof Error ? thrown.message : "";
  return text.includes(AUTOMATION_CREATE_LIMIT_ERROR_CODE); // 消息里含错误码即命中
}

const LIFECYCLE_STATUS_TABLE = {
  active: "active",
  completed: "completed",
  failed: "failed",
  paused: "paused",
} as const;
// 整条 automation 的生命周期。
export type KnorviaAutomationLifecycleStatus =
  (typeof LIFECYCLE_STATUS_TABLE)[keyof typeof LIFECYCLE_STATUS_TABLE];

const DISPATCH_STATUS_TABLE = {
  idle: "idle",
  claimed: "claimed",
  dispatched: "dispatched",
  failedToDispatch: "failed_to_dispatch",
} as const;
// 单条 automation 当前一轮的派发信息态（供 UI/诊断）。
export type KnorviaAutomationDispatchStatus = // idle/claimed/dispatched/failed_to_dispatch
  (typeof DISPATCH_STATUS_TABLE)[keyof typeof DISPATCH_STATUS_TABLE];

const LOCATION_KIND_TABLE = { local: "local", remote: "remote" } as const;
// workspace 位置；本期恒为 local，远端预留。
export type KnorviaAutomationLocationKind =
  (typeof LOCATION_KIND_TABLE)[keyof typeof LOCATION_KIND_TABLE];

const TRIGGER_TABLE = { schedule: "schedule", manual: "manual" } as const;
// 触发来源：定时或立即运行。
export type KnorviaAutomationTrigger = (typeof TRIGGER_TABLE)[keyof typeof TRIGGER_TABLE];

const SCHEDULE_UNIT_TABLE = {
  minute: "minute",
  hourly: "hourly",
  daily: "daily",
  weekly: "weekly",
  monthly: "monthly",
  yearly: "yearly",
} as const;

// 自定义重复规则；cronExpr 只留作兼容展示，调度以本字段为权威。
export type KnorviaAutomationScheduleRule = {
  unit: /* 重复单位 */ (typeof SCHEDULE_UNIT_TABLE)[keyof typeof SCHEDULE_UNIT_TABLE];
  interval: /* 间隔数 */ number;
  hour: /* 触发小时 */ number;
  minute: /* 触发分钟 */ number;
  anchorAt: /* 锚点毫秒时间戳 */ number;
  weekdays?: /* 周维度命中日 */ number[];
  monthDays?: /* 月维度命中日 */ number[];
  // yearly 用：1-12 人类月份；缺省回退 anchorAt 的月份（兼容旧记录没写该字段）。
  months?: /* 人类月份列表 */ number[];
  monthlyMode?: /* 月维度按日期还是按周 */ "date" | "weekday";
};

// 会话侧长间隔周期 carrier 的 unit 枚举：与 scheduleRule.unit 同集，但 carrier 是受控入参
// （模型不能直接写完整 scheduleRule），由 service 层归一化成权威 scheduleRule。
export type KnorviaAutomationIntervalUnit = KnorviaAutomationScheduleRule["unit"]; // 同集别名

const RUN_DISPATCH_TABLE = {
  claimed: "claimed",
  dispatched: "dispatched",
  failedToDispatch: "failed_to_dispatch",
  skipped: "skipped",
} as const;
// 单次 run 的派发结果（scheduler 权威，驱动重试）；skipped=错过触发窗口。
export type KnorviaAutomationRunDispatchStatus = // claimed/dispatched/failed_to_dispatch/skipped
  (typeof RUN_DISPATCH_TABLE)[keyof typeof RUN_DISPATCH_TABLE];

const RUN_OUTCOME_TABLE = {
  running: "running",
  succeeded: "succeeded",
  failed: "failed",
  stopped: "stopped",
  interrupted: "interrupted",
} as const;
// 单次 run 产出 session 后的运行结果（session runtime 回写，仅用于展示）。
export type KnorviaAutomationRunOutcome = // running/succeeded/failed/stopped/interrupted
  (typeof RUN_OUTCOME_TABLE)[keyof typeof RUN_OUTCOME_TABLE];

// 一条定时任务定义 + 调度状态。
export type KnorviaAutomation = {
  createdAt: /* 创建时间 */ number;
  updatedAt: /* 更新时间 */ number;
  automationId: /* 定时任务 ID */ string;
  title: /* 展示标题 */ string;
  // 5 段 cron，本地时区。
  cronExpr: /* 5 段 cron 文本 */ string;
  prompt: /* 触发后提交的提示词 */ string;
  // 缺失表示 Select 阶段继续跟随 Workspace 首选；存在时固定结构化模型意图。
  modelSelection?: /* 固定模型选择 */ ModelSelection;
  // 权限模式；派发时透传给 createTask，缺省走 workspace 默认。
  mode?: /* 权限模式 */ KnorviaTaskMode;
  // workspaceIdentity?.trim() || workspacePath。
  workspaceKey: /* 身份 key 派生的路由键 */ string;
  workspacePath: /* 工作区路径 */ string;
  workspaceIdentity?: /* 身份 key（远程场景） */ string;
  // 会话内创建的 cron 绑定到当前 task；后续触发投递回该 task，不再新建 session。
  targetTaskId?: /* 绑定任务 ID */ string;
  // 把该调度指到已保存的 Studio workflow，永远不进聊天会话。
  studioWorkflowId?: /* workflow 标识 */ string;
  locationKind: /* 位置形态 */ KnorviaAutomationLocationKind;
  // true=无限循环；false=有限次（配合 maxRuns）。
  recurring: /* 是否无限循环 */ boolean;
  maxRuns?: /* 最大执行次数 */ number;
  // 自定义重复的截止时间（所选日期的日末，毫秒时间戳）。
  endAt?: /* 截止毫秒时间戳 */ number;
  scheduleRule?: /* 自定义重复规则 */ KnorviaAutomationScheduleRule;
  // 会话来源的只读调度是否已被用户在管理页显式删除并重设。
  scheduleEditedByUser?: /* 是否被用户改过 */ boolean;
  runCount: /* 已跑次数 */ number;
  enabled: /* 是否启用 */ boolean;
  lifecycleStatus: /* 生命周期 */ KnorviaAutomationLifecycleStatus;
  nextRunAt?: /* 下次触发时间 */ number;
  lastRunAt?: /* 上次触发时间 */ number;
  dispatchStatus: /* 派发信息态 */ KnorviaAutomationDispatchStatus;
  dispatchAttempts: /* 派发尝试数 */ number;
  retryAt?: /* 重试时间 */ number;
  lastError?: /* 最近错误文本 */ string;
};

// parseAutomationRunId 的解析结果；scheduledAt 仅 schedule 触发存在。
export type KnorviaAutomationRunIdParts = {
  automationId: /* 定时任务 ID */ string;
  trigger: /* 触发来源 */ KnorviaAutomationTrigger;
  // runId 内嵌的本轮理论触发时间（Unix 毫秒）。
  scheduledAt?: /* 理论触发毫秒 */ number;
};

const MANUAL_RUN_PREFIX = "manual:";

// runId 契约（见 KnorviaAutomationRun.runId）的唯一解析入口：desktop host/scheduler 与
// CLI telemetry 不各自按字符串猜格式；不符合两种声明格式的输入一律返回 null。
export function parseAutomationRunId(runId: string): KnorviaAutomationRunIdParts | null {
  const separatorIndex = runId.indexOf(":");
  if (separatorIndex <= 0) return null; // 必须有非空 automationId 前缀
  const automationId = runId.slice(0, separatorIndex);
  const rest = runId.slice(separatorIndex + 1);
  if (rest.startsWith(MANUAL_RUN_PREFIX)) {
    // manual 形态：uuid 非空才算合法。
    return rest.length > MANUAL_RUN_PREFIX.length ? { automationId, trigger: "manual" } : null;
  }
  const scheduledAt = Number(rest);
  if (!Number.isSafeInteger(scheduledAt) || scheduledAt <= 0) return null; // schedule 形态必须是正整数毫秒
  return { automationId, trigger: "schedule", scheduledAt };
}

// 一次触发的运行历史 / runId 幂等台账。
export type KnorviaAutomationRun = {
  // automationId:scheduledAt / automationId:manual:uuid。
  runId: string;
  automationId: /* 定时任务 ID */ string;
  workspaceKey: /* 身份 key 派生的路由键 */ string;
  scheduledAt?: /* 理论触发时间 */ number;
  trigger: /* 触发来源 */ KnorviaAutomationTrigger;
  // Select 转 Submission 后固定；同一 run 的派发重试不得重读 Workspace 首选。
  modelSelection?: /* 固定模型选择 */ ModelSelection;
  dispatchStatus: /* 派发结果 */ KnorviaAutomationRunDispatchStatus;
  outcome?: /* 运行结果 */ KnorviaAutomationRunOutcome;
  // dispatched 成功后回填，用于历史跳转。
  sessionId?: /* 运行会话 ID */ string;
  error?: /* 错误文本 */ string;
  attempts: /* 尝试次数 */ number;
  createdAt: /* 创建时间 */ number;
  updatedAt: /* 更新时间 */ number;
};

// 创建 automation 的入参（workspace 由调用方从 session 上下文注入）。
export type KnorviaAutomationCreateParams = {
  title: /* 展示标题 */ string;
  cronExpr: /* 5 段 cron */ string;
  // 仅创建期使用：服务层基于真实当前时间换算成 cronExpr，不写库。
  relativeDelayMinutes?: number;
  prompt: /* 提示词 */ string;
  modelSelection?: /* 模型选择 */ ModelSelection;
  mode?: /* 权限模式 */ KnorviaTaskMode;
  workspacePath: /* 工作区路径 */ string;
  workspaceIdentity?: /* 身份 key */ string;
  // 当前会话内创建时由 runtime 注入，模型不可控。
  targetTaskId?: string;
  // GUI 创建的 Studio workflow 目标；创建后不可变。
  studioWorkflowId?: string;
  recurring: /* 是否无限循环 */ boolean;
  maxRuns?: /* 最大次数 */ number;
  endAt?: /* 截止时间 */ number;
  scheduleRule?: /* 自定义重复规则 */ KnorviaAutomationScheduleRule;
  /**
   * 会话侧自定义重复 carrier：每 N 分钟/小时/天/周/月/年都配对提交 intervalUnit + interval，
   * 真实间隔由 service 层归一化成权威 scheduleRule；cronExpr 只作兼容展示。
   * 与 scheduleRule、relativeDelayMinutes 互斥；undefined=不用 carrier。
   */
  intervalUnit?: KnorviaAutomationIntervalUnit;
  // 1–200 的整数间隔，必须与 intervalUnit 配对。
  interval?: number;
};

// 编辑 automation 的可变字段。
export type KnorviaAutomationUpdateParams = {
  title?: /* 新标题 */ string;
  cronExpr?: /* 新 cron */ string;
  prompt?: /* 新提示词 */ string;
  // undefined=不修改；null=清空，回退 Workspace 首选。
  modelSelection?: ModelSelection | null;
  // undefined=不修改；null=清空，回退 workspace 默认权限模式。
  mode?: KnorviaTaskMode | null;
  recurring?: /* 是否无限循环 */ boolean;
  // undefined=不动；recurring=true 时领域层自动清空旧上限；显式 null 必须同时传 recurring=true。
  maxRuns?: number | null;
  // undefined=不修改；null=永不结束。
  endAt?: number | null;
  // undefined=不修改；null=恢复为普通 cron。
  scheduleRule?: KnorviaAutomationScheduleRule | null;
  /**
   * 会话侧自定义重复 carrier（同 create 侧）。配对提交 intervalUnit + interval，
   * service 层归一化成权威 scheduleRule（anchorAt 重置为本次修改时刻）；undefined=不修改。
   */
  intervalUnit?: KnorviaAutomationIntervalUnit;
  // 1–200 的整数间隔，必须与 intervalUnit 配对。
  interval?: number;
  // 仅管理页在用户实际改调度时写入；undefined=保留原来源状态。
  scheduleEditedByUser?: boolean;
};
