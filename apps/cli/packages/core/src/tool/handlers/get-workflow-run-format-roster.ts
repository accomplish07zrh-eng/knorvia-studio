// ============================================================
// GetWorkflowRun 模型面的**情势三块**：`<health>` / `<phases>` / `<subagents>`（+ `<log_tail>`）
// ============================================================
// 从 get-workflow-run-format.ts 拆出：
// 那里是「一个事实一个块」的骨架，这里是三张**表**——列、对齐和逐相位的措辞自成一块。
//
// 两条纪律：
//   1. 缺席即不写。没有时间戳就没有年龄，没有 `node-progress` 就没有 turn / tool calls，
//      绝不用 0 顶替「不知道」——`0 tool calls` 是一件事实，而缺席是另一件。
//   2. 列宽由本次这些行算出来（有上界），不是写死的魔法数：一份只有两个子代理的花名册
//      不该为了一个不存在的长名字空出二十列。

import type { GetWorkflowRunOutput, GetWorkflowRunPhase } from "@knorvia/contracts";
import {
  escapeWorkflowRunText,
  formatRelativeAge,
  formatWorkflowRunCount,
  formatWorkflowRunDuration,
} from "./workflow-run-introspection.js";
import { renderWorkflowRunActivity } from "./get-workflow-run-activity-program.js";

/** 列之间的间隔：两个空格。一个空格会让「名字 地址」读成一个词。 */
const COLUMN_GAP = "  ";
/** 对齐列的宽度上界。超过它的值原样写出并让这一行变长，而不是把整张表撑宽。 */
const MAX_COLUMN_WIDTH = 24;
/** 任务摘要行的缩进：它从属于上一行，不是新的一行事实。 */
const TASK_LINE_INDENT = "  ";

