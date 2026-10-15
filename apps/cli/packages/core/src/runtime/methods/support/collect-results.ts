// SPDX-License-Identifier: Apache-2.0
// 执行结果收采：流中执行并发完成、完成顺序不保证，收采一律按下标（声明序）走；
// 每条等待最多 250ms，超时与失败都记「无结果」。计时器随 finally 清理。
import type { ModelToolCall } from "../../deps.js";
import type { StreamedToolExecutionResult } from "../../types.js";

/** 收采等待上限（逐字常量）。 */
export const STREAMED_TOOL_SETTLE_TIMEOUT_MS = 250;

/** 执行句柄表（调用 id → 结果 promise）。 */
export type ExecutionTable = Map<string, Promise<StreamedToolExecutionResult | undefined>>;

/** 失败吸收：执行抛错等价于「无结果」。 */
const absorbFailure = (
  operation: Promise<StreamedToolExecutionResult | undefined>,
): Promise<StreamedToolExecutionResult | undefined> => operation.catch(() => undefined);

/** 延时解析为 undefined 的计时 promise；计时器句柄经 register 回传清理。 */
const expireAfter = (
  milliseconds: number,
  register: (timer: ReturnType<typeof setTimeout>) => void,
): Promise<undefined> =>
  new Promise<undefined>((done) => {
    register(setTimeout(() => done(undefined), milliseconds));
  });

/** 给定 promise 加等待上限：超时回 undefined。 */
export async function raceWithTimeout<T>(
  operation: Promise<T>,
  milliseconds: number,
): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const expiry = expireAfter(milliseconds, (created) => {
      timer = created;
    });
    return await Promise.race([operation, expiry]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** 按声明序收采已完成的执行结果（失败/超时记无结果）。 */
export async function collectSettledExecutions(
  executions: ExecutionTable,
  toolCalls: readonly ModelToolCall[],
): Promise<StreamedToolExecutionResult[]> {
  // 每条声明独立探针：无执行的声明直接记无结果，不进入竞速。
  const probes = await Promise.all(
    toolCalls.map((toolCall) => {
      const pending = executions.get(toolCall.id);
      if (pending === undefined) return undefined;
      return raceWithTimeout(absorbFailure(pending), STREAMED_TOOL_SETTLE_TIMEOUT_MS);
    }),
  );
  // 过滤保持声明序：下标序即返回序（与完成顺序无关）。
  return probes.filter((probe): probe is StreamedToolExecutionResult => probe !== undefined);
}

/** 等全部执行结束（同样带上限），失败吸收为无结果。 */
export async function settleAllExecutions(executions: ExecutionTable): Promise<void> {
  // 整批竞速：任一执行悬挂都不拖过上限，计时器随 finally 清理。
  const batch = Promise.allSettled(executions.values());
  await raceWithTimeout(batch as Promise<unknown>, STREAMED_TOOL_SETTLE_TIMEOUT_MS);
}
