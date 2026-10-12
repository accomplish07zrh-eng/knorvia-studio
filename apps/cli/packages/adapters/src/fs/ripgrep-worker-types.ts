// SPDX-License-Identifier: Apache-2.0
// ripgrep worker 的形状声明：worker 句柄、注入数据、工厂与消息协议。
import type { Worker } from "node:worker_threads";
import type { RipgrepBufferedResult } from "ripgrep";

/** 只用到 worker 的两个方法：一次性监听与终止。 */
export type RipgrepWorker = Pick<Worker, "once" | "terminate">;

export interface RipgrepWorkerData {
  args: string[];
  preopens: Record<string, string>;
}

export type RipgrepWorkerFactory = (workerData: RipgrepWorkerData) => RipgrepWorker;

/** worker 侧回传的消息：result 与 error 互斥，未知 type 视为协议错误。 */
export interface WorkerMessage {
  error?: { code?: unknown; message?: string; name?: string; stack?: string };
  result?: RipgrepBufferedResult;
  type?: string;
}

/** 单次结算的载荷：成功带 value，失败带 problem（二者必有其一）。 */
export interface WorkerOutcome {
  problem: unknown;
  value: RipgrepBufferedResult | undefined;
}
