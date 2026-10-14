// SPDX-License-Identifier: Apache-2.0
// 观察类工作流工具的 display 载荷：GetWorkflowRun / ListWorkflowRuns / EvalWorkflowSnippet /
// ListSavedWorkflows / ListModels / ResumeWorkflowRun 六张结果卡的形状。

import { z } from "zod";

import {
  CREATE_WORKFLOW_DISPLAY_MAX_DIAGNOSTICS,
  createWorkflowToolResultDisplayDiagnosticSchema,
} from "./create-workflow.js";
import {
  GET_WORKFLOW_RUN_ROSTER_LIMITS,
  GET_WORKFLOW_RUN_SUMMARY_MAX_CHARS,
  GetWorkflowRunActorSchema,
  GetWorkflowRunHealthSchema,
  GetWorkflowRunPhaseSchema,
  GetWorkflowRunSubagentLastToolSchema,
  GetWorkflowRunUsageSchema,
} from "./get-workflow-run.js";
import {
  ListWorkflowRunsRunSchema,
  WORKFLOW_RUN_LIFECYCLE_STATUSES,
  WORKFLOW_RUN_STOP_REASONS,
} from "./list-workflow-runs.js";

// 为什么这些形状单独成一条通道：display 不走工具结果的 result budget，字段在写进实时事件
// 和持久化 metadata 之前没有第二道闸门，所以每处长度、每条数组都得在这里独立封顶；构造侧
// （core 的 tool/executor/workflow-observation-display.ts）发现越界就按字段截断并置 truncated，
// 而不是让整条载荷校验失败。两边的限长常量一一对应，改一处必须改两处。

// 三个私有小工具，把反复出现的「限长」「封顶」「拒绝未知键」各收一处；只在本文件使用。
const boundedText = (maxChars: number) => z.string().max(maxChars);
const optionalBoundedText = (maxChars: number) => boundedText(maxChars).optional();
const boundedList = <T extends z.ZodTypeAny>(item: T, maxItems: number) =>
  z.array(item).max(maxItems);
const strictRecord = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();

// 卡的宽度是有限的：这些上限就是渲染端一次愿意画多少，越界部分由构造侧裁掉并打 truncated。
export const WORKFLOW_OBSERVATION_DISPLAY_MAX_LOG_ENTRIES = 40;
export const WORKFLOW_OBSERVATION_DISPLAY_MAX_LOG_CHARS = 1_024;
export const WORKFLOW_OBSERVATION_DISPLAY_MAX_ACTORS = 32;
export const WORKFLOW_OBSERVATION_DISPLAY_MAX_RESULT_CHARS = 4_000;
export const WORKFLOW_OBSERVATION_DISPLAY_MAX_META_CHARS = 2_048;
export const WORKFLOW_OBSERVATION_DISPLAY_MAX_RUNS = 50;
export const WORKFLOW_OBSERVATION_DISPLAY_MAX_ARGS = 32;
// 目录卡一次最多画几行模型（超出由构造侧 slice 并打 truncated）。
export const WORKFLOW_OBSERVATION_DISPLAY_MAX_MODELS = 100;
// 情势截面的界与工具面同值，不从工具输出 schema 里另取一套：两边不同步会让同一份快照
// 在输出通道通过、在 display 通道被拒。
export const WORKFLOW_OBSERVATION_DISPLAY_MAX_PHASES = GET_WORKFLOW_RUN_ROSTER_LIMITS.maxPhases;
export const WORKFLOW_OBSERVATION_DISPLAY_MAX_SUBAGENTS =
  GET_WORKFLOW_RUN_ROSTER_LIMITS.maxSubagents;

// 子代理状态与等待原因两套取值在这里声明的是一份「闭集」：消费侧 bundle 碰到没见过的枚举值
// 会整帧拒收（历史上丢过一整条订阅），所以它们与工具面必须逐字同集、一起演进。
const DISPLAY_SUBAGENT_STATES = [
  "idle",
  "executing",
  "waiting",
  "parked",
  "done",
  "failed",
  "unfinished",
] as const satisfies readonly [string, ...string[]];
const DISPLAY_SUBAGENT_WAIT_CAUSES = ["slot", "backoff"] as const;

