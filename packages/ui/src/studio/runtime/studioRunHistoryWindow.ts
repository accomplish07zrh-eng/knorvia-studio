import type { StudioRun } from "@knorvia/services";

/**
 * 详情面板（成组/工作流）首屏渲染的运行条数上限。
 *
 * 原因：非紧凑模式此前渲染全部运行，每条运行都会挂载自己的 `<details>` 与
 * `run.checkpoint.steps` 的每一步；服务端 `studioRunHistory` 最多给 100 条，
 * 实测（见 docs/perf-baseline.md 的 T10 小节）100 条 × 8 步会一次挂载
 * 800 个步骤行、约 3.6k 个 DOM 节点，首屏与每次刷新都要付这份代价。
 * 这里改成固定窗口 + 显式“显示更早运行”，历史条数、顺序和可操作性都不变。
 */
export const STUDIO_RUN_HISTORY_WINDOW = 20;

/** 时间线底部内嵌视图的条数；保持既有行为（只看最近 3 条，不提供分页）。 */
export const STUDIO_RUN_HISTORY_COMPACT_WINDOW = 3;

/** 仍在排队/运行/等待的运行必须始终可见，否则用户会失去停止入口。 */
export const STUDIO_RUN_HISTORY_ACTIVE_STATES: ReadonlyArray<StudioRun["state"]> = [
  "queued",
  "running",
  "waiting",
];

export interface StudioRunHistoryWindowInput {
  /** 服务端投影的完整运行历史（时间倒序，最新在前）。 */
  runs: readonly StudioRun[];
  /** 首次渲染的条数。 */
  initial: number;
  /** 用户已展开的条数（每页 `initial` 条累加）。 */
  extra?: number;
  /**
   * 无论窗口如何都必须渲染的运行 id：正在复核的运行（复核弹窗读取它的步骤结论）
   * 与仍可操作的活动运行。
   */
  pinned?: readonly (string | undefined)[];
}

export interface StudioRunHistoryWindowResult {
  /** 时间倒序的连续前缀；顺序与入参一致。 */
  visible: StudioRun[];
  /** 仍在历史中、可继续展开的条数。 */
  hiddenCount: number;
  /** 下一次“显示更早运行”会再展开的条数。 */
  nextPageCount: number;
}

function positiveInteger(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * 纯窗口计算：只做前缀切片，不排序、不去重、不丢条数。
 * 被固定的运行若落在窗口之外，就把边界推到它，保证列表始终是连续前缀，
 * 从而不会出现“跳号”或顺序变化。
 */
export function studioRunHistoryWindow(
  input: StudioRunHistoryWindowInput,
): StudioRunHistoryWindowResult {
  const { runs } = input;
  const initial = positiveInteger(input.initial);
  let limit = Math.min(runs.length, initial + positiveInteger(input.extra));
  for (const id of input.pinned ?? []) {
    if (!id) continue;
    const index = runs.findIndex((run) => run.id === id);
    if (index >= limit) limit = index + 1;
  }
  const hiddenCount = runs.length - limit;
  return {
    visible: runs.slice(0, limit),
    hiddenCount,
    nextPageCount: Math.min(Math.max(1, initial), hiddenCount),
  };
}
