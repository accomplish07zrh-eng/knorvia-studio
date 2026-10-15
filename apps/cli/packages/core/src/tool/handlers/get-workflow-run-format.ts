// SPDX-License-Identifier: Apache-2.0
// GetWorkflowRun 模型面骨架：事实一块一块排（摘要 → 身份 → 状态 → … → 路由指引），块间空行。
// 可选块只在对应字段在场时出现；路由指引（superseded/resumable/amendable）按状态与停因分叉，
// 每段文案逐字（金样把关）。输出不合法时回一句定型兜底。

import {
  GetWorkflowRunOutputSchema,
  type GetWorkflowRunOutput,
  type ModelMessageContent,
} from "@knorvia/contracts";
import { formatWorkflowProviderStopError } from "../../runtime-task/notification.js";
import { formatPublishedArtifactLine } from "../executor/workflow-published-artifacts.js";
import {
  formatWorkflowRunHealthBlock,
  formatWorkflowRunLogTailBlock,
  formatWorkflowRunPhasesBlock,
  formatWorkflowRunSubagentsBlock,
} from "./get-workflow-run-format-roster.js";
import {
  escapeWorkflowRunText,
  formatRelativeAge,
  formatWorkflowRunInstant,
  formatWorkflowRunTimestamp,
  workflowRunAttribute,
} from "./workflow-run-introspection.js";

const INVALID_RESULT = "GetWorkflowRun returned an invalid result.";

type Block = string;
type BlockList = Block[];

/** 可选块收集器：值缺席就整块蒸发（缺席语义的唯一入口）。 */
function pushWhen(target: BlockList, present: unknown, render: () => Block): void {
  if (present !== undefined) target.push(render());
}

/** 已渲染可选块：块不存在就蒸发。 */
function pushBlock(target: BlockList, block: Block | undefined): void {
  if (block !== undefined) target.push(block);
}

export function formatGetWorkflowRunModelContent(raw: unknown): ModelMessageContent {
  const parsed = GetWorkflowRunOutputSchema.safeParse(raw); // 契约形状校验
  if (!parsed.success) return INVALID_RESULT;

  const snapshot: GetWorkflowRunOutput = parsed.data;
  const settled =
    snapshot.status === "completed" || snapshot.status === "errored" || snapshot.status === "stopped";
  const blocks: BlockList = [];

  blocks.push(`<summary>${escapeWorkflowRunText(snapshot.summary)}</summary>`); // 一句话情势
  blocks.push(`<run_id>${escapeWorkflowRunText(snapshot.runId)}</run_id>`); // run 身份
  const labelBlock = `<label ${workflowRunAttribute("source", snapshot.labelSource)}>${escapeWorkflowRunText(snapshot.label)}</label>`;
  blocks.push(labelBlock); // 展示名（source 属性）
  blocks.push(`<status>${escapeWorkflowRunText(snapshot.status)}</status>`); // 生命周期
  pushWhen(blocks, snapshot.stopReason, () =>
    `<stop_reason>${escapeWorkflowRunText(snapshot.stopReason!)}</stop_reason>`,
  );
  pushWhen(blocks, snapshot.resumedFrom, () =>
    `<resumed_from>${escapeWorkflowRunText(snapshot.resumedFrom!)}</resumed_from>`,
  );
  pushWhen(blocks, snapshot.maxConcurrency, () => `<max_concurrency>${snapshot.maxConcurrency}</max_concurrency>`);
  pushWhen(blocks, snapshot.subagentModel, () =>
    `<subagent_model>${escapeWorkflowRunText(snapshot.subagentModel!)}</subagent_model>`,
  );
  pushWhen(blocks, snapshot.supersededBy, () =>
    `<superseded_by>${escapeWorkflowRunText(snapshot.supersededBy!)}</superseded_by>`,
  );
  blocks.push(`<owned_by_this_session>${snapshot.ownedByThisSession}</owned_by_this_session>`);
  if (snapshot.possiblyInterrupted) {
    blocks.push(
      "<possibly_interrupted>true — this session cannot confirm the run is still alive</possibly_interrupted>", // 不可知标注
    );
  }
  blocks.push( // 起始时刻块
    `<created_at>${formatWorkflowRunInstant(snapshot.generatedAt, snapshot.createdAt)}</created_at>`, // 起始时刻
  );
  blocks.push( // 更新时刻块
    `<updated_at>${formatWorkflowRunInstant(snapshot.generatedAt, snapshot.updatedAt)}</updated_at>`, // 更新时刻
  );

  pushBlock(blocks, pendingQuestionBlock(snapshot));
  blocks.push(formatWorkflowRunHealthBlock(snapshot, settled));
  pushBlock(blocks, formatWorkflowRunPhasesBlock(snapshot, settled));
  blocks.push(formatWorkflowRunSubagentsBlock(snapshot));
  blocks.push(formatWorkflowRunLogTailBlock(snapshot));
  blocks.push(usageBlock(snapshot));
  pushWhen(blocks, snapshot.result, () => `<result>\n${snapshot.result}\n</result>`);
  pushBlock(blocks, errorBlock(snapshot));
  pushBlock(blocks, artifactsBlock(snapshot));
  blocks.push(...routingBlocks(snapshot));
  return blocks.join("\n\n"); // 块间空行
}

