// SPDX-License-Identifier: Apache-2.0
// workflowRuns：dwf 引擎 run 的实时运行态 schema（会话快照的 workflowRuns 键）。
// 这一块词汇表自成一体（run / actor / node / usage / concurrency / limits）。运行态属于会话
// 权威投影而不是 renderer 的查询缓存：一条引擎 RunEvent → 一条会话事件 → 这里的键级整体替换，
// 因此不存在「事件 + 另查 RPC」的双时钟。
import { z } from "zod";

import { workflowRunArtifactSummarySchema } from "./workflow-artifacts.js";

/** 各类条目的线上数量/长度上界。数字即契约（B31 逐项断言）。 */
export const WORKFLOW_RUNS_LIMITS = {
  /** 保留的最近 run 数；超出按最旧淘汰。 */
  maxRuns: 8,
  // actors 与 nodes 同界。每个节点都属于某个 actor，nodes 的界已隐含 actor 数的量级；这条界
  // 的职责只是挡住「疯掉的脚本在循环里 agent()」，不是产品意义上的子代理上限。
  maxActors: 256,
  maxNodes: 256,
  /** 详情页 Results 区的展示预算，刻意小于引擎的 run 级 report 上界。 */
  maxReports: 64,
  maxReportPreviewLength: 2_048,
  maxResultPreviewLength: 2_048,
  maxErrorLength: 2_048,
  /** 同时停驻的升级问题条数；在任何现实 caps 下都够用，同时是一道防线。 */
  maxPendingQuestions: 32,
  /** 问题与补充说明的展示上界，与事件载荷字符串界同值，正常路径永不截断。 */
  maxQuestionLength: 2_048,
  /** 并发桶的 provider key（`${providerId}/${modelId}`）上界。 */
  maxConcurrencyKeyLength: 256,
  /** 子代理模型串上界；与并发桶 key 同值，只是可能多一个推理档后缀。 */
  maxSubagentModelLength: 256,
  /** run.concurrencyCeiling 的上界；只挡坏载荷（界外值当读不出）。 */
  maxConcurrencyCeiling: 1_024,
  /** 子代理展示名上界（actor.name 与 pendingQuestion.actorName 同值）。 */
  maxActorNameLength: 128,
  /** 用户面产物条数；与引擎侧产物上限同值。 */
  maxArtifacts: 32,
  /** 被进入过的阶段条数；与 display 的阶段上界同值。 */
  maxPhases: 32,
  /** 阶段名上界，与 display 同值（UI 按名字关联两边）。 */
  maxPhaseNameLength: 128,
  /** 一次 ask 的任务摘要上界（node-queued 的 instructionsHead）。 */
  maxInstructionsHeadLength: 240,
  /** 最近一次工具调用的工具名上界（标识符不是文本）。 */
  maxLastToolNameLength: 64,
  /** 最近一次工具调用的目标上界（路径/命令头），同时是一条安全界。 */
  maxLastToolTargetLength: 120,
} as const;

/** 一个被控制流进入过的阶段；rounds 是进入次数，单调取 max，resume 重放不会加倍。 */
export const workflowRunPhaseSchema = z.object({
  name: z.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxPhaseNameLength),
  rounds: z.number().int().positive(),
});
export type WorkflowRunPhase = z.infer<typeof workflowRunPhaseSchema>;

/** run 级用量：观察面而非控制面，直接取引擎事件携带的已花总量与已派发节点数。 */
export const workflowRunUsageSchema = z.object({
  spentTokens: z.number().int().nonnegative(),
  nodesUsed: z.number().int().nonnegative(),
});
export type WorkflowRunUsage = z.infer<typeof workflowRunUsageSchema>;