// 卡上的一个子代理。这里刻意压成扁平行，不跟着工具输出的嵌套形状走：这一行要画的就是
// 「谁、在哪个阶段、跑到第几轮、最后碰了哪个工具」，多包一层渲染端还得先拆开再拼回去。
export const getWorkflowRunToolResultDisplaySubagentSchema = strictRecord({
  siteId: z.string().min(1),
  ordinal: z.number().int().nonnegative(),
  name: optionalBoundedText(GET_WORKFLOW_RUN_ROSTER_LIMITS.maxActorNameLength),
  state: z.enum(DISPLAY_SUBAGENT_STATES),
  phaseName: optionalBoundedText(GET_WORKFLOW_RUN_ROSTER_LIMITS.maxPhaseNameLength),
  // 当前 ask 的任务摘要与进度读数。缺席表示「不知道」，不是一个 0。
  instructionsHead: optionalBoundedText(GET_WORKFLOW_RUN_ROSTER_LIMITS.maxInstructionsHeadLength),
  startedAt: z.number().optional(),
  turn: z.number().int().nonnegative().optional(),
  toolCalls: z.number().int().nonnegative().optional(),
  lastTool: GetWorkflowRunSubagentLastToolSchema.optional(),
  // 在等什么。原因文本不上卡：卡只需要分辨「等槽位」还是「在退避」，以及还要等多久。
  waitCause: z.enum(DISPLAY_SUBAGENT_WAIT_CAUSES).optional(),
  retryAfterMs: z.number().nonnegative().optional(),
  waitSince: z.number().optional(),
  parkedOn: z.string().optional(),
  stepsSettled: z.number().int().nonnegative(),
  stepsFailed: z.number().int().nonnegative(),
  tokens: z.number().int().nonnegative(),
  lastProgressAt: z.number().optional(),
});

// 一条叙事行：sequence 沿用 journal 里的原始序号，message 已在构造侧按字符上限截断。
// at 是事件落 journal 的时刻（epoch ms），与工具输出的 logTail[].at 同源，卡上的年龄统一对
// generatedAt 算；可选是因为情势截面上线前落库的载荷没有这个键。
export const getWorkflowRunToolResultDisplayLogEntrySchema = strictRecord({
  sequence: z.number(),
  message: boundedText(WORKFLOW_OBSERVATION_DISPLAY_MAX_LOG_CHARS),
  at: z.number().optional(),
});

// 工具卡上的结构化失败，只留 code 与 message，刻意不复用工具输出的 GetWorkflowRunErrorSchema。
// 两个通道的读者不同：输出给模型看，它需要 providerStop 之类的字段才知道该改什么；display 给
// 渲染端看，而渲染端拿 packages/shared 的镜像 schema 严格校验每一帧——字段一多、镜像慢半步，
// 整行就被拒、会话恢复直接 fail-closed。下面这份形状与那份镜像是同一件事的两侧，逐字段同步。
export const getWorkflowRunToolResultDisplayErrorSchema = strictRecord({
  code: z.string(),
  message: z.string(),
});

// GetWorkflowRun 的结果卡载荷。预算与 actor 直接借用工具输出 schema（纯小数值或已有界的小
// 结构）；error 用上面那份 display 专用形状；logTail 与 result 在 display 侧另设上限——输出侧
// 的逐条上限与 artifact 序列化上限属于模型通道，与这里的界互不替代。

// 情势截面的五个键（summary / generatedAt / phases / subagents / health）全部可选，虽然构造侧
// 每次都填：截面上线之前持久化的 get_workflow_run 载荷没有这些键，而本 schema 是 strict 的，
// 改成必填等于让升级后打开的每一条历史会话整卡校验失败、退化成纯文本。文本兜底只服务
// 「完全没有载荷」的老行，不服务有载荷的行。

