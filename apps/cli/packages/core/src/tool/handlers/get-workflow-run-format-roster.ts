// SPDX-License-Identifier: Apache-2.0
// 模型面三表一尾：健康行、阶段表、花名册表、叙事尾巴。表格由「单元格管线」拼成——
// 空单元格蒸发、补白不外露、列宽就地量体（上限 24）。文案逐字（金样把关）。

import type { GetWorkflowRunOutput, GetWorkflowRunPhase } from "@knorvia/contracts";
import {
  escapeWorkflowRunText,
  formatRelativeAge,
  formatWorkflowRunCount,
  formatWorkflowRunDuration,
} from "./workflow-run-introspection.js";
import { renderWorkflowRunActivity } from "./get-workflow-run-activity-program.js";

const COLUMN_GAP = "  "; // 列间空隙
const MAX_COLUMN_WIDTH = 24; // 列宽上限
const TASK_LINE_INDENT = "  "; // task 行缩进

/** 单元格管线：去空段 → 双空格接 → 剪行尾补白。 */
function rowOf(cells: readonly string[]): string {
  return cells
    .filter((cell) => cell.length > 0)
    .join(COLUMN_GAP)
    .trimEnd();
}

function padTo(value: string, width: number): string {
  const missing = width - value.length;
  return missing <= 0 ? value : value + " ".repeat(missing);
}

/** 列宽就地量体：本批行里最长者为准，但不越过 24。 */
function fitWidth(values: readonly string[]): number {
  return Math.min(
    MAX_COLUMN_WIDTH,
    values.reduce((current, value) => {
      const candidate = Math.max(current, value.length);
      return candidate > MAX_COLUMN_WIDTH ? MAX_COLUMN_WIDTH : candidate;
    }, 0),
  );
}

// —— 健康行 ——

function healthConcurrencyCell(run: GetWorkflowRunOutput): string {
  const concurrency = run.health.concurrency;
  if (concurrency === undefined) return "";
  const sinceAge = formatRelativeAge(run.generatedAt, concurrency.since);
  const reason = concurrency.reason === undefined ? "" : escapeWorkflowRunText(concurrency.reason);
  const sincePart = sinceAge === undefined ? "" : `since ${sinceAge}`;
  const why = [reason, sincePart].filter((part) => part.length > 0).join(" ");
  const note = why.length === 0 ? "" : ` (${why})`;
  return `concurrency=${concurrency.effective}/${concurrency.cap}${note}`;
}

function healthLeftoverNote(run: GetWorkflowRunOutput, terminal: boolean): string {
  const leftover = terminal ? run.health.leftoverRunning : undefined;
  if (leftover === undefined || leftover === 0) return "";
  const plural = leftover === 1;
  return `\nThe ${leftover} "running" step${plural ? "" : "s"} below ${
    plural ? "is a leftover" : "are leftovers"
  } of the exited process, not live work.`; // 残留说明（单复数两形）
}

/**
 * run 整体还在不在动，一行 `key=value`。
 *
 * `stalled` 只对活着的 run 有意义（一个终态 run 当然不动了），而终态 run 多出一句
 * **leftover 说明**：下面那些标着 running 的行是进程死在它们下面的残留，不是活的工作。
 * 这是本工具仅有的两处「把不知道说出口」之一——沉默会被读成「它们还在跑」。
 */
export function formatWorkflowRunHealthBlock(
  run: GetWorkflowRunOutput,
  terminal: boolean,
): string {
  const clock = run.generatedAt;
  const cells: string[] = [];
  const lastProgress = formatRelativeAge(clock, run.health.lastProgressAt);
  if (lastProgress !== undefined) cells.push(`last_progress=${lastProgress}`); // 有时刻才有年龄
  const concurrency = healthConcurrencyCell(run);
  if (concurrency.length > 0) cells.push(concurrency);
  if (!terminal) {
    const stalledAge = formatRelativeAge(clock, run.health.stalledSince);
    cells.push(`stalled=${stalledAge === undefined ? "no" : `since ${stalledAge}`}`); // 终态不谈停滞
  }
  cells.push(`consecutive_failures=${run.health.consecutiveFailures}`);
  cells.push(`cached_steps=${run.health.cachedSteps}`);
  return `<health>${rowOf(cells)}${healthLeftoverNote(run, terminal)}</health>`;
}

// —— 阶段表 ——

function phaseProgressCell(phase: GetWorkflowRunPhase, terminal: boolean): string {
  const inflight = phase.nodesRunning > 0;
  if (inflight) {
    const label = terminal ? "unfinished" : "running";
    return `${phase.nodesSettled} settled, ${phase.nodesRunning} ${label}`;
  }
  const untouched = phase.nodesSettled === 0;
  if (untouched) return ""; // 还没动过的阶段不写进度段
  return `${phase.nodesSettled} step${phase.nodesSettled === 1 ? "" : "s"} settled`; // 结算步数（单复数）
}

function phaseTimingCell(phase: GetWorkflowRunPhase, clock: number, terminal: boolean): string {
  if (phase.enteredAt === undefined) return ""; // 没进过就没有时长段
  const departed = phase.exitedAt;
  if (departed !== undefined) return formatWorkflowRunDuration(departed - phase.enteredAt);
  return terminal ? "" : `${formatWorkflowRunDuration(clock - phase.enteredAt)} so far`;
}

