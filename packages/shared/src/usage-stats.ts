/* eslint-disable max-lines -- Usage、Entitlement 与 Reset 的跨进程协议共享同一组 Account Access 字段和运行时 schema，集中维护免得契约散开。 */
import { z } from "zod";

// 额度类型拆在 usage-quota.ts，见该文件头部说明；这里 re-export 保持既有 import 路径不变。
export * from "./usage-quota.js";
import type { UsageMcpQuotaSnapshot, UsageQuotaSnapshot } from "./usage-quota.js";
import type { KnorviaAccountAccess, KnorviaProviderAccountAccess } from "./protocol/index.js";

// token 估算的字符除数（逐字冻结，B43）。
const USAGE_ESTIMATE_FACTORS = { tokenCharDivisor: 3 } as const;
export const ESTIMATED_TOKEN_CHAR_DIVISOR = USAGE_ESTIMATE_FACTORS.tokenCharDivisor;

const USAGE_RANGE_TABLE = { all: "all", week: "7d", month: "30d" } as const;
export type UsageStatsRange = (typeof USAGE_RANGE_TABLE)[keyof typeof USAGE_RANGE_TABLE];

const CODING_PLAN_RANGE_TABLE = {
  today: "today",
  week: "7d",
  month: "30d",
  custom: "custom",
} as const;
export type CodingPlanUsageRange =
  (typeof CODING_PLAN_RANGE_TABLE)[keyof typeof CODING_PLAN_RANGE_TABLE];

const GRANULARITY_TABLE = { hour: "hour", day: "day" } as const;
export type CodingPlanUsageGranularity = (typeof GRANULARITY_TABLE)[keyof typeof GRANULARITY_TABLE];

const DETAIL_METRIC_TABLE = { credits: "credits", usage: "usage" } as const;
export type CodingPlanUsageDetailMetric =
  (typeof DETAIL_METRIC_TABLE)[keyof typeof DETAIL_METRIC_TABLE];

const DETAIL_SUBJECT_TABLE = { model: "model", tool: "tool" } as const;
export type CodingPlanUsageDetailSubject =
  (typeof DETAIL_SUBJECT_TABLE)[keyof typeof DETAIL_SUBJECT_TABLE];

export type UsageStatsRequest = {
  range: /* 统计区间 */ UsageStatsRange;
  // 使用统计数据源。App Usage 显式用本地 session 聚合，Coding Plan 显式用 monitor 接口。
  dataSource?: "local" | "monitor";
  // 设置页可传用户当前选中的 Z.AI / BigModel 来源，避免两边都配置时只隐式读取第一家。
  preferredProviderId?: string;
  // Registry 静态访问类别，或调用边界已解析的动态账号访问上下文。
  accountAccess?: KnorviaProviderAccountAccess | KnorviaAccountAccess;
  // 指定来源的场景必须命中 preferredProviderId，否则不允许回退其它 provider 或本地聚合。
  requirePreferredProvider?: boolean;
  // 是否允许 host 环境变量覆盖 provider key；默认允许，显式 provider 场景可关闭。
  allowEnvApiKey?: boolean;
  // 统计按调用端时区归桶：UI 默认传浏览器当前时区，缺省时 host 回退系统时区。
  timeZone?: string;
};

export type CodingPlanUsageRequest = {
  range: /* 统计区间 */ CodingPlanUsageRange;
  // 自定义日期范围。仅 range=custom 时生效，按调用端自然日解释，最大 30 天。
  customStartDate?: string | null;
  customEndDate?: string | null;
  preferredProviderId: /* 显式来源 */ string;
  // Registry 静态访问类别，或本次 Team 查询绑定的动态账号访问上下文。
  accountAccess: KnorviaProviderAccountAccess | KnorviaAccountAccess;
  timeZone?: /* 归桶时区 */ string;
};