// generatedAt 是卡上所有「多久以前」的基准：必须取快照时刻，不能取渲染时的 Date.now()，
// 否则一条三天前的 transcript 重新打开时，卡上显示的年龄会缩水成刚刚。
export const getWorkflowRunToolResultDisplayPayloadSchema = strictRecord({
  kind: z.literal("get_workflow_run"),
  runId: z.string().min(1),
  label: z.string(),
  status: z.enum(WORKFLOW_RUN_LIFECYCLE_STATUSES),
  // 只在 status 为 stopped 时在场。
  stopReason: z.enum(WORKFLOW_RUN_STOP_REASONS).optional(),
  possiblyInterrupted: z.boolean().optional(),
  summary: optionalBoundedText(GET_WORKFLOW_RUN_SUMMARY_MAX_CHARS),
  generatedAt: z.number().optional(),
  usage: GetWorkflowRunUsageSchema,
  phases: boundedList(
    GetWorkflowRunPhaseSchema,
    WORKFLOW_OBSERVATION_DISPLAY_MAX_PHASES,
  ).optional(),
  subagents: boundedList(
    getWorkflowRunToolResultDisplaySubagentSchema,
    WORKFLOW_OBSERVATION_DISPLAY_MAX_SUBAGENTS,
  ).optional(),
  health: GetWorkflowRunHealthSchema.optional(),
  actors: boundedList(GetWorkflowRunActorSchema, WORKFLOW_OBSERVATION_DISPLAY_MAX_ACTORS),
  logTail: boundedList(
    getWorkflowRunToolResultDisplayLogEntrySchema,
    WORKFLOW_OBSERVATION_DISPLAY_MAX_LOG_ENTRIES,
  ),
  result: optionalBoundedText(WORKFLOW_OBSERVATION_DISPLAY_MAX_RESULT_CHARS),
  error: getWorkflowRunToolResultDisplayErrorSchema.optional(),
  truncated: z.boolean().optional(),
});

// ListWorkflowRuns 的结果卡载荷：run 行直接复用输出 schema，条数上限跟着工具侧 limit 的封顶
// 一起取，读侧因此不需要为两条通道各写一套行渲染。
export const listWorkflowRunsToolResultDisplayPayloadSchema = strictRecord({
  kind: z.literal("list_workflow_runs"),
  runs: boundedList(ListWorkflowRunsRunSchema, WORKFLOW_OBSERVATION_DISPLAY_MAX_RUNS),
  truncated: z.boolean().optional(),
});

// EvalWorkflowSnippet 的结果卡载荷：诊断复用 create_workflow 的 display 诊断形状与同一道限长
// （同一套 TS 诊断，没必要在家门口再定一份）；logs 只取尾巴若干条，response 独立限长。
export const evalWorkflowSnippetToolResultDisplayPayloadSchema = strictRecord({
  kind: z.literal("eval_workflow_snippet"),
  ok: z.boolean(),
  diagnostics: boundedList(
    createWorkflowToolResultDisplayDiagnosticSchema,
    CREATE_WORKFLOW_DISPLAY_MAX_DIAGNOSTICS,
  ),
  logs: boundedList(
    boundedText(WORKFLOW_OBSERVATION_DISPLAY_MAX_LOG_CHARS),
    WORKFLOW_OBSERVATION_DISPLAY_MAX_LOG_ENTRIES,
  ),
  response: boundedText(WORKFLOW_OBSERVATION_DISPLAY_MAX_RESULT_CHARS),
  durationMs: z.number().int().nonnegative(),
  truncated: z.boolean().optional(),
});

