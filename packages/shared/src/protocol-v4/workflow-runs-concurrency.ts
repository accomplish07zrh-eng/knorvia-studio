// 本组按冻结事件合同重新设计投影；源码已暴露，Apache-2.0/NOTICE 保留，来源资格待审。
// ============================================================
// workflowRuns 归约里的自适应并发部分
// ============================================================
// 从 workflow-runs-reducer.ts 拆出（max-lines 门）：主归约只剩 switch 的分派，
// `concurrency-changed` 的规则住在这里。与主归约同一条纪律：纯函数、无时钟——事件上的
// `cooldownMs` 是相对量，deadline 由 UI 按收到状态的时刻推算。

import {
  WORKFLOW_RUNS_LIMITS,
  type WorkflowRunConcurrency,
  type WorkflowRunState,
} from "./workflow-runs.js";

/** 事件里的 `reason` 值：桶空闲重置回天花板——它不是冷却，收到即清掉旧的 cooldown。 */
const CONCURRENCY_IDLE_RESET_REASON = "idle_reset";

/**
 * `concurrency-changed` → `run.concurrency`。
 *
 * ceiling 由本 run 见过的最大 `previous` / `next` 推导（事件不带它；桶从天花板起步，所以首条
 * 事件的 `previous` 就是天花板，只降不升的序列里它也恒是最大值）。`cooldownMs` 只在带
 * Retry-After 的限流上在场；`idle_reset` 清掉它。`next` 读不动（缺席 / 非正整数）时整条只抬水位：
 * 没有 cap 就没有可显示的东西。
 *
 * `limit` 照搬：它是本 run 自己的界（`run-started` 带来的），与共享桶的涨落无关——治理器压低
 * 或放开一个 provider key，不会改变用户给这次 run 定的上限。
 */
export function reduceConcurrencyChanged(
  run: WorkflowRunState,
  payload: Record<string, unknown>,
): WorkflowRunState {
  const cap = integerAtLeast(payload.next, 1);
  if (cap === undefined) return run;
  const previous = integerAtLeast(payload.previous, 1) ?? cap;
  const ceiling = Math.max(run.concurrency?.ceiling ?? 0, previous, cap);
  const key = nonEmptyString(payload.key);
  const limit = run.concurrency?.limit;
  const cooldown =
    payload.reason === CONCURRENCY_IDLE_RESET_REASON
      ? undefined
      : integerAtLeast(payload.cooldownMs, 0);
  // 按线上字段顺序投影新桶读数；旧 key/cooldown 缺席即不携带。
  const projection = {} as WorkflowRunConcurrency;
  if (key !== undefined && key.length <= WORKFLOW_RUNS_LIMITS.maxConcurrencyKeyLength)
    projection.key = key;
  projection.cap = cap;
  projection.ceiling = ceiling;
  if (limit !== undefined) projection.limit = limit;
  if (cooldown !== undefined) projection.cooldownMs = cooldown;
  return { ...run, concurrency: projection };
}

/**
 * `run-started` → `run.concurrency.limit`：本 run **自己的**那条界。载荷带引擎的
 * `caps.maxConcurrency` 与 CLI 在铸载荷那一刻算出的 `concurrencyCeiling`（天花板是进程事实，
 * 不是引擎事实，所以它由 CLI 拼进载荷，与 `resumedFrom` 同一先例）。
 *
 * 只在 `maxConcurrency < ceiling` 时记：跑在天花板上的 run 与从前逐字节相同，一个键都不多。
 * 老 CLI 不发 `concurrencyCeiling`，读不出天花板就无从判断这个 run 是否被压低——什么都不改。
 *
 * 共享桶那一侧（`cap` / `key` / `cooldownMs`）原样留着：resume 会为同一个 runId 再发一条
 * `run-started`，而那时进程里很可能已经学到了一个被限流压低的 cap，用天花板把它盖掉就是把
 * 读数抬回一个假值。同理 `ceiling` 只升不降——与 `reduceConcurrencyChanged` 同一条水位规则。
 */
export function reduceRunStartedConcurrency(
  run: WorkflowRunState,
  payload: Record<string, unknown>,
): WorkflowRunState {
  const requested = integerAtLeast(plainRecord(payload.caps)?.maxConcurrency, 1);
  const readCeiling = integerAtLeast(payload.concurrencyCeiling, 1);
  const ceiling =
    readCeiling !== undefined && readCeiling <= WORKFLOW_RUNS_LIMITS.maxConcurrencyCeiling
      ? readCeiling
      : undefined;
  // 先规划配置与桶观察的两个独立变更，最后只复制一次 run。
  const changes: Partial<WorkflowRunState> = {};
  if (ceiling !== undefined && run.concurrencyCeiling !== ceiling)
    changes.concurrencyCeiling = ceiling;
  if (requested !== undefined && ceiling !== undefined && requested < ceiling) {
    const observation = run.concurrency;
    changes.concurrency = {
      ...(observation ?? { cap: ceiling }),
      ceiling: Math.max(observation?.ceiling ?? 0, ceiling),
      limit: requested,
    };
  }
  return Object.keys(changes).length ? { ...run, ...changes } : run;
}

/**
 * 摘掉 `concurrency.cooldownMs`（run 终态：不再派发任何东西，冷却没有对象）。没有可摘的就
 * 原样返回——幂等重放的支点，与主归约的 withoutPendingQuestions 同理。cap / ceiling 照留：
 * 它们是这次 run 跑在什么并发下的历史事实。
 */
export function withoutCooldown(run: WorkflowRunState): WorkflowRunState {
  if (run.concurrency?.cooldownMs === undefined) return run;
  const concurrency = { ...run.concurrency };
  delete concurrency.cooldownMs;
  return { ...run, concurrency };
}

function integerAtLeast(value: unknown, minimum: number): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum
    ? value
    : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function plainRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
