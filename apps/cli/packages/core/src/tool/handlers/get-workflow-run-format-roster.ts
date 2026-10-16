// SPDX-License-Identifier: Apache-2.0
// 模型面四块：健康行、阶段表、花名册、叙事尾巴。列宽就地量，空单元格丢掉，行尾补白剪掉。
// 导出签名上的文档注释是声明文件的一部分，措辞保持不动；实现注释只标读取序。

import type { GetWorkflowRunOutput, GetWorkflowRunPhase } from "@knorvia/contracts";
import {
  escapeWorkflowRunText,
  formatRelativeAge,
  formatWorkflowRunCount,
  formatWorkflowRunDuration,
} from "./workflow-run-introspection.js";
import { renderWorkflowRunActivity } from "./get-workflow-run-activity-program.js";

const COLUMN_SEPARATOR = "  ";
const COLUMN_CEILING = 24;
const TASK_PREFIX = "  ";
const EMPTY_CELL = "";

/**
 * Math.min 必须先于 reduce 里的 Math.max 被取到。冻结探针把 Math.min 的 getter 换成抛错，
 * 参数表达式不得先跑。
 */
function measureColumn(samples: readonly string[], ceiling: number): number {
  const clamp = Math.min;
  const widest = samples.reduce((soFar, sample) => {
    const stretched = Math.max(soFar, sample.length);
    if (stretched > ceiling) return ceiling;
    return stretched;
  }, 0);
  return clamp(ceiling, widest);
}

/** length 比较与减法各读一次。NaN 比较为假，仍会走进补白，不能收成一次读取。 */
function padCell(text: string, width: number): string {
  const fits = text.length >= width;
  if (fits) return text;
  const deficit = width - text.length;
  return text + " ".repeat(deficit);
}

function joinColumns(cells: readonly string[], gap: string): string {
  const visible: string[] = [];
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index] as string;
    if (cell.length > 0) visible.push(cell);
  }
  const joined = visible.join(gap);
  return joined.trimEnd();
}

function presentParts(parts: readonly string[]): string {
  const kept: string[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index] ?? EMPTY_CELL;
    if (part.length > 0) kept.push(part);
  }
  return kept.join(" ");
}

function concurrencyCell(run: GetWorkflowRunOutput): string {
  const concurrency = run.health.concurrency;
  if (concurrency === undefined) return EMPTY_CELL;
  const sinceAge = formatRelativeAge(run.generatedAt, concurrency.since);
  const reason =
    concurrency.reason === undefined ? EMPTY_CELL : escapeWorkflowRunText(concurrency.reason);
  const sincePart = sinceAge === undefined ? EMPTY_CELL : `since ${sinceAge}`;
  const why = presentParts([reason, sincePart]);
  const note = why.length === 0 ? EMPTY_CELL : ` (${why})`;
  return `concurrency=${concurrency.effective}/${concurrency.cap}${note}`;
}

function leftoverSentence(run: GetWorkflowRunOutput, terminal: boolean): string {
  const count = terminal ? run.health.leftoverRunning : undefined;
  if (count === undefined || count === 0) return EMPTY_CELL;
  const singular = count === 1;
  const noun = singular ? "step" : "steps";
  const verb = singular ? "is a leftover" : "are leftovers";
  return `\nThe ${count} "running" ${noun} below ${verb} of the exited process, not live work.`;
}

/**
 * run 整体还在不在动，一行 `key=value`。
 *
 * `stalled` 只对活着的 run 有意义（一个终态 run 当然不动了），而终态 run 多出一句
 * **leftover 说明**：下面那些标着 running 的行是进程死在它们下面的残留，不是活的工作。
 * 这是本工具仅有的两处「把不知道说出口」之一——沉默会被读成「它们还在跑」。
 */
