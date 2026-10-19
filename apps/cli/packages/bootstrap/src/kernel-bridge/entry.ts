// SPDX-License-Identifier: Apache-2.0
// 桥入口（段 A）：NDJSON 读写循环，把 request 路由到 BridgeEngine，把 response / notification 写回 stdout。
// 骨架由工程小弟给定，段 A 只填实现，不改签名。仅由 kernel/process.ts 在 dsh 引擎下动态 import。

import type { Context } from "@deepseek-ai/cordis";
import type { KernelLogger } from "../kernel/logger.js";

export interface RunBridgeOptions {
  readonly context: Context;
  readonly input: NodeJS.ReadableStream;
  readonly output: NodeJS.WritableStream;
  readonly logger?: KernelLogger;
}

/** 读到 input 结束为止；返回时所有在途命令已收口。 */
export async function runBridge(options: RunBridgeOptions): Promise<void> {
  void options;
  throw new Error("TODO(A): NDJSON loop + method routing (interface.md §二–§五)");
}
