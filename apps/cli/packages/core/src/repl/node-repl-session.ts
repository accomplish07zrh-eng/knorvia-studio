// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// `@knorvia/core/repl` 子路径的转发层。
//
// 背景（2026-10-23）：REPL 运行时的 10 个实现文件已提到独立包 `@knorvia/repl-core`
// （因为 core 与 node-repl-host 双方都依赖它，只搬任一侧都会产生重复副本或依赖倒置）。
//
// **为什么保留这个文件**：core 的 `./repl` 子路径导出是对外契约 ——
// `node-repl-host` 等包一直通过 `@knorvia/core/repl` 引用这些符号。
// 直接删掉子路径会让那些调用方立刻编译失败。所以这里只留一层转发，
// 把符号从新包重新导出，让 `@knorvia/core/repl` 的语义保持不变。
//
// **迁移方向**：调用方应逐步改为直接 `import from "@knorvia/repl-core"`；
// 等 core 整包随 kernel-switch 删除时，这个转发层也一并消失。
export { NodeReplSession } from "@knorvia/repl-core";
export type {
  NodeReplCuaAppIdentity,
  NodeReplImage,
  NodeReplRequestMeta,
  NodeReplRunResult,
  NodeReplSessionOptions,
  NodeReplStructuredResult,
  NodeReplWriteSink,
} from "@knorvia/repl-core";
