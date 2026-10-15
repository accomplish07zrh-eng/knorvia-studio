// SPDX-License-Identifier: Apache-2.0
// 花名册「正在做什么」活动行：按子代理相位分叉出一句描述——停驻的说等哪个问题、在等的说等什么、
// 未完结的说停时在飞、在跑的说 ask 与工具详情、安静的报步数。文案逐字（金样 B-ga 锁定）。
// 纪律：不知道就不说——没有时间戳就不拼年龄，没有 wait 就给空串，绝不造 0 冒充事实。

import type { GetWorkflowRunSubagent } from "@knorvia/contracts";
import {
  escapeWorkflowRunText,
  formatRelativeAge,
  formatWorkflowRunDuration,
} from "./workflow-run-introspection.js";

type Ask = NonNullable<GetWorkflowRunSubagent["currentAsk"]>;
type Wait = NonNullable<GetWorkflowRunSubagent["wait"]>;

/** ask 定位标签：地址 + 可选步号（actorSeq 从 0 计，显示步号从 1 起）。 */
function askLabel(ask: Ask): string {
  const step = ask.actorSeq === undefined ? "" : ` (step ${ask.actorSeq + 1})`;
  return `${escapeWorkflowRunText(ask.siteId)}@${ask.ordinal}${step}`; // 地址@序号（步号）
}

/** 相对年龄进时长段：去掉「ago」再接在「for」后面。 */
function elapsedSuffix(age: string | undefined): string {
  return age === undefined ? "" : ` for ${age.replace(/ ago$/u, "")}`;
}

function parkedLine(
  actor: GetWorkflowRunSubagent,
  clock: number,
  questionTimes: ReadonlyMap<string, number>,
): string {
  // 求值序契约（changing 序列逐读取映射）：先 age 的表查询（第 2 次 parkedOn），后 qid 的转义（第 3 次）。
  const age = formatRelativeAge(clock, questionTimes.get(actor.parkedOn!));
  const qid = escapeWorkflowRunText(actor.parkedOn!);
  return `on question ${qid}${elapsedSuffix(age)}`;
}

function waitLine(wait: Wait, clock: number): string {
  const elapsed = elapsedSuffix(formatRelativeAge(clock, wait.since));
  if (wait.cause === "slot") return `waiting for a slot${elapsed}`; // 等并发槽位
  const reason = wait.reason === undefined ? "" : ` after ${escapeWorkflowRunText(wait.reason)}`;
  const retry =
    wait.retryAfterMs === undefined
      ? ""
      : `, retry in ${formatWorkflowRunDuration(wait.retryAfterMs)}`;
  return `backoff${reason}${elapsed}${retry}`; // 退避（原因/时长/下次重试）
}

function askDetailLine(ask: Ask, clock: number): string {
  const details = [askLabel(ask)]; // 地址行头
  const age = formatRelativeAge(clock, ask.startedAt);
  if (age !== undefined) details.push(`${age.replace(/ ago$/u, "")} on this step`); // 本步时长
  if (ask.turn !== undefined) details.push(`turn ${ask.turn}`); // 回合数
  if (ask.toolCalls !== undefined) {
    details.push(`${ask.toolCalls} tool call${ask.toolCalls === 1 ? "" : "s"}`); // 工具调用数（单复数）
  }
  if (ask.lastTool !== undefined) {
    const target =
      ask.lastTool.target === undefined ? "" : ` ${escapeWorkflowRunText(ask.lastTool.target)}`;
    const toolAge = formatRelativeAge(clock, ask.lastTool.at);
    const suffix = toolAge === undefined ? "" : ` ${toolAge}`;
    details.push(`last ${escapeWorkflowRunText(ask.lastTool.name)}${target}${suffix}`); // 最近工具
  }
  return details.join(", ");
}

function stepsLine(actor: GetWorkflowRunSubagent): string {
  const failures = actor.stepsFailed > 0 ? `, ${actor.stepsFailed} failed` : "";
  return `${actor.stepsSettled} step${actor.stepsSettled === 1 ? "" : "s"}${failures}`; // 步数（单复数）
}

export function renderWorkflowRunActivity(
  actor: GetWorkflowRunSubagent,
  clock: number,
  questionTimes: ReadonlyMap<string, number>,
): string {
  // getter 读取序是冻结契约（frozen route/getter tape）：三个 state 判定在前，ask 取值在后。
  const parked = actor.state === "parked" && actor.parkedOn !== undefined;
  if (parked) return parkedLine(actor, clock, questionTimes);
  const waiting = actor.state === "waiting";
  if (waiting) {
    const wait = actor.wait; // 只取一次（读取序契约）
    return wait === undefined ? "" : waitLine(wait, clock);
  }
  const unfinished = actor.state === "unfinished" && actor.currentAsk !== undefined;
  if (unfinished) return `${askLabel(actor.currentAsk!)} was in flight at the stop`; // 停时在飞
  if (actor.currentAsk !== undefined) return askDetailLine(actor.currentAsk, clock); // 读取序契约：判定+取值各一次
  const quiet = actor.stepsSettled === 0 && actor.stepsFailed === 0;
  if (quiet) return ""; // 安静的子代理没有活动行
  return stepsLine(actor);
}