function phaseRow(
  phase: GetWorkflowRunPhase,
  index: number,
  names: readonly string[],
  widths: { nameWidth: number; stateWidth: number },
  clock: number,
  terminal: boolean,
): string {
  const rounds = phase.rounds === 0 ? "" : `${phase.rounds} round${phase.rounds === 1 ? "" : "s"}`;
  return rowOf([
    `${index + 1}. ${padTo(names[index]!, widths.nameWidth)}`,
    padTo(phase.state, widths.stateWidth),
    rounds,
    phaseProgressCell(phase, terminal),
    phaseTimingCell(phase, clock, terminal),
  ]);
}

/** 阶段表：一行一个阶段，声明序。`ahead` 的行只有名字和状态——它还没发生过。 */
export function formatWorkflowRunPhasesBlock(
  run: GetWorkflowRunOutput,
  terminal: boolean,
): string | undefined {
  const phases = run.phases;
  const empty = phases === undefined || phases.length === 0;
  if (empty) return undefined; // 没有阶段就没有这张表
  const names = phases!.map((phase) => escapeWorkflowRunText(phase.name));
  const widths = {
    nameWidth: fitWidth(names),
    stateWidth: fitWidth(phases!.map((phase) => phase.state)),
  };
  const lines = phases!.map((phase, index) =>
    phaseRow(phase, index, names, widths, run.generatedAt, terminal),
  );
  return `<phases>\n${lines.join("\n")}\n</phases>`; // 表容器
}

// —— 花名册表 ——

interface RosterWidths {
  nameWidth: number;
  addressWidth: number;
  stateWidth: number;
}

/**
 * 一行子代理。**getter 访问序是冻结契约**（activity/phase 档 frozen route/getter 断言逐次记录）：
 * 数组字面量从左到右求值 = 名 → 地址 → 状态 → 阶段 → 活动（读 generatedAt）→ tokens。
 */
function rosterRow(
  run: GetWorkflowRunOutput,
  actor: GetWorkflowRunOutput["subagents"][number],
  name: string,
  address: string,
  widths: RosterWidths,
  askedAtByQid: ReadonlyMap<string, number>,
): string {
  return rowOf([
    padTo(name, widths.nameWidth), // 名列
    padTo(address, widths.addressWidth), // 地址列
    padTo(actor.state, widths.stateWidth), // 状态列（第 3 位读取）
    actor.phaseName === undefined ? "" : `phase ${escapeWorkflowRunText(actor.phaseName)}`, // 阶段列
    renderWorkflowRunActivity(actor, run.generatedAt, askedAtByQid), // 活动列（读 generatedAt）
    actor.tokens > 0 ? `${formatWorkflowRunCount(actor.tokens)} tokens` : "", // token 列
  ]);
}

/**
 * 花名册：一行一个子代理，外加一行缩进的 `task:`（有任务摘要时）。
 *
 * 一行的读法是「谁 · 在哪 · 什么相位 · 在哪个阶段 · 正在做什么 · 花了多少 token」，
 * 其中「正在做什么」按相位分叉——在跑的说它的 ask 和工具，在等的说等什么，停驻的说等哪个
 * 问题、等了多久。这正是这个工具存在的理由：模型要能一眼看出「谁卡住了」。
 */
export function formatWorkflowRunSubagentsBlock(run: GetWorkflowRunOutput): string {
  const nobody = run.subagents.length === 0;
  if (nobody) return "<subagents>No subagents created yet.</subagents>"; // 空册也要说一句话
  const askedAtByQid = new Map<string, number>();
  for (const question of run.pendingQuestions ?? [])
    askedAtByQid.set(question.qid, question.askedAt);

  const names = run.subagents.map((actor) =>
    actor.name === undefined ? "" : escapeWorkflowRunText(actor.name),
  );
  const addresses = run.subagents.map(
    (actor) => `${escapeWorkflowRunText(actor.siteId)}@${actor.ordinal}`, // 地址列
  );
  const widths: RosterWidths = {
    nameWidth: fitWidth(names),
    addressWidth: fitWidth(addresses),
    stateWidth: fitWidth(run.subagents.map((actor) => actor.state)),
  };

  const lines: string[] = [];
  run.subagents.forEach((actor, index) => {
    lines.push(rosterRow(run, actor, names[index]!, addresses[index]!, widths, askedAtByQid));
    const head = actor.currentAsk?.instructionsHead;
    if (head !== undefined && head.length > 0) {
      lines.push(`${TASK_LINE_INDENT}task: ${escapeWorkflowRunText(head)}`);
    }
  });
  const truncated =
    run.subagentsTruncated === true
      ? `\nOnly the first ${run.subagents.length} subagents are listed; this run has more.`
      : "";
  return `<subagents>\n${lines.join("\n")}${truncated}\n</subagents>`;
}

// —— 叙事尾巴 ——

/** 叙事尾巴。事件带落库时刻时前缀年龄；老 journal 上没有这一列，那些行就只有序号。 */
export function formatWorkflowRunLogTailBlock(run: GetWorkflowRunOutput): string {
  if (run.logTail.length === 0) return "<log_tail>No log() narration recorded yet.</log_tail>";
  const lines = run.logTail.map((entry) => {
    const age = formatRelativeAge(run.generatedAt, entry.at);
    return rowOf([`[${entry.sequence}]`, age ?? "", escapeWorkflowRunText(entry.message)]);
  });
  return `<log_tail>\n${lines.join("\n")}\n</log_tail>`;
}