// 一个 actor 实例。status 是派生的三态（引擎不发 actor 生命周期事件，状态从该 actor 的节点
// 与 run 终态推出来）；不存在可观察的 actor 级 failed。sessionId 是 actor 会话 id，由 run
// service 按 (runId, actorRef) 确定性铸造。
export const workflowRunActorSchema = z.object({
  siteId: z.string().min(1).max(64),
  ordinal: z.number().int().nonnegative(),
  name: z.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxActorNameLength).optional(),
  sessionId: z.string().min(1).max(256).optional(),
  status: z.enum(["waiting", "running", "completed"]),
  /** 出生阶段名（铸造 ordinal 时的 phase 标记），UI 按名字与 phases[].name 关联；可缺席。 */
  phaseName: z.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxPhaseNameLength).optional(),
});
export type WorkflowRunActor = z.infer<typeof workflowRunActorSchema>;

/** 一次 ask 里最近一次工具调用；刻意只有工具名与短目标，参数全文/文件内容不进这条高频键。 */
export const workflowRunNodeLastToolSchema = z.object({
  name: z.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxLastToolNameLength),
  target: z.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxLastToolTargetLength).optional(),
});
export type WorkflowRunNodeLastTool = z.infer<typeof workflowRunNodeLastToolSchema>;

// 一个节点（ask / world-read）实例。phase 是引擎实际发出的节点事件相位；kind 只在 queued 上
// 携带（resume 命中短路直接发 node-settled，不经 queued），故可缺席。phaseName 是脚本阶段
// 坐标，与相位字段 phase 不是一回事。instructionsHead 是作者任务摘要的头，随 node-queued 到达。
export const workflowRunNodeSchema = z.object({
  siteId: z.string().min(1).max(64),
  ordinal: z.number().int().nonnegative(),
  kind: z.enum(["ask", "world-read"]).optional(),
  phase: z.enum(["queued", "dispatched", "executing", "waiting", "repairing", "nudged", "settled"]),
  outcome: z.enum(["ok", "failed", "cancelled"]).optional(),
  cached: z.boolean().optional(),
  actorSiteId: z.string().min(1).max(64).optional(),
  actorOrdinal: z.number().int().nonnegative().optional(),
  phaseName: z.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxPhaseNameLength).optional(),
  instructionsHead: z
    .string()
    .min(1)
    .max(WORKFLOW_RUNS_LIMITS.maxInstructionsHeadLength)
    .optional(),
  /** 已解析轮次（1 起）、累计工具调用数与最近一次工具调用；后来者覆盖而非取 max。 */
  turn: z.number().int().positive().optional(),
  toolCalls: z.number().int().nonnegative().optional(),
  lastTool: workflowRunNodeLastToolSchema.optional(),
});
export type WorkflowRunNode = z.infer<typeof workflowRunNodeSchema>;

// 本 run 的并发现状。cap 是共享闸门现状、ceiling 是 CPU 天花板（实际并发取两者最小）、limit
// 是本 run 自己的界（低于天花板时才在场）、cooldownMs 是限流冻结时长（run 终态会清掉）。
export const workflowRunConcurrencySchema = z.object({
  key: z.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxConcurrencyKeyLength).optional(),
  cap: z.number().int().positive(),
  ceiling: z.number().int().positive(),
  limit: z.number().int().positive().optional(),
  cooldownMs: z.number().int().nonnegative().optional(),
});
export type WorkflowRunConcurrency = z.infer<typeof workflowRunConcurrencySchema>;

// 一条 report(item) 交出的渐进产物（Results 区一行）。按 (siteId, ordinal) 去重，存预览文本
// 而不是原值；artifactId 可选，指向预置看板，带标签的条目仍进 reports。
export const workflowRunReportSchema = z.object({
  siteId: z.string().min(1).max(64),
  ordinal: z.number().int().nonnegative(),
  preview: z.string().max(WORKFLOW_RUNS_LIMITS.maxReportPreviewLength),
  artifactId: z.string().min(1).max(64).optional(),
});
export type WorkflowRunReport = z.infer<typeof workflowRunReportSchema>;