// prettier-ignore
export function formatWorkflowRunHealthBlock(
  run: GetWorkflowRunOutput, terminal: boolean
): string {
  const clock = run.generatedAt;
  const pieces: string[] = [];
  const progressAge = formatRelativeAge(clock, run.health.lastProgressAt);
  if (progressAge !== undefined) pieces.push(`last_progress=${progressAge}`);
  const concurrency = concurrencyCell(run);
  if (concurrency.length > 0) pieces.push(concurrency);
  if (terminal === false) {
    const stalledAge = formatRelativeAge(clock, run.health.stalledSince);
    const stalledValue = stalledAge === undefined ? "no" : `since ${stalledAge}`;
    pieces.push(`stalled=${stalledValue}`);
  }
  pieces.push(`consecutive_failures=${run.health.consecutiveFailures}`);
  pieces.push(`cached_steps=${run.health.cachedSteps}`);
  const body = joinColumns(pieces, COLUMN_SEPARATOR);
  const note = leftoverSentence(run, terminal);
  return `<health>${body}${note}</health>`;
}

function phaseProgressCell(phase: GetWorkflowRunPhase, terminal: boolean): string {
  if (phase.nodesRunning > 0) {
    const label = terminal ? "unfinished" : "running";
    // 模板里先读 nodesSettled 再读 nodesRunning，和「比较时的那一次」分开。
    return `${phase.nodesSettled} settled, ${phase.nodesRunning} ${label}`;
  }
  if (phase.nodesSettled === 0) return EMPTY_CELL;
  const countText = `${phase.nodesSettled}`;
  const plural = phase.nodesSettled === 1 ? "" : "s";
  return countText + " step" + plural + " settled";
}

function phaseTimingCell(phase: GetWorkflowRunPhase, clock: number, terminal: boolean): string {
  // enteredAt 判定 → exitedAt 判定 → 相减时再读 exitedAt、enteredAt。终态且未退出不再读 enteredAt。
  if (phase.enteredAt === undefined) return EMPTY_CELL;
  if (phase.exitedAt !== undefined) {
    const elapsed = phase.exitedAt - phase.enteredAt;
    return formatWorkflowRunDuration(elapsed);
  }
  if (terminal) return EMPTY_CELL;
  const soFar = clock - phase.enteredAt;
  return `${formatWorkflowRunDuration(soFar)} so far`;
}

function renderPhaseLine(
  run: GetWorkflowRunOutput,
  phase: GetWorkflowRunPhase,
  index: number,
  labels: readonly string[],
  nameWidth: number,
  stateWidth: number,
  terminal: boolean,
): string {
  // 从左到右：名字（已转义）→ state → rounds（非 0 时再读两遍）→ 进度 → generatedAt 与时长。
  const title = `${index + 1}. ${padCell(labels[index]!, nameWidth)}`;
  const stateCell = padCell(phase.state, stateWidth);
  const roundCell =
    phase.rounds === 0 ? EMPTY_CELL : `${phase.rounds} round${phase.rounds === 1 ? "" : "s"}`;
  const progressCell = phaseProgressCell(phase, terminal);
  const timingCell = phaseTimingCell(phase, run.generatedAt, terminal);
  return joinColumns([title, stateCell, roundCell, progressCell, timingCell], COLUMN_SEPARATOR);
}

/** 阶段表：一行一个阶段，声明序。`ahead` 的行只有名字和状态——它还没发生过。 */
// prettier-ignore
export function formatWorkflowRunPhasesBlock(
  run: GetWorkflowRunOutput, terminal: boolean
): string | undefined {
  const phases = run.phases;
  if (phases === undefined || phases.length === 0) return undefined;
  const labels = phases.map((phase) => escapeWorkflowRunText(phase.name));
  const nameWidth = measureColumn(labels, COLUMN_CEILING);
  const stateLabels = phases.map((phase) => phase.state);
  const stateWidth = measureColumn(stateLabels, COLUMN_CEILING);
  const rows = phases.map((phase, index) =>
    renderPhaseLine(run, phase, index, labels, nameWidth, stateWidth, terminal),
  );
  return "<phases>\n" + rows.join("\n") + "\n</phases>";
}

type RosterActor = GetWorkflowRunOutput["subagents"][number];

interface RosterWidths {
  nameWidth: number;
  addressWidth: number;
  stateWidth: number;
}

function actorPhaseCell(actor: RosterActor): string {
  if (actor.phaseName === undefined) return EMPTY_CELL;
  return `phase ${escapeWorkflowRunText(actor.phaseName)}`;
}