/** 用量行：五个计数以固定键序空格相接。 */
function usageBlock(snapshot: GetWorkflowRunOutput): string {
  const usage = snapshot.usage;
  return `<usage>${[
    `spent_tokens=${usage.spentTokens}`,
    `nodes_observed=${usage.nodesObserved}`,
    `nodes_running=${usage.nodesRunning}`,
    `nodes_completed=${usage.nodesCompleted}`,
    `nodes_failed=${usage.nodesFailed}`,
  ].join(" ")}</usage>`;
}

function errorBlock(snapshot: GetWorkflowRunOutput): Block | undefined {
  if (snapshot.error === undefined) return undefined;
  const stopDetail = snapshot.error.providerStop;
  const body = // 失败正文：消息或 provider 停止详情
    stopDetail === undefined
      ? escapeWorkflowRunText(snapshot.error.message)
      : `\n${formatWorkflowProviderStopError(snapshot.error, snapshot.runId)}\n`;
  const attribute = workflowRunAttribute("code", snapshot.error.code);
  return `<error ${attribute}>${body}</error>`; // 失败块（code 属性）
}

function artifactsBlock(snapshot: GetWorkflowRunOutput): Block | undefined {
  const artifacts = snapshot.artifacts;
  if (artifacts === undefined || artifacts.length === 0) return undefined;
  const lines = artifacts.map((artifact) =>
    escapeWorkflowRunText(formatPublishedArtifactLine(artifact)),
  );
  return `<artifacts count="${artifacts.length}">\n${lines.join("\n")}\n</artifacts>`;
}

function pendingQuestionBlock(snapshot: GetWorkflowRunOutput): Block | undefined {
  if (!snapshot.health.pendingQuestionsKnown) {
    return "<pending_questions>Unknown: pending questions are tracked only by the process that owns the run, and this session does not. Resuming the run will re-ask any question its subagent still needs answered.</pending_questions>"; // 查不到就是查不到
  }

  const questions = snapshot.pendingQuestions ?? [];
  if (questions.length === 0) return undefined;

  const rows = questions.map((question) => questionRow(question, snapshot.generatedAt));
  const instruction = // 引导句（逐字）
    "Each of these subagents is parked waiting for an answer and nothing times out on its behalf. Answer one with ResolveWorkflowQuestion using the ID in brackets. The rest of the run keeps running meanwhile.";
  return `<pending_questions>\n${rows.join("\n\n")}\n\n${instruction}\n</pending_questions>`; // 待答区
}

/** 问题头部行：[qid] 谁 何时问的。 */
function questionHeader(
  question: NonNullable<GetWorkflowRunOutput["pendingQuestions"]>[number],
  clock: number,
): string {
  const who = question.actorName ?? question.actor;
  const age = formatRelativeAge(clock, question.askedAt);
  const asked =
    age === undefined ? `asked at ${formatWorkflowRunTimestamp(question.askedAt)}` : `asked ${age}`;
  return `[${escapeWorkflowRunText(question.qid)}] ${escapeWorkflowRunText(who)} ${asked}`;
}

/** 一个待答问题一块：头部行、问题本体、可选上下文。 */
function questionRow(
  question: NonNullable<GetWorkflowRunOutput["pendingQuestions"]>[number],
  clock: number,
): string {
  const lines = [
    questionHeader(question, clock),
    escapeWorkflowRunText(question.question), // 问题本体
  ];
  if (question.context !== undefined) {
    lines.push(`context: ${escapeWorkflowRunText(question.context)}`); // 补充上下文（可缺省）
  }
  return lines.join("\n");
}