// 一个停驻中的升级问题：某 actor 撞上真阻塞后升级给主代理并停下等答案。去重键是全局唯一的
// qid；纯内存、随 run 终态清空（进程一死就没有在听的人）。
export const workflowRunPendingQuestionSchema = z.object({
  qid: z.string().min(1).max(128),
  actorSiteId: z.string().min(1).max(64).optional(),
  actorOrdinal: z.number().int().nonnegative().optional(),
  actorName: z.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxActorNameLength).optional(),
  question: z.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxQuestionLength),
  context: z.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxQuestionLength).optional(),
  askedAt: z.number().int().nonnegative().optional(),
});
export type WorkflowRunPendingQuestion = z.infer<typeof workflowRunPendingQuestionSchema>;

// 一条 run 的实时投影。大量键刻意 optional：往已有状态键上追加字段，旧 CLI 不发它时少一个键
// 是退化而不是整帧被丢。resumable 只在为真时在场；reports/pendingQuestions/artifacts/phases
// 零条时整个键缺席（消费者据此整区不渲染）。
export const workflowRunSchema = z.object({
  runId: z.string().min(1).max(128),
  toolCallId: z.string().min(1).max(128).optional(),
  status: z.enum(["pending", "running", "completed", "errored", "stopped"]),
  stopReason: z.enum(["user", "model", "provider", "interrupted", "superseded"]).optional(),
  /** lineage 两端：本 run 修订自哪个 run、被哪次修订停下并替代；都 optional。 */
  resumedFrom: z.string().min(1).max(128).optional(),
  supersededBy: z.string().min(1).max(128).optional(),
  usage: workflowRunUsageSchema,
  error: z.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxErrorLength).optional(),
  resumable: z.literal(true).optional(),
  resultPreview: z.string().max(WORKFLOW_RUNS_LIMITS.maxResultPreviewLength).optional(),
  actors: z.array(workflowRunActorSchema).max(WORKFLOW_RUNS_LIMITS.maxActors),
  nodes: z.array(workflowRunNodeSchema).max(WORKFLOW_RUNS_LIMITS.maxNodes),
  reports: z.array(workflowRunReportSchema).max(WORKFLOW_RUNS_LIMITS.maxReports).optional(),
  pendingQuestions: z
    .array(workflowRunPendingQuestionSchema)
    .max(WORKFLOW_RUNS_LIMITS.maxPendingQuestions)
    .optional(),
  concurrency: workflowRunConcurrencySchema.optional(),
  concurrencyCeiling: z
    .number()
    .int()
    .positive()
    .max(WORKFLOW_RUNS_LIMITS.maxConcurrencyCeiling)
    .optional(),
  subagentModel: z.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxSubagentModelLength).optional(),
  artifacts: z
    .array(workflowRunArtifactSummarySchema)
    .max(WORKFLOW_RUNS_LIMITS.maxArtifacts)
    .optional(),
  phases: z.array(workflowRunPhaseSchema).max(WORKFLOW_RUNS_LIMITS.maxPhases).optional(),
  currentPhase: z.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxPhaseNameLength).optional(),
  phaseNames: z
    .array(z.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxPhaseNameLength))
    .max(WORKFLOW_RUNS_LIMITS.maxPhases)
    .optional(),
  /** 与 phaseNames 按位置对齐的「同时在跑」下标表；缺席即轨道是一条直线。 */
  phaseAlongside: z
    .array(z.array(z.number().int().nonnegative()).max(WORKFLOW_RUNS_LIMITS.maxPhases))
    .max(WORKFLOW_RUNS_LIMITS.maxPhases)
    .optional(),
  truncated: z.boolean().optional(),
  lastEventSequence: z.number().int().nonnegative(),
});
export type WorkflowRunState = z.infer<typeof workflowRunSchema>;

export const workflowRunsStateSchema = z.object({
  revision: z.number().int().nonnegative(),
  runs: z.array(workflowRunSchema).max(WORKFLOW_RUNS_LIMITS.maxRuns),
});
export type WorkflowRunsState = z.infer<typeof workflowRunsStateSchema>;