function actorTokenCell(actor: RosterActor): string {
  if (!(actor.tokens > 0)) return EMPTY_CELL;
  return `${formatWorkflowRunCount(actor.tokens)} tokens`;
}

function rosterRow(
  run: GetWorkflowRunOutput,
  actor: RosterActor,
  name: string,
  address: string,
  widths: RosterWidths,
  askedAtByQid: ReadonlyMap<string, number>,
): string {
  // 活动行在 token 之前：generatedAt 在这一格读，currentAsk 的任务摘要要等整行结束再读。
  return joinColumns(
    [
      padCell(name, widths.nameWidth),
      padCell(address, widths.addressWidth),
      padCell(actor.state, widths.stateWidth),
      actorPhaseCell(actor),
      renderWorkflowRunActivity(actor, run.generatedAt, askedAtByQid),
      actorTokenCell(actor),
    ],
    COLUMN_SEPARATOR,
  );
}

function rememberQuestionTimes(run: GetWorkflowRunOutput): Map<string, number> {
  const askedAtByQid = new Map<string, number>();
  const questions = run.pendingQuestions ?? [];
  for (const question of questions) askedAtByQid.set(question.qid, question.askedAt);
  return askedAtByQid;
}

/**
 * 花名册：一行一个子代理，外加一行缩进的 `task:`（有任务摘要时）。
 *
 * 一行的读法是「谁 · 在哪 · 什么相位 · 在哪个阶段 · 正在做什么 · 花了多少 token」，
 * 其中「正在做什么」按相位分叉——在跑的说它的 ask 和工具，在等的说等什么，停驻的说等哪个
 * 问题、等了多久。这正是这个工具存在的理由：模型要能一眼看出「谁卡住了」。
 */
// prettier-ignore
export function formatWorkflowRunSubagentsBlock(run: GetWorkflowRunOutput): string {
  if (run.subagents.length === 0) {
    return "<subagents>" + "No subagents created yet." + "</subagents>";
  }
  const askedAtByQid = rememberQuestionTimes(run);
  const names = run.subagents.map((actor) =>
    actor.name === undefined ? EMPTY_CELL : escapeWorkflowRunText(actor.name),
  );
  const addresses = run.subagents.map(
    (actor) => `${escapeWorkflowRunText(actor.siteId)}@${actor.ordinal}`,
  );
  const nameWidth = measureColumn(names, COLUMN_CEILING);
  const addressWidth = measureColumn(addresses, COLUMN_CEILING);
  const stateLabels = run.subagents.map((actor) => actor.state);
  const stateWidth = measureColumn(stateLabels, COLUMN_CEILING);
  const widths: RosterWidths = { nameWidth, addressWidth, stateWidth };
  const lines: string[] = [];
  run.subagents.forEach((actor, index) => {
    lines.push(rosterRow(run, actor, names[index]!, addresses[index]!, widths, askedAtByQid));
    const head = actor.currentAsk?.instructionsHead;
    if (head !== undefined && head.length > 0) {
      lines.push(TASK_PREFIX + "task: " + escapeWorkflowRunText(head));
    }
  });
  const truncated =
    run.subagentsTruncated === true
      ? "\nOnly the first " + run.subagents.length + " subagents are listed; this run has more."
      : EMPTY_CELL;
  return "<subagents>\n" + lines.join("\n") + truncated + "\n</subagents>";
}

/** 叙事尾巴。事件带落库时刻时前缀年龄；老 journal 上没有这一列，那些行就只有序号。 */
// prettier-ignore
export function formatWorkflowRunLogTailBlock(run: GetWorkflowRunOutput): string {
  if (run.logTail.length === 0) {
    return "<log_tail>" + "No log() narration recorded yet." + "</log_tail>";
  }
  const lines = run.logTail.map((entry) => {
    const age = formatRelativeAge(run.generatedAt, entry.at);
    const stamp = `[${entry.sequence}]`;
    const message = escapeWorkflowRunText(entry.message);
    const ageCell = age ?? EMPTY_CELL;
    return joinColumns([stamp, ageCell, message], COLUMN_SEPARATOR);
  });
  return "<log_tail>\n" + lines.join("\n") + "\n</log_tail>";
}