export type UsageEntitlementRequest = {
  // 购买或领取完成后，使对应 Start Plan balance 短期缓存失效。
  invalidateBalanceCache?: boolean;
  // 兼容旧调用方的提示；Coding Plan 权益必须查询订阅并返回摘要，不再允许仅用额度推断权益。
  includeSubscription?: boolean;
  // 聊天输入区可传当前选中的内置供应商，确保 BigModel/Z.AI 用量跟随模型选择。
  preferredProviderId?: string;
  // 指定 Account Provider 的静态访问类别，或调用边界已解析的动态账号访问上下文。
  accountAccess?: KnorviaProviderAccountAccess | KnorviaAccountAccess;
  // 当前模型已明确选中该内置供应商时，即使供应商列表里被隐藏也允许读取其 key。
  allowDisabledPreferredProvider?: boolean;
  // 指定来源的场景必须命中 preferredProviderId，否则不允许回退其它 provider。
  requirePreferredProvider?: boolean;
  // 是否允许 host 环境变量覆盖 provider key；默认允许，显式 provider 场景可关闭。
  allowEnvApiKey?: boolean;
};

const UNAVAILABLE_REASON_TABLE = {
  notAuthenticated: "not_authenticated",
  notConfigured: "not_configured",
  noPlan: "no_plan",
  unavailable: "unavailable",
} as const;

export type UsageEntitlementSnapshot = {
  generatedAt: /* 本地生成毫秒 */ number;
  // 当前额度响应的服务端时间（毫秒）；与本地快照生成时间 generatedAt 分离。
  serverTime?: number;
  authenticated: /* 是否已登录 */ boolean;
  unavailableReason?: /* 不可用原因 */ (typeof UNAVAILABLE_REASON_TABLE)[keyof typeof UNAVAILABLE_REASON_TABLE];
  // 无可用 Start Plan 时，保留明确过期原因用于展示。
  startPlanExpired?: boolean;
  // 团队订阅明确失效的原因，仅与 no_plan 一起返回。
  teamPlanUnavailableReason?: "expired" | "unassigned";
  // 当前 entitlement 查询对应的个人/团队上下文，用于设置页连接方式主判定。
  context?: UsageEntitlementContext | null;
  // 当前用于查询 quota 的模型供应商信息。
  provider: UsageEntitlementProviderInfo | null;
  remaining: /* 剩余额度 */ UsageEntitlementRemaining | null;
  subscription: /* 订阅摘要 */ UsageEntitlementSubscription | null;
  quota: /* 额度快照 */ UsageQuotaSnapshot | null;
  /**
   * Knorvia 官方 Server MCP 的调用额度（`/api/v1/mcp/usage`）。与 quota 同一份快照下发，
   * 以继承 entitlement 已有的缓存 / in-flight 合并 / TTL 策略；拉取失败、未开通 Coding Plan、
   * 或该额度不属于本次查询的连接时一律为 null（可选数据面）。
   */
  mcpQuota?: UsageMcpQuotaSnapshot | null;
};

export type UsageEntitlementContext = {
  scope: /* 个人或团队 */ "personal" | "team";
  organizationId?: /* 组织 ID */ string | null;
  projectId?: /* 项目 ID */ string | null;
  displayName?: /* 展示名 */ string | null;
  productId?: /* 产品 ID */ string | null;
};

const PLAN_IDENTITY_TABLE = {
  codingPlan: "coding_plan",
  startPlan: "start_plan",
  noPlan: "no_plan",
  unknown: "unknown",
} as const;
export type PlanIdentityStatus = (typeof PLAN_IDENTITY_TABLE)[keyof typeof PLAN_IDENTITY_TABLE];

export type PlanIdentitySnapshot = {
  generatedAt: /* 生成毫秒 */ number;
  planStatus: /* 计划身份态 */ PlanIdentityStatus;
  planProductId: /* 计划产品 ID */ string;
};

export type UsageEntitlementRemaining = {
  count: /* 剩余数 */ number;
  isShow: /* 是否展示 */ boolean;
  percentage?: /* 已使用占比 */ number;
  nextResetTime?: /* 下次重置毫秒 */ number | null;
};

export type UsageEntitlementProviderInfo = {
  id: /* 供应商 ID */ string;
  name: /* 供应商名 */ string;
};

export type UsageEntitlementSubscription = {
  identityType: /* 身份形态 */ "email" | "phoneNumber" | "unknown";
  identityMasked: /* 打码后的身份 */ string | null;
  details: /* 订阅明细 */ UsageEntitlementSubscriptionDetail[];
};