// ListSavedWorkflows 的结果卡载荷。根因：v4 wire 上的 output.text 是 formatModelContent 的
// XML 风格投影，UI 侧的 JSON 探针永远命不中，最后掉进 raw JSON 兜底卡——结构化列表只能从
// 这条 display 通道出去。description / whenToUse 各自限长；argNames 只留名字，参数声明细节
// 归确认窗，不进卡。
export const savedWorkflowListToolResultDisplayPayloadSchema = strictRecord({
  kind: z.literal("saved_workflow_list"),
  workflows: boundedList(
    strictRecord({
      name: z.string().min(1),
      description: optionalBoundedText(WORKFLOW_OBSERVATION_DISPLAY_MAX_META_CHARS),
      whenToUse: optionalBoundedText(WORKFLOW_OBSERVATION_DISPLAY_MAX_META_CHARS),
      scope: z.string(),
      path: z.string().min(1),
      argNames: boundedList(z.string(), WORKFLOW_OBSERVATION_DISPLAY_MAX_ARGS),
    }),
    WORKFLOW_OBSERVATION_DISPLAY_MAX_RUNS,
  ),
  invalid: z
    .array(
      strictRecord({
        path: z.string().min(1),
        reason: optionalBoundedText(WORKFLOW_OBSERVATION_DISPLAY_MAX_LOG_CHARS),
      }),
    )
    .optional(),
  truncated: z.boolean().optional(),
});

// ListModels 的结果卡载荷，根因与 saved_workflow_list 同一条：output.text 是 <models> 投影，
// UI 的 JSON 探针不命中，结构化目录只能走本通道。
// 字段就是工具输出本身加一个 truncated：读侧要回答的「有哪些、来自哪里、哪个是当前」全在
// 里面。providerLabel / disabledReason 是注册表拿来的自由文本，display 不过 result budget，
// 必须在这里限长；其余是短 id 与小数值，原样透传。
export const listModelsToolResultDisplayPayloadSchema = strictRecord({
  kind: z.literal("list_models"),
  // 会话此刻的模型（规范形）；目录里一条都对不上时缺席。
  current: z.string().optional(),
  models: boundedList(
    strictRecord({
      id: z.string().min(1),
      providerId: z.string().min(1),
      modelId: z.string().min(1),
      providerLabel: optionalBoundedText(WORKFLOW_OBSERVATION_DISPLAY_MAX_META_CHARS),
      reasoningLevels: z.array(z.string()),
      defaultReasoningLevel: z.string().optional(),
      contextWindow: z.number().optional(),
      disabledReason: optionalBoundedText(WORKFLOW_OBSERVATION_DISPLAY_MAX_META_CHARS),
    }),
    WORKFLOW_OBSERVATION_DISPLAY_MAX_MODELS,
  ),
  truncated: z.boolean().optional(),
});

export type GetWorkflowRunToolResultDisplayPayload = z.infer<
  typeof getWorkflowRunToolResultDisplayPayloadSchema
>;
export type ListWorkflowRunsToolResultDisplayPayload = z.infer<
  typeof listWorkflowRunsToolResultDisplayPayloadSchema
>;
export type EvalWorkflowSnippetToolResultDisplayPayload = z.infer<
  typeof evalWorkflowSnippetToolResultDisplayPayloadSchema
>;
export type SavedWorkflowListToolResultDisplayPayload = z.infer<
  typeof savedWorkflowListToolResultDisplayPayloadSchema
>;
export type ListModelsToolResultDisplayPayload = z.infer<
  typeof listModelsToolResultDisplayPayloadSchema
>;

// ResumeWorkflowRun 的结果卡载荷，刻意只有 runId：这张卡要传达的事就是「哪个 run 在后台
// 继续」。response 里的引导文案属于模型通道的话术，UI 有自己的本地化词汇表，多带字段只涨
// wire 字节而没有消费者。构造侧 safeParse 输出 schema 失败即回 undefined、走文本兜底，
// 与上面几张卡同一骨架。
export const resumeWorkflowRunToolResultDisplayPayloadSchema = strictRecord({
  kind: z.literal("resume_workflow_run"),
  runId: z.string().min(1),
});
export type ResumeWorkflowRunToolResultDisplayPayload = z.infer<
  typeof resumeWorkflowRunToolResultDisplayPayloadSchema
>;
