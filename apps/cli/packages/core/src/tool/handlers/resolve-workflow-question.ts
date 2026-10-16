// SPDX-License-Identifier: Apache-2.0
// ResolveWorkflowQuestion：回答 actor 从正在跑的 workflow 里升级上来的阻塞问题。qid 查表、driver
// 结算、事件双轨全在端口服务端；门面只取端口（typeof 探测）、透传 qid 与答案、投影契约形状。
// 拒绝文案**原样透传**服务端 message（判别键与文案分开维护则两处迟早说不同的话）——本文件只挑
// errorCode，一个字不改。

import {
  RESOLVE_WORKFLOW_QUESTION_TOOL_NAME,
  ResolveWorkflowQuestionInputJsonSchema,
  ResolveWorkflowQuestionInputSchema,
  ResolveWorkflowQuestionOutputJsonSchema,
  ResolveWorkflowQuestionOutputSchema,
  type ModelMessageContent,
  type ResolveWorkflowQuestionInput,
  type ResolveWorkflowQuestionOutput,
} from "@knorvia/contracts";
import type { ToolEntry, ToolExecutionContext, ToolHandler, ToolHandlerFailure } from "../types.js";

const RESOLVE_WORKFLOW_QUESTION_TIMEOUT_MS = 15_000; // 含 driver 结算，15 秒档
// 输出只有一段确认文案：24k 预算绰绰有余（照 ResumeWorkflowRun 档）。
const RESOLVE_WORKFLOW_QUESTION_MODEL_BYTES = 24_000; // 24k 模型面预算

/**
 * 本地失败码表。数值只是日志位（executor 投影成 `code: "N"`）；三个拒绝分支的 message 由服务端
 * 写好、原样透传。刻意从 21 起编，与内省表（1/2）和 ResumeWorkflowRun 表（11–17）视觉分开——
 * 三张表的数值空间互相独立、禁止跨表比对。
 */
const RESOLVE_WORKFLOW_QUESTION_ERROR_CODE = {
  ANSWERING_UNAVAILABLE: 21, // 端口/方法缺席
  UNKNOWN_QUESTION: 22, // qid 查无
  ALREADY_RESOLVED: 23, // 已答过
  RUN_NOT_IN_FLIGHT: 24, // run 不在飞
} as const;

const DESCRIPTION_INTRO =
  "Answers a blocking question that a subagent escalated from inside a RUNNING dynamic-workflow run.";

const DESCRIPTION_BULLETS = [
  "- Takes question_id — the ID from the escalation notification (it looks like `dwfq-...`). If that notification was lost, GetWorkflowRun lists the questions a run still owes an answer to.", // 入参来源
  "- The run keeps running the whole time: only the subagent that asked is parked on its call, while every other subagent and the script's control flow keep going. Your answer becomes that call's result verbatim and the subagent continues from there.", // 运行不中断
  "- Answer directly and actionably. If you are not sure, look at the run first with GetWorkflowRun, or ask the user with AskUserQuestion, then come back and answer — nothing answers on your behalf, and the subagent waits indefinitely.", // 作答纪律
  "- If the question reveals the SCRIPT is structurally broken (a broken gate, wrong control flow), a sentence cannot fix that: cancel the run and continue with a revised script via CreateWorkflow's `resume_from`.", // 结构性问题
];

function composeDescription(): string {
  return [DESCRIPTION_INTRO, "", ...DESCRIPTION_BULLETS].join("\n");
}

const RESOLVE_WORKFLOW_QUESTION_DESCRIPTION = composeDescription();

/** 结构化失败构造器：result:false + 码 + message（message 原样透传）。 */
function failure(code: number, message: string): ToolHandlerFailure {
  return { result: false, errorCode: code, message };
}

/**
 * 「本会话没有应答能力」。端口缺席与方法缺席回同一失败（照 resume 的 typeof 探测先例）。
 * 绝不静默成功——那会让一个 actor 永远等下去，而模型以为自己已经答过了。
 */
function resolveQuestionUnavailableFailure(): ToolHandlerFailure {
  return failure(
    RESOLVE_WORKFLOW_QUESTION_ERROR_CODE.ANSWERING_UNAVAILABLE,
    "workflow_question_answering_unavailable: this session cannot answer workflow escalations — workflow execution is not available here. This is a capability gap, not a bad question ID.",
  );
}

/** 三 reason → 码表查表；message 原样来自服务端（判别键与文案分治）。 */
function resolveQuestionFailureFor(reason: string, message: string): ToolHandlerFailure {
  const table: Record<string, number> = {
    unknown_question: RESOLVE_WORKFLOW_QUESTION_ERROR_CODE.UNKNOWN_QUESTION,
    already_resolved: RESOLVE_WORKFLOW_QUESTION_ERROR_CODE.ALREADY_RESOLVED,
    run_not_in_flight: RESOLVE_WORKFLOW_QUESTION_ERROR_CODE.RUN_NOT_IN_FLIGHT,
  };
  const code = table[reason];
  if (code !== undefined) return failure(code, message); // 服务端文案原样透传
  // 端口契约外的 reason：仍回结构化失败（throw 是接线故障的通道），文案带原词供排查。
  return failure(
    RESOLVE_WORKFLOW_QUESTION_ERROR_CODE.UNKNOWN_QUESTION,
    `${message} (reason: ${reason})`, // 原词透传
  );
}