export type UsageEntitlementSubscriptionDetail = {
  productId: /* 产品 ID */ string;
  productName: /* 产品名 */ string;
  purchaseTime: /* 购买时间文本 */ string | null;
  beginTime: /* 生效时间文本 */ string | null;
  billingCycle?: /* 计费周期 */ string | null;
  renewTime?: /* 续费时间文本 */ string | null;
  expireTime: /* 过期时间文本 */ string | null;
  // Start Plan balance 套餐下的权益生效时间；其他订阅类型可不提供。
  entitlements?: Array<{
    entitlementId: /* 权益 ID */ string;
    // 服务端 entitlement show_name，用于待生效提示。
    showName?: string | null;
    effectiveTime: /* 生效时间文本 */ string | null;
  }>;
};

export type UsageStatsSnapshot = {
  range: /* 统计区间 */ UsageStatsRange;
  generatedAt: /* 生成毫秒 */ number;
  timeZone: /* 归桶时区 */ string;
  estimatedTokenCharDivisor: /* token 估算除数 */ number;
  summary: /* 汇总 */ UsageStatsSummary;
  // 按日期连续补齐后的日序列，空白日期补 0，供趋势图直接使用。
  daily: UsageStatsDaySummary[];
  heatmap: /* 热力图 */ UsageStatsHeatmap;
  models: /* 分模型用量 */ UsageStatsModelUsage[];
  /**
   * 数据来源标识：UI 据此区分供应商 monitor 接口与本地 session 聚合。
   * App Usage 显式读本地 session 聚合；Coding Plan 显式读当前 provider monitor。
   */
  source?: "bigmodel-monitor" | "local";
  // 远端用量来源供应商，用于 UI 展示 BigModel / Z.AI 等来源。
  sourceProvider?: UsageEntitlementProviderInfo | null;
  // 工具调用维度（仅 BigModel tool-usage 接口可用，本地聚合不填）。
  tools?: UsageStatsToolUsage[];
};

// ── App Usage（agent 数据库真实统计）────────────────────────────────
export const APP_USAGE_RANGES = ["all", "7d", "30d"] as const;
export type AppUsageRange = (typeof APP_USAGE_RANGES)[number];

export const appUsageFavoriteModelSchema = z.object({
  modelId: /* 偏好模型 ID */ z.string().nullable(),
  totalTokens: /* 总 token 数 */ z.number(),
  share: /* 占比 */ z.number(),
});

const appUsageSummaryShape = {
  totalTokens: /* 总 token 数 */ z.number(),
  inputTokens: /* 输入 token 数 */ z.number(),
  outputTokens: /* 输出 token 数 */ z.number(),
  reasoningTokens: /* 推理 token 数 */ z.number(),
  cacheCreationTokens: /* 缓存写入 token 数 */ z.number(),
  cacheReadTokens: /* 缓存读取 token 数 */ z.number(),
  cacheHitRate: /* 缓存命中率 */ z.number(),
  totalSessions: /* 会话总数 */ z.number(),
  totalTurns: /* 轮次总数 */ z.number(),
  toolCallCount: /* 工具调用数 */ z.number(),
  toolErrorRate: /* 工具错误率 */ z.number(),
  modelErrorRate: /* 模型错误率 */ z.number(),
  avgTimeToFirstTokenMs: /* 平均首 token 毫秒 */ z.number().nullable(),
  avgTurnDurationMs: /* 平均轮次时长毫秒 */ z.number().nullable(),
  activeDays: /* 活跃天数 */ z.number(),
  currentStreakDays: /* 当前连续天数 */ z.number(),
  longestSessionMs: /* 最长会话毫秒 */ z.number(),
  longestStreakDays: /* 最长连续天数 */ z.number(),
  peakDayTokens: /* 峰值日 token 数 */ z.number(),
  favoriteModel: /* 偏好模型 */ appUsageFavoriteModelSchema.nullable(),
};
export const appUsageSummarySchema = z.object(appUsageSummaryShape);

export const appUsageHeatmapCellSchema = z.object({
  date: /* 日期文本 */ z.string(),
  level: /* 热力等级 0-4 */ z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
  totalTokens: /* 当日 token 数 */ z.number(),
  turnCount: /* 当日轮次数 */ z.number(),
  toolCallCount: /* 当日工具调用数 */ z.number(),
});

