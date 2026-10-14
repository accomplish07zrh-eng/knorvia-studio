// SPDX-License-Identifier: Apache-2.0
// workflow run 的三段文案：actor 升级问答、run 级停滞、以及 provider 停下。
// 从 notification.ts 拆出（原文件承载四种任务的终态通知骨架）；provider 停下这段由终态通知与
// GetWorkflowRun 共用。所有面向模型与用户的句子逐字固定，改动等于改协议。
import type { DynamicWorkflowRunError as WorkflowRunError } from "@knorvia/contracts";
import { escapeXml, truncateTaskNotification } from "./notification.js";

const UNKNOWN = "unknown";
const NOTIFICATION_GAP = "";
const FAILING_REASON_CLAUSE = "the provider keeps failing requests";
const SYSTEM_NOTIFICATION_BANNER = "[SYSTEM NOTIFICATION - NOT USER INPUT]";
const AUTOMATED_EVENT_LINE = "This is an automated workflow event, NOT a message from the user.";
const NO_ACKNOWLEDGEMENT_LINE =
  "Do NOT interpret this as user acknowledgement, confirmation, or response to any pending question.";
const NOTIFICATION_HEADER = [
  SYSTEM_NOTIFICATION_BANNER,
  AUTOMATED_EVENT_LINE,
  NO_ACKNOWLEDGEMENT_LINE,
];

type ProviderStopDetails = NonNullable<WorkflowRunError["providerStop"]>;

// 结构化节统一由它拼：转义只做一次，两个 formatter 的形状也保持一致。
function xmlElement(name: string, value: string): string {
  return `  <${name}>${escapeXml(value)}</${name}>`;
}

interface ProviderStopCopy {
  kind: ProviderStopDetails["kind"];
  provider: string;
  providerRef: string;
  subagent: string;
  phase: string;
  model: string;
  code: string;
  resume: string;
  runId: string;
  providerId: string | undefined;
  resetAt: number | undefined;
}

// 每种 providerStop.kind 两句话：什么错了、下一步做什么。占位全都有兜底，一条通知不会因为少
// 一个字段就退化成空句。
function providerStopSentences(copy: ProviderStopCopy): [string, string] {
  switch (copy.kind) {
    case "auth": {
      const what = `Sign-in to ${copy.providerRef} expired while subagent ${copy.subagent}${copy.phase} was running.`;
      const next = `Ask the user to sign in to ${copy.provider} again, ${copy.resume}. Finished steps are kept.`;
      return [what, next];
    }
    case "not_configured": {
      const providerName = copy.providerId ?? copy.provider;
      const what = `Provider ${providerName} is not configured on this machine, so subagent ${copy.subagent}${copy.phase} could not send its request.`;
      const next = `Ask the user to configure the provider or switch this session to another model, ${copy.resume}.`;
      return [what, next];
    }
    case "model_unavailable": {
      const what = `Model ${copy.model} is not available on ${copy.provider} (not in the user's plan, or retired).`;
      const next = `Ask the user to switch this session to a model the plan includes, ${copy.resume}. Subagents follow the session's model.`;
      return [what, next];
    }
    case "invalid_request": {
      const what = `${copy.provider} rejected subagent ${copy.subagent}${copy.phase}'s request as invalid (code ${copy.code}).`;
      const next = `Switching the session to another model usually clears this; ${copy.resume}. If it stops again with the same code, show the raw message to the user.`;
      return [what, next];
    }
    case "quota": {
      if (copy.resetAt === undefined) {
        const what = `${copy.provider} reports the user's quota is exhausted (code ${copy.code}).`;
        const next = `Ask the user to top up or upgrade the plan, or switch to another provider, ${copy.resume}.`;
        return [what, next];
      }
      const what = `${copy.provider} reports the user's usage cap is reached (code ${copy.code}); it resets at ${new Date(copy.resetAt).toISOString()}.`;
      const next = `Tell the user; after the reset, call ResumeWorkflowRun with run_id="${copy.runId}". Do not rebuild the workflow.`;
      return [what, next];
    }
    default: {
      const what = `${copy.provider} refused subagent ${copy.subagent}${copy.phase}'s request with a permanent error (code ${copy.code}).`;
      const next = `Resolve it with the user (the raw message below says what the provider wants), ${copy.resume}.`;
      return [what, next];
    }
  }
}

// 事实行：provider / model / subagent 缺席写 unknown，phase 缺席整段不出，code 总是最后一项。
function providerStopFacts(details: ProviderStopDetails, code: string): string {
  const facts: string[] = [];
  facts.push(`provider=${details.providerId ?? UNKNOWN}`);
  facts.push(`model=${details.modelId ?? UNKNOWN}`);
  facts.push(`subagent=${details.subagent ?? UNKNOWN}`);
  if (details.phase !== undefined) facts.push(`phase=${details.phase}`);
  facts.push(`code=${code}`);
  return facts.join(" ");
}

