// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 执行层的公开面：`NodeReplExecutor` 契约 + 工作线程入口 + 进程内实现。
//
// 原 `execution-contract.ts`（14 行纯声明）已并入本文件：它的全部内容就是
// 下面这段接口/类型/常量，没有自己的实现，独立成文件只会让「换一种方式执行」
// 这件事在读代码时被切到两个文件里。三个使用方（`worker-call`、`execution-cell`、
// 本文件的 `createInProcessNodeReplExecutor`）都在同目录，属于同一模块族。
import type { NodeReplRequestMeta, NodeReplRunResult } from "@knorvia/core/repl";
import type { NodeReplCuaBrokerConnection } from "./cua-bridge.js";
import { executeCell } from "./execution-cell.js";
export { executeInWorker } from "./worker-call.js";

/** 执行单元的消息通道标识：跨进程/跨线程识别本包工作线程用。 */
export const WORKER_KIND = "knorvia-execution-cell-v1";

/**
 * 一次执行的输入。
 *
 * `signal` 与 `syncTimeoutMs` 并存是刻意的：前者是**外部取消**（用户中止、
 * 运行时关闭），后者是**同步段的时间预算**（工作线程内阻塞式等待的上限）。
 * 两者语义不同，不能互相替代。
 */
export interface NodeReplExecuteInput {
  code: string;
  requestMeta: NodeReplRequestMeta;
  signal: AbortSignal;
  syncTimeoutMs: number;
  cuaBroker?: NodeReplCuaBrokerConnection;
}

/** 执行器：给定输入，产出运行结果。实现可以是工作线程，也可以是进程内直调。 */
export type NodeReplExecutor = (input: NodeReplExecuteInput) => Promise<NodeReplRunResult>;

/**
 * 造一个进程内执行器（不开工作线程）。
 *
 * 与 `executeInWorker` 的区别只在**隔离级别**：进程内实现共享宿主的事件循环与
 * 全局状态，因此只适合受控场景（测试、或明确不需要隔离的调用方）。
 *
 * @returns 直接委托给 `executeCell` 的执行器。
 */
export function createInProcessNodeReplExecutor(): NodeReplExecutor {
  return (input) => executeCell(input);
}