export const appUsageHeatmapWeekSchema = z.object({
  weekIndex: /* 周序号 */ z.number(),
  days: /* 七格（可空） */ z.array(appUsageHeatmapCellSchema.nullable()),
});

export const appUsageHeatmapSchema = z.object({
  startDate: /* 起始日期 */ z.string().nullable(),
  endDate: /* 结束日期 */ z.string().nullable(),
  maxTokens: /* 全期峰值 token */ z.number(),
  weeks: /* 周序列 */ z.array(appUsageHeatmapWeekSchema),
});

export const appUsageDailyModelItemSchema = z.object({
  modelId: /* 模型 ID */ z.string().nullable(),
  totalTokens: /* 当日该模型 token 数 */ z.number(),
});

export const appUsageDailyModelUsageSchema = z.object({
  date: /* 日期文本 */ z.string(),
  models: /* 分模型用量 */ z.array(appUsageDailyModelItemSchema),
});

export const appUsageModelUsageSchema = z.object({
  modelId: /* 模型 ID */ z.string().nullable(),
  totalTokens: /* 总 token 数 */ z.number(),
  inputTokens: /* 输入 token 数 */ z.number(),
  outputTokens: /* 输出 token 数 */ z.number(),
  requestCount: /* 请求次数 */ z.number(),
  share: /* 占比 */ z.number(),
});

export const appUsageToolUsageSchema = z.object({
  toolName: /* 工具名 */ z.string(),
  callCount: /* 调用次数 */ z.number(),
  errorCount: /* 错误次数 */ z.number(),
  errorRate: /* 错误率 */ z.number(),
  avgDurationMs: /* 平均耗时毫秒 */ z.number().nullable(),
});

const appUsageSnapshotShape = {
  range: /* 统计区间 */ z.enum(APP_USAGE_RANGES),
  generatedAt: /* 生成毫秒 */ z.number(),
  timeZone: /* 归桶时区 */ z.string(),
  source: /* 固定字面量 */ z.literal("agent-db"),
  summary: /* 汇总 */ appUsageSummarySchema,
  heatmap: /* 热力图 */ appUsageHeatmapSchema,
  dailyModelUsage: /* 按日分模型 */ z.array(appUsageDailyModelUsageSchema),
  models: /* 分模型汇总 */ z.array(appUsageModelUsageSchema),
  tools: /* 工具用量 */ z.array(appUsageToolUsageSchema),
};
export const appUsageSnapshotSchema = z.object(appUsageSnapshotShape);

export type AppUsageSummary = z.output<typeof appUsageSummarySchema>;
export type AppUsageHeatmapCell = z.output<typeof appUsageHeatmapCellSchema>;
export type AppUsageHeatmapWeek = z.output<typeof appUsageHeatmapWeekSchema>;
export type AppUsageHeatmap = z.output<typeof appUsageHeatmapSchema>;
export type AppUsageDailyModelItem = z.output<typeof appUsageDailyModelItemSchema>;
export type AppUsageDailyModelUsage = z.output<typeof appUsageDailyModelUsageSchema>;
export type AppUsageModelUsage = z.output<typeof appUsageModelUsageSchema>;
export type AppUsageToolUsage = z.output<typeof appUsageToolUsageSchema>;
export type AppUsageFavoriteModel = z.output<typeof appUsageFavoriteModelSchema>;
export type AppUsageSnapshot = z.output<typeof appUsageSnapshotSchema>;

export type AppUsageRequest = {
  range: /* 统计区间 */ AppUsageRange;
  timeZone?: /* 归桶时区 */ string;
};

export type CodingPlanUsageSnapshot = {
  range: /* 统计区间 */ CodingPlanUsageRange;
  rangeStartDate: /* 区间起始 */ string;
  rangeEndDate: /* 区间结束 */ string;
  generatedAt: /* 生成毫秒 */ number;
  sourceProvider: /* 来源供应商 */ UsageEntitlementProviderInfo;
  quota: /* 额度快照 */ UsageQuotaSnapshot | null;
  activity: /* 活跃面 */ CodingPlanActivitySnapshot;
  detail: /* 明细面 */ CodingPlanUsageDetailSnapshot;
  modelUsage: /* 分模型用量 */ CodingPlanModelUsageSnapshot;
  toolUsage: /* 工具用量 */ CodingPlanToolUsageSnapshot;
  health: /* 健康面 */ CodingPlanHealthSnapshot;
};