// `stopped(provider)` 的 `<error>` 块：两句按 kind 选出来的话 + 事实行 + provider 原文行。
export function formatWorkflowProviderStopError(failure: WorkflowRunError, runId: string): string {
  const details = failure.providerStop;
  if (details === undefined) return failure.message;
  const provider = details.providerLabel ?? details.providerId ?? "the provider";
  const hasBothNames = details.providerLabel !== undefined && details.providerId !== undefined;
  const providerRef = hasBothNames ? `${details.providerLabel} (${details.providerId})` : provider;
  const subagent = details.subagentName ?? details.subagent ?? "a subagent";
  const phaseSuffix = details.phase === undefined ? "" : ` (phase "${details.phase}")`;
  const model = details.modelId ?? "the current model";
  const stopCode = details.providerCode ?? details.reason;
  const resume = `then call ResumeWorkflowRun with run_id="${runId}"`;
  const [what, next] = providerStopSentences({
    code: stopCode,
    kind: details.kind,
    model,
    phase: phaseSuffix,
    provider,
    providerId: details.providerId,
    providerRef,
    resetAt: details.resetAt,
    resume,
    runId,
    subagent,
  });
  const output = [what, next, providerStopFacts(details, stopCode)];
  if (details.rawMessage !== undefined) output.push(`raw: ${details.rawMessage}`);
  return output.join("\n");
}

// run 级停滞的 run 中通知：播报的是「还在跑、只是很久没成功过一次请求」这个事实。
// 文案必须说死两件事——它不需要模型做任何事（尤其不要取消或重建），以及用户若在等就该被告知。
export interface WorkflowStallNotificationInput {
  runLabel: string;
  runId: string;
  sinceMs: number;
  reason?: string;
  cap?: number;
}

export function formatWorkflowStallNotification(input: WorkflowStallNotificationInput): string {
  const minutes = Math.max(1, Math.round(input.sinceMs / 60_000));
  const bodyLines = [
    ...NOTIFICATION_HEADER,
    NOTIFICATION_GAP,
    "<workflow-stall>",
    xmlElement("run-id", input.runId),
    xmlElement("run", input.runLabel),
    `  <since-ms>${Math.max(0, Math.floor(input.sinceMs))}</since-ms>`,
  ];
  if (input.reason !== undefined) bodyLines.push(xmlElement("dominant-reason", input.reason));
  if (input.cap !== undefined) bodyLines.push(`  <cap>${input.cap}</cap>`);
  let reasonClause = FAILING_REASON_CLAUSE;
  if (input.reason !== undefined) reasonClause = `the provider keeps answering ${input.reason}`;
  const capClause = input.cap === undefined ? "" : ` (current fan-out ${input.cap})`;
  const summary = `Workflow run ${input.runLabel} (${input.runId}) has not completed a model request in ${minutes} minutes; ${reasonClause} and the run is retrying with backoff${capClause}.`;
  const guidance =
    "It is still running and needs nothing from you. Tell the user if they are waiting on it; they can stop it from the run card. Do not cancel or rebuild it on your own.";
  bodyLines.push("</workflow-stall>", NOTIFICATION_GAP, summary, guidance);
  return truncateTaskNotification(bodyLines.join("\n"));
}

// 一个 actor 从正在跑的 run 里升级上来的阻塞问题：播报的是「一个还没被满足的义务」——
// 有个 actor 正停在那儿等回答，而且没有超时会替它兜底。文案因此要同时说清：问题是什么、
// 逐字的下一步（带 qid 的工具调用）、以及 run 并没有因此停下。不重发、不催办。
export interface WorkflowEscalationNotificationInput {
  /** run 的展示名（registry 里的 description；缺席时调用方已回落到 runId）。 */
  runLabel: string;
  runId: string;
  qid: string;
  /** actor 的人类可读名；匿名 actor 缺席，调用方给结构化 ref 作兜底。 */
  actor: string;
  question: string;
  context?: string;
}

export function formatWorkflowEscalationNotification(
  input: WorkflowEscalationNotificationInput,
): string {
  const bodyLines = [
    ...NOTIFICATION_HEADER,
    NOTIFICATION_GAP,
    "<workflow-escalation>",
    xmlElement("run-id", input.runId),
    xmlElement("run", input.runLabel),
    xmlElement("question-id", input.qid),
    xmlElement("subagent", input.actor),
    xmlElement("question", input.question),
  ];
  if (input.context !== undefined && input.context.length > 0) {
    bodyLines.push(xmlElement("context", input.context));
  }
  const parked = `Subagent ${input.actor} in workflow run ${input.runLabel} (${input.runId}) escalated a blocking question and is parked on that call waiting for your answer.`;
  const nextStep = `Next step: call ResolveWorkflowQuestion with question_id="${input.qid}" and your answer.`;
  const scope =
    "The run is still running: only the subagent that asked is parked — every other subagent and the script's control flow keep going. So do not drop what you are doing, but do not leave it unanswered either: nothing times out on its behalf.";
  const fallback =
    "If this notification is ever lost, GetWorkflowRun lists the questions this run still owes an answer to.";
  bodyLines.push("</workflow-escalation>", NOTIFICATION_GAP, parked, nextStep, scope, fallback);
  return truncateTaskNotification(bodyLines.join("\n"));
}