/** 路由指引：superseded 只说「读继任者」；stopped 说「可续」；所有状态都说「可修订」。 */
function routingBlocks(snapshot: GetWorkflowRunOutput): BlockList {
  const superseded = snapshot.stopReason === "superseded";
  if (superseded) {
  const successor = // 继任者引用（无 id 就说 its successor）
      snapshot.supersededBy === undefined
        ? "its successor"
        : `run ${escapeWorkflowRunText(snapshot.supersededBy)}`;
    return [
      `<superseded>This run was stopped by an AmendWorkflow and superseded by ${successor}, which owns its unfinished work. Do not resume it (ResumeWorkflowRun will refuse) and do not amend it again; read or amend ${successor} instead.</superseded>`,
    ];
  }

  const blocks: BlockList = [];
  if (snapshot.status === "stopped") blocks.push(resumableBlock(snapshot.stopReason));
  blocks.push(amendableBlock(snapshot));
  return blocks;
}

/** 停因附句（user/model/provider 三形）；其余停因无附句。 */
const STOP_REASON_SENDS: Record<string, string> = {
  user: " This run was stopped on purpose by the user: resume it only when the user asks.",
  model:
    " You stopped this run yourself with TaskStop: resume it unchanged only if that is what the user wants. If you stopped it to fix the script, do not wait — amend it now, see <amendable>.",
  provider:
    " A provider-side error stopped it: resolve the cause named in <error> with the user before resuming, or it will stop again the same way.",
};

function resumableBlock(stopReason: GetWorkflowRunOutput["stopReason"]): Block {
  const reason = stopReason === undefined ? "" : (STOP_REASON_SENDS[stopReason] ?? "");
  return `<resumable>This run can be continued with ResumeWorkflowRun — it will resume under the same run ID, replaying finished steps and re-dispatching the unfinished ones.${reason} The script must be byte-for-byte the one this run was started with; to change it, see <amendable>.</resumable>`;
}

/** 修订指引的第四段按状态分；running 且未停滞走另一段短形态（amendableBlock 里）。 */
const AMENDABLE_STATUS_PARAGRAPHS: Record<string, string> = {
  errored:
    "This is the highest-value case for it: the script itself failed, so fix the script and re-run — every step that already succeeded is imported instead of being paid for a second time. Do NOT rewrite from scratch.",
  completed:
    "Use it to extend or refine a finished workflow — added steps run live, unchanged ones cost nothing.",
  stopped:
    "Use it when the script or a setting needs to change; use ResumeWorkflowRun to continue it unchanged. A run stopped because its script was wrong is amended now, not after the user asks: the cache holds everything that settled before the stop, and waiting buys nothing.",
};
const AMENDABLE_RUNNING_PARAGRAPH =
  "It is still running: if the script is visibly wrong, amend it now — AmendWorkflow stops this run, imports everything that settled so far, and starts the revision in one call. Do not TaskStop it first and do not wait for it to finish.";

function amendableStatusParagraph(snapshot: GetWorkflowRunOutput): string {
  return AMENDABLE_STATUS_PARAGRAPHS[snapshot.status] ?? AMENDABLE_RUNNING_PARAGRAPH;
}

function amendableBlock(snapshot: GetWorkflowRunOutput): Block {
  const script =
    snapshot.scriptPath === undefined
      ? ""
      : ` Its script is at ${escapeWorkflowRunText(snapshot.scriptPath)}: edit that file in place and pass \`path: "${escapeWorkflowRunText(snapshot.scriptPath)}"\` to AmendWorkflow instead of a script.`;

  const liveAndMoving = snapshot.status === "running" && snapshot.health.stalledSince === undefined;
  if (liveAndMoving) {
    return `<amendable>AmendWorkflow with run_id "${escapeWorkflowRunText(snapshot.runId)}" supersedes this run with a revised script and imports its finished work as cache.${script}</amendable>`;
  }

  const paragraphs = [
    `This run can be superseded by a revised script: call AmendWorkflow with \`run_id: "${escapeWorkflowRunText(snapshot.runId)}"\` and your new script.`,
    "That mints a NEW run and imports this one's finished work as a warm cache — matched per named subagent along its conversation prefix — so steps you did not change settle from cache at zero tokens and only the revised part runs live.",
    "To change only its settings (max_concurrency, subagent_model, name), omit both `script` and `path`: the new run keeps this run's script.",
    amendableStatusParagraph(snapshot),
  ];
  return `<amendable>${paragraphs.join(" ")}${script}</amendable>`;
}