const resolveWorkflowQuestionHandler: ToolHandler = async (call, scope: ToolExecutionContext) => {
  const parsed = ResolveWorkflowQuestionInputSchema.parse(call) as ResolveWorkflowQuestionInput; // 入参校验

  const port = scope.dynamicWorkflowRunPort;
  const answer =
    port && typeof port.resolveQuestion === "function"
      ? port.resolveQuestion.bind(port)
      : undefined;
  if (!answer) return resolveQuestionUnavailableFailure(); // 能力缺口（端口/方法缺席同形）

  const result = await answer(parsed.question_id, parsed.answer); // 恰好一次端口调用
  const rejected = !result.ok;
  if (rejected) {
    return resolveQuestionFailureFor(result.reason, result.message); // 三 reason + 兜底
  }

  return {
    ok: true, // 成功标志
    qid: result.qid, // 送达的问题 id
    // 说清两件事：答案已经送达，以及 run 并没有因此停下——主代理不必守着它。
    response: `Answer delivered for question ${result.qid}. The subagent that asked has resumed its turn with your answer; the run keeps going as before.`,
  } satisfies ResolveWorkflowQuestionOutput; // 契约形状
};

function formatResolveWorkflowQuestionModelContent(raw: unknown): ModelMessageContent {
  const parsed = ResolveWorkflowQuestionOutputSchema.safeParse(raw); // 契约形状校验
  if (!parsed.success) return "ResolveWorkflowQuestion returned an invalid result."; // 定型兜底
  return parsed.data.response; // 成功面只回确认文案
}

function toolMetadata() {
  // 声明面：作答让停驻的 actor 继续干活（readOnly false），但 run 已在确认窗过关故免确认
  const surface = {
    name: RESOLVE_WORKFLOW_QUESTION_TOOL_NAME, // 工具名（契约面）
    description: RESOLVE_WORKFLOW_QUESTION_DESCRIPTION, // 引导文案（协议面）
    readOnly: false, // 作答影响 actor 后续动作
    destructive: false, // 无破坏
    concurrentSafe: true, // 并发安全
    timeoutMs: RESOLVE_WORKFLOW_QUESTION_TIMEOUT_MS, // 15s
    maxOutputBytes: RESOLVE_WORKFLOW_QUESTION_MODEL_BYTES, // 24k
    sideEffectScope: "none" as const,
    riskLevel: "low" as const,
    needsApproval: false, // 免确认：弹窗会把等答案的 actor 挂更久
  };
  return surface;
}

function toolPermission(): ToolEntry["permission"] {
  // 权限面：作答送进已获批准的 run
  const surface = {
    permission: "resolveWorkflowQuestion" as const, // 权限名
    reason: "resolveWorkflowQuestion answers a blocked subagent inside a running workflow run", // 理由（协议面）
    riskLevel: "low" as const,
    sideEffectScope: "none" as const,
    needsApproval: false, // 与 ResumeWorkflowRun 同一风险档
    // question_id 进模式匹配面（照 ResumeWorkflowRun 的 run_id）。
    patternSources: ["toolName", "input"] as ToolEntry["permission"]["patternSources"],
    alwaysAllowPatternSources: ["toolName"] as ToolEntry["permission"]["alwaysAllowPatternSources"],
    denyPriority: "beforeAsk" as const,
  };
  return surface;
}

function toolBudget() {
  // 预算面：一段确认文案，truncate 档
  const surface = {
    maxInlineBytes: RESOLVE_WORKFLOW_QUESTION_MODEL_BYTES, // 24k 内联上限
    maxModelBytes: RESOLVE_WORKFLOW_QUESTION_MODEL_BYTES, // 24k 模型面上限
    strategy: "truncate" as const, // 超限截断
    preview: {
      maxBytes: RESOLVE_WORKFLOW_QUESTION_MODEL_BYTES, // 预览同预算
      direction: "head" as const,
    },
  };
  return surface;
}

export const resolveWorkflowQuestionToolEntry: ToolEntry = {
  capability: "Answer a blocking question escalated by a subagent inside a running workflow run", // 能力一句话
  metadata: toolMetadata(),
  handler: resolveWorkflowQuestionHandler,
  inputSchema: ResolveWorkflowQuestionInputJsonSchema,
  outputSchema: ResolveWorkflowQuestionOutputJsonSchema,
  runtimeInputSchema: ResolveWorkflowQuestionInputSchema,
  runtimeOutputSchema: ResolveWorkflowQuestionOutputSchema,
  formatModelContent: formatResolveWorkflowQuestionModelContent,
  permission: toolPermission(),
  resultBudget: toolBudget(),
  timeout: {
    kind: "timed" as const,
    defaultMs: RESOLVE_WORKFLOW_QUESTION_TIMEOUT_MS, // 15s
    maxMs: RESOLVE_WORKFLOW_QUESTION_TIMEOUT_MS, // 15s 封顶
    allowCallOverride: false, // 调用方不得放宽
  },
  cancellation: {
    supported: false, // 不可取消
    cleanup: "none" as const,
    userVisibleMessage:
      "ResolveWorkflowQuestion delivers the answer synchronously and cannot be cancelled", // 取消语义文案
  },
  trace: {
    required: true, // 必带 trace
    propagateToAdapters: true, // 作答动作向适配器传播
    recordInput: "summary" as const, // 输入只留摘要
    recordOutput: "summary" as const, // 输出只留摘要
  },
};