export type CodingPlanActivitySnapshot = {
  summary: /* 活跃汇总 */ CodingPlanActivitySummary;
  heatmap: /* 热力图 */ AppUsageHeatmap;
};

export type CodingPlanActivitySummary = {
  totalTokens: /* 总 token 数 */ number;
  peakDailyTokens: /* 峰值日 token 数 */ number;
  peakDailyTokensDate: /* 峰值日期 */ string | null;
  totalUsageDurationMs: /* 总使用时长毫秒 */ number;
  currentStreakDays: /* 当前连续天数 */ number;
  longestStreakDays: /* 最长连续天数 */ number;
  favoriteModelName: /* 偏好模型名 */ string | null;
};

export type CodingPlanUsageDetailSnapshot = {
  model: /* 模型维度 */ CodingPlanUsageDetailSummary;
  tool: /* 工具维度 */ CodingPlanUsageDetailSummary;
};

export type CodingPlanUsageDetailSummary = {
  cacheHitRate: /* 缓存命中率 */ number | null;
  cacheHitRateTrend: /* 命中率趋势 */ number | null;
  totalCredits: /* 总 credits */ number;
  totalCreditsTrend: /* credits 趋势 */ number | null;
  averageDailyCredits: /* 日均 credits */ number;
  averageDailyCreditsTrend: /* 日均趋势 */ number | null;
};

export type CodingPlanModelUsageSnapshot = {
  xTime: /* 时间轴标签 */ string[];
  granularity: /* 粒度 */ CodingPlanUsageGranularity;
  totalModelCallCount: /* 模型调用总数 */ number;
  totalTokensUsage: /* token 总量 */ number;
  modelDataList: /* 分模型序列 */ CodingPlanModelData[];
  modelSummaryList: /* 分模型汇总 */ CodingPlanModelSummary[];
};

export type CodingPlanModelData = {
  modelName: /* 模型名 */ string;
  sortOrder: /* 展示排序 */ number;
  tokensUsage: /* 按桶 token 序列 */ number[];
  creditsUsage?: /* 按桶 credits 序列 */ number[];
  cachedInputTokensUsage?: /* 命中缓存输入序列 */ number[];
  uncachedInputTokensUsage?: /* 未命中缓存输入序列 */ number[];
  outputTokensUsage?: /* 输出 token 序列 */ number[];
  cachedInputCreditsUsage?: /* 命中缓存 credits 序列 */ number[];
  uncachedInputCreditsUsage?: /* 未命中缓存 credits 序列 */ number[];
  outputCreditsUsage?: /* 输出 credits 序列 */ number[];
  totalTokens: /* token 合计 */ number;
  totalCredits?: /* credits 合计 */ number;
};

export type CodingPlanModelSummary = {
  modelName: /* 模型名 */ string;
  totalTokens: /* token 合计 */ number;
  totalCredits?: /* credits 合计 */ number;
  sortOrder: /* 展示排序 */ number;
};

export type CodingPlanToolUsageSnapshot = {
  xTime: /* 时间轴标签 */ string[];
  granularity: /* 粒度 */ CodingPlanUsageGranularity;
  toolDataList: /* 分工具序列 */ CodingPlanToolData[];
  toolSummaryList: /* 分工具汇总 */ CodingPlanToolSummary[];
};

export type CodingPlanToolData = {
  toolCode: /* 工具代号 */ string;
  toolName: /* 工具名 */ string;
  sortOrder: /* 展示排序 */ number;
  usageCount: /* 按桶调用次数 */ number[];
  creditsUsage?: /* 按桶 credits 序列 */ number[];
  totalUsageCount: /* 调用合计 */ number;
  totalCredits?: /* credits 合计 */ number;
};

export type CodingPlanToolSummary = {
  toolCode: /* 工具代号 */ string;
  toolName: /* 工具名 */ string;
  totalUsageCount: /* 调用合计 */ number;
  totalCredits?: /* credits 合计 */ number;
  sortOrder: /* 展示排序 */ number;
};

