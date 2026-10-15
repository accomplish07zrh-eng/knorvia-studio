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

export function formatWorkflowRunHealthBlock(
  snapshot: GetWorkflowRunOutput,
  terminal: boolean,
): string {
  const clock = snapshot.generatedAt;
  const cells: string[] = [];
  const lastProgress = formatRelativeAge(clock, snapshot.health.lastProgressAt);
  if (lastProgress !== undefined) cells.push(`last_progress=${lastProgress}`); // 有时刻才有年龄
  const concurrency = healthConcurrencyCell(snapshot);
  if (concurrency.length > 0) cells.push(concurrency);
  if (!terminal) {
    const stalledAge = formatRelativeAge(clock, snapshot.health.stalledSince);
    cells.push(`stalled=${stalledAge === undefined ? "no" : `since ${stalledAge}`}`); // 终态不谈停滞
  }
  cells.push(`consecutive_failures=${snapshot.health.consecutiveFailures}`);
  cells.push(`cached_steps=${snapshot.health.cachedSteps}`);
  return `<health>${rowOf(cells)}${healthLeftoverNote(snapshot, terminal)}</health>`;
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

export function formatWorkflowRunPhasesBlock(
  snapshot: GetWorkflowRunOutput,
  terminal: boolean,
): string | undefined {
  const phases = snapshot.phases;
  const empty = phases === undefined || phases.length === 0;
  if (empty) return undefined; // 没有阶段就没有这张表
  const names = phases!.map((phase) => escapeWorkflowRunText(phase.name));
  const widths = {
    nameWidth: fitWidth(names),
    stateWidth: fitWidth(phases!.map((phase) => phase.state)),
  };
  const lines = phases!.map((phase, index) =>
    phaseRow(phase, index, names, widths, snapshot.generatedAt, terminal),
  );
  return `<phases>\n${lines.join("\n")}\n</phases>`; // 表容器
}

// —— 花名册表 ——

interface RosterWidths {
  nameWidth: number;
  addressWidth: number;
  stateWidth: number;
}

function rosterRow(
  run: GetWorkflowRunOutput,
  index: number,
  widths: RosterWidths,
  askedAtByQid: ReadonlyMap<string, number>,
): string {
  const actor = run.subagents[index]!;
  const name = actor.name === undefined ? "" : escapeWorkflowRunText(actor.name);
  const address = `${escapeWorkflowRunText(actor.siteId)}@${actor.ordinal}`;
  const phase =
    actor.phaseName === undefined ? "" : `phase ${escapeWorkflowRunText(actor.phaseName)}`;
  const tokens = actor.tokens > 0 ? `${formatWorkflowRunCount(actor.tokens)} tokens` : "";
  return rowOf([
    padTo(name, widths.nameWidth),
    padTo(address, widths.addressWidth),
    padTo(actor.state, widths.stateWidth),
    phase,
    renderWorkflowRunActivity(actor, run.generatedAt, askedAtByQid),
    tokens,
  ]);
}

export function formatWorkflowRunSubagentsBlock(snapshot: GetWorkflowRunOutput): string {
  const nobody = snapshot.subagents.length === 0;
  if (nobody) return "<subagents>No subagents created yet.</subagents>"; // 空册也要说一句话
  const askedAtByQid = new Map<string, number>();
  for (const question of snapshot.pendingQuestions ?? [])
    askedAtByQid.set(question.qid, question.askedAt);

  const names = snapshot.subagents.map((actor) =>
    actor.name === undefined ? "" : escapeWorkflowRunText(actor.name),
  );
  const addresses = snapshot.subagents.map(
    (actor) => `${escapeWorkflowRunText(actor.siteId)}@${actor.ordinal}`, // 地址列
  );
  const widths: RosterWidths = {
    nameWidth: fitWidth(names),
    addressWidth: fitWidth(addresses),
    stateWidth: fitWidth(snapshot.subagents.map((actor) => actor.state)),
  };

  const lines: string[] = [];
  snapshot.subagents.forEach((actor, index) => {
    lines.push(rosterRow(snapshot, index, widths, askedAtByQid));
    const head = actor.currentAsk?.instructionsHead;
    if (head !== undefined && head.length > 0) {
      lines.push(`${TASK_LINE_INDENT}task: ${escapeWorkflowRunText(head)}`);
    }
  });
  const truncated =
    snapshot.subagentsTruncated === true
      ? `\nOnly the first ${snapshot.subagents.length} subagents are listed; this run has more.`
      : "";
  return `<subagents>\n${lines.join("\n")}${truncated}\n</subagents>`;
}

// —— 叙事尾巴 ——

export function formatWorkflowRunLogTailBlock(run: GetWorkflowRunOutput): string {
  if (run.logTail.length === 0) return "<log_tail>No log() narration recorded yet.</log_tail>";
  const lines = run.logTail.map((entry) => {
    const age = formatRelativeAge(run.generatedAt, entry.at);
    return rowOf([`[${entry.sequence}]`, age ?? "", escapeWorkflowRunText(entry.message)]);
  });
  return `<log_tail>\n${lines.join("\n")}\n</log_tail>`;
}
