// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// `@knorvia/core` 的输出工具转发层。
//
// 2026-10-23 移出：`formatJson` / `supportsColor` / `color` 已提到 `@knorvia/shared`。
// 原因：它们的消费者全部是 `@knorvia/cli`，而 core 会随 kernel-switch 删除 ——
// 留在这里会让 cli 在那时编译失败。而 `@knorvia/shared-types` 是纯类型包
// （零运行期值），放不下这些函数，所以选 `@knorvia/shared`。
//
// **为什么保留这个文件**：core 的 `@knorvia/core` 导出面是对外契约，
// 包外有引用。保留一层转发让调用方无需改动；等 core 整包删除时它一并消失。
// 这与「纯再导出桩」不同：真实定义存在于 `@knorvia/shared`，这里只是迁移期的兼容入口。
export { color, formatJson, supportsColor } from "@knorvia/shared";
export type { JsonValue } from "@knorvia/shared";