export type CodingPlanHealthSnapshot = {
  xTime: /* 时间轴标签 */ string[];
  proMaxDecodeSpeed: /* ProMax 解码速度序列 */ number[];
  liteDecodeSpeed: /* Lite 解码速度序列 */ number[];
};

export type UsageStatsToolUsage = {
  // 工具内部代号：search-prime / web-reader / zread / search-mcp 等。
  toolCode: string;
  // 用于展示的人类可读名称。
  displayName: string;
  totalCalls: /* 调用总数 */ number;
  // 与 daily 同长度的按天调用次数，便于绘制趋势。
  dailyCalls: number[];
};

export type UsageStatsSummary = {
  totalSessions: /* 会话总数 */ number;
  totalMessages: /* 消息总数 */ number;
  totalCharacters: /* 字符总数 */ number;
  totalEstimatedTokens: /* 估算 token 总数 */ number;
  activeDays: /* 活跃天数 */ number;
  mostActiveDay: /* 最活跃的一天 */ UsageStatsDaySummary | null;
  favoriteModel: /* 偏好模型 */ UsageStatsFavoriteModel | null;
  longestSessionMs: /* 最长会话毫秒 */ number;
  longestStreakDays: /* 最长连续天数 */ number;
  currentStreakDays: /* 当前连续天数 */ number;
  firstActivityDate: /* 首个活跃日 */ string | null;
  lastActivityDate: /* 最近活跃日 */ string | null;
  peakHour: /* 峰值小时 */ UsageStatsPeakHour | null;
};

export type UsageStatsPeakHour = {
  hour: /* 小时 0-23 */ number;
  totalEstimatedTokens: /* 该小时估算 token */ number;
  messageCount: /* 该小时消息数 */ number;
};

export type UsageStatsFavoriteModel = {
  modelId: /* 模型 ID */ string | null;
  totalCharacters: /* 字符数 */ number;
  totalEstimatedTokens: /* 估算 token 数 */ number;
  share: /* 占比 */ number;
};

export type UsageStatsDaySummary = {
  date: /* 日期文本 */ string;
  label: /* 展示标签 */ string;
  totalCharacters: /* 字符数 */ number;
  totalEstimatedTokens: /* 估算 token 数 */ number;
  sessionCount: /* 会话数 */ number;
  messageCount: /* 消息数 */ number;
  activityScore: /* 活跃分 */ number;
};

export type UsageStatsHeatmap = {
  startDate: /* 起始日期 */ string | null;
  endDate: /* 结束日期 */ string | null;
  maxActivityScore: /* 全期峰值活跃分 */ number;
  weeks: /* 周序列 */ UsageStatsHeatmapWeek[];
  monthLabels: /* 月份标签 */ UsageStatsHeatmapMonthLabel[];
};

export type UsageStatsHeatmapWeek = {
  weekIndex: /* 周序号 */ number;
  days: /* 七格（可空） */ Array<UsageStatsHeatmapCell | null>;
};

export type UsageStatsHeatmapMonthLabel = {
  weekIndex: /* 周序号 */ number;
  date: /* 月份锚点日期 */ string;
};

export type UsageStatsHeatmapCell = {
  date: /* 日期文本 */ string;
  level: /* 热力等级 0-4 */ 0 | 1 | 2 | 3 | 4;
  totalCharacters: /* 字符数 */ number;
  totalEstimatedTokens: /* 估算 token 数 */ number;
  sessionCount: /* 会话数 */ number;
  messageCount: /* 消息数 */ number;
  activityScore: /* 活跃分 */ number;
};

export type UsageStatsModelUsage = {
  modelId: /* 模型 ID */ string | null;
  totalCharacters: /* 字符总数 */ number;
  totalEstimatedTokens: /* 估算 token 总数 */ number;
  inputCharacters: /* 输入字符数 */ number;
  inputEstimatedTokens: /* 输入估算 token */ number;
  outputCharacters: /* 输出字符数 */ number;
  outputEstimatedTokens: /* 输出估算 token */ number;
  sessionCount: /* 会话数 */ number;
  messageCount: /* 消息数 */ number;
  share: /* 占比 */ number;
};
