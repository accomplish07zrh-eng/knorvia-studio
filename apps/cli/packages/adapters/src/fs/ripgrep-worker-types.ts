// SPDX-License-Identifier: Apache-2.0
// ripgrep worker 的形状声明：worker 句柄、注入数据、工厂与消息协议。
//
// 使用方式：
// - 主线程只依赖 RipgrepWorker（once/terminate），因此测试可以注入最小假对象；
// - RipgrepWorkerData 同时作为 worker_threads 的 workerData 与 WASI 的 preopens 来源；
// - WorkerMessage / WorkerOutcome 是主线程与 worker 之间的私有协议，不对外导出语义；
// - 本文件只放形状，不放实现，便于在执行单元与测试之间共享类型而不引入副作用。
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
