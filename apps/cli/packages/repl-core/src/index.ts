// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// `@knorvia/repl-core` 的公开出口。
//
// 背景（2026-10-23，kernel-switch 前置的符号移出）：
// 这批文件原先在 `core/src/repl/`，而 `core` 自身（turn 执行、REPL 工具）与
// `node-repl-host`（REPL 宿主）**双方都依赖它**。若只把它搬进任一侧，
// 就会产生「两份重复副本」或「core → 宿主 的依赖倒置」。
// 所以按 #302 把 browser-client 提成独立包的同一种做法，提成本包：
// 两侧平级依赖它，各自不再持有副本。
//
// **本包只承载「REPL 会话运行时」这一件事**：
//   · 会话对象与 VM 准入（`NodeReplSession`）
//   · 单元格编译与执行（cell-compiler / cell-executor / executors）
//   · 运行输出整形（run-output / runtime-values）
//   · 会话契约类型（session-contract）
//   · 浏览器轮次状态（browser-turn-state）
//
// **它不依赖 `@knorvia/core`**（只依赖 `@knorvia/contracts` 与 Node 内置模块），
// 所以可以被 core 与宿主同时安全引用。

export { NodeReplSession } from "./session-runtime.js";
export type {
  NodeReplCuaAppIdentity,
  NodeReplImage,
  NodeReplRequestMeta,
  NodeReplRunResult,
  NodeReplSessionOptions,
  NodeReplStructuredResult,
  NodeReplWriteSink,
} from "./session-contract.js";

export { VmCellExecutor, VmCellExecutor as IifeContextExecutor } from "./cell-executor.js";
export type { ReplExecutor } from "./cell-executor.js";

export {
  recordBrowserTurnToolResult,
  clearBrowserTurnState,
  consumeBrowserTurnState,
} from "./browser-turn-state.js";