function padColumn(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

function columnWidth(values: readonly string[]): number {
  return Math.min(
    MAX_COLUMN_WIDTH,
    values.reduce((widest, value) => Math.max(widest, value.length), 0),
  );
}

/** 把若干段拼成一行：空段（= 不知道的事实）直接消失，不留下两个连着的间隔。 */
function joinCells(cells: readonly string[]): string {
  // 末尾 trim：最后一列的补白会变成行尾空格，而那是一行看不见的噪声（`ahead` 的行全是它）。
  return cells
    .filter((cell) => cell.length > 0)
    .join(COLUMN_GAP)
    .trimEnd();
}

// ————————————————————————————————————————————————
// <health>
// ————————————————————————————————————————————————

/**
 * run 整体还在不在动，一行 `key=value`。
 *
 * `stalled` 只对活着的 run 有意义（一个终态 run 当然不动了），而终态 run 多出一句
 * **leftover 说明**：下面那些标着 running 的行是进程死在它们下面的残留，不是活的工作。
 * 这是本工具仅有的两处「把不知道说出口」之一——沉默会被读成「它们还在跑」。
 */
export function formatWorkflowRunHealthBlock(run: GetWorkflowRunOutput, terminal: boolean): string {
  const now = run.generatedAt;
  const health = run.health;
  const cells: string[] = [];

  const lastProgress = formatRelativeAge(now, health.lastProgressAt);
  if (lastProgress !== undefined) cells.push(`last_progress=${lastProgress}`);

  if (health.concurrency !== undefined) {
    const { effective, cap, reason, since } = health.concurrency;
    const sinceAge = formatRelativeAge(now, since);
    const why = [
      reason === undefined ? "" : escapeWorkflowRunText(reason),
      sinceAge === undefined ? "" : `since ${sinceAge}`,
    ]
      .filter((part) => part.length > 0)
      .join(" ");
    cells.push(`concurrency=${effective}/${cap}${why.length === 0 ? "" : ` (${why})`}`);
  }

  if (!terminal) {
    const stalledAge = formatRelativeAge(now, health.stalledSince);
    cells.push(`stalled=${stalledAge === undefined ? "no" : `since ${stalledAge}`}`);
  }

  cells.push(`consecutive_failures=${health.consecutiveFailures}`);
  cells.push(`cached_steps=${health.cachedSteps}`);

  const leftover = terminal ? health.leftoverRunning : undefined;
  const note =
    leftover === undefined || leftover === 0
      ? ""
      : `\nThe ${leftover} "running" step${leftover === 1 ? "" : "s"} below ${
          leftover === 1 ? "is a leftover" : "are leftovers"
        } of the exited process, not live work.`;
  return `<health>${joinCells(cells)}${note}</health>`;
}

// ————————————————————————————————————————————————
// <phases>
// ————————————————————————————————————————————————

/** 阶段表：一行一个阶段，声明序。`ahead` 的行只有名字和状态——它还没发生过。 */
export function formatWorkflowRunPhasesBlock(
  run: GetWorkflowRunOutput,
  terminal: boolean,
): string | undefined {
  const phases = run.phases;
  if (phases === undefined || phases.length === 0) return undefined;

  const names = phases.map((phase) => escapeWorkflowRunText(phase.name));
  const nameWidth = phaseColumnWidth(names);
  const stateWidth = phaseColumnWidth(phases.map((phase) => phase.state));

  const lines = phases.map((phase: GetWorkflowRunPhase, index) => {
    const cells = [
      `${index + 1}. ${padColumn(names[index]!, nameWidth)}`,
      padColumn(phase.state, stateWidth),
    ];

    if (phase.rounds === 0) cells.push("");
    else cells.push(`${phase.rounds} round${phase.rounds === 1 ? "" : "s"}`);

    if (phase.nodesRunning > 0)
      cells.push(
        `${phase.nodesSettled} settled, ${phase.nodesRunning} ${terminal ? "unfinished" : "running"}`,
      );
    else if (phase.nodesSettled === 0) cells.push("");
    else cells.push(`${phase.nodesSettled} step${phase.nodesSettled === 1 ? "" : "s"} settled`);

    const now = run.generatedAt;
    if (phase.enteredAt === undefined) cells.push("");
    else if (phase.exitedAt !== undefined)
      cells.push(formatWorkflowRunDuration(phase.exitedAt - phase.enteredAt));
    else cells.push(terminal ? "" : `${formatWorkflowRunDuration(now - phase.enteredAt)} so far`);

    return joinCells(cells);
  });
  return `<phases>\n${lines.join("\n")}\n</phases>`;
}

function phaseColumnWidth(values: readonly string[]): number {
  const width = values.reduce((current, value) => {
    const candidate = Math.max(current, value.length);
    return candidate > MAX_COLUMN_WIDTH ? MAX_COLUMN_WIDTH : candidate;
  }, 0);
  return Math.min(MAX_COLUMN_WIDTH, width);
}

// ————————————————————————————————————————————————
// <subagents>
// ————————————————————————————————————————————————

/**
 * 花名册：一行一个子代理，外加一行缩进的 `task:`（有任务摘要时）。
 *
 * 一行的读法是「谁 · 在哪 · 什么相位 · 在哪个阶段 · 正在做什么 · 花了多少 token」，
 * 其中「正在做什么」按相位分叉——在跑的说它的 ask 和工具，在等的说等什么，停驻的说等哪个
 * 问题、等了多久。这正是这个工具存在的理由：模型要能一眼看出「谁卡住了」。
 */
export function formatWorkflowRunSubagentsBlock(run: GetWorkflowRunOutput): string {
  if (run.subagents.length === 0) return "<subagents>No subagents created yet.</subagents>";

  const askedAtByQid = new Map<string, number>();
  for (const question of run.pendingQuestions ?? [])
    askedAtByQid.set(question.qid, question.askedAt);

  const names = run.subagents.map((subagent) =>
    subagent.name === undefined ? "" : escapeWorkflowRunText(subagent.name),
  );
  const addresses = run.subagents.map(
    (subagent) => `${escapeWorkflowRunText(subagent.siteId)}@${subagent.ordinal}`,
  );
  const nameWidth = columnWidth(names);
  const addressWidth = columnWidth(addresses);
  const stateWidth = columnWidth(run.subagents.map((subagent) => subagent.state));

  const lines: string[] = [];
  run.subagents.forEach((subagent, index) => {
    lines.push(
      joinCells([
        // 匿名 actor 不合成兜底名（同 pendingQuestions）：留白，地址列仍对齐。
        padColumn(names[index]!, nameWidth),
        padColumn(addresses[index]!, addressWidth),
        padColumn(subagent.state, stateWidth),
        subagent.phaseName === undefined
          ? ""
          : `phase ${escapeWorkflowRunText(subagent.phaseName)}`,
        renderWorkflowRunActivity(subagent, run.generatedAt, askedAtByQid),
        subagent.tokens > 0 ? `${formatWorkflowRunCount(subagent.tokens)} tokens` : "",
      ]),
    );
    const head = subagent.currentAsk?.instructionsHead;
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

// ————————————————————————————————————————————————
// <log_tail>
// ————————————————————————————————————————————————

/** 叙事尾巴。事件带落库时刻时前缀年龄；老 journal 上没有这一列，那些行就只有序号。 */
export function formatWorkflowRunLogTailBlock(run: GetWorkflowRunOutput): string {
  if (run.logTail.length === 0) return "<log_tail>No log() narration recorded yet.</log_tail>";
  const lines = run.logTail.map((entry) => {
    const age = formatRelativeAge(run.generatedAt, entry.at);
    return joinCells([`[${entry.sequence}]`, age ?? "", escapeWorkflowRunText(entry.message)]);
  });
  return `<log_tail>\n${lines.join("\n")}\n</log_tail>`;
}
