// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// `@knorvia/core` 的运行环境探测转发层。
//
// 2026-10-23 移出：`getRuntimeInfo` 已提到 `@knorvia/shared`。
// 原因：它的消费者是 `@knorvia/cli` 的入口 `run.ts`，而 core 会随 kernel-switch 删除。
// `@knorvia/shared-types` 只放类型（`RuntimeInfo` 仍在那里），
// 而读取 `process` 与 `node:sea` 的实现放在 `@knorvia/shared`。
//
// **保留转发**：core 的导出面是对外契约，包外有引用；等 core 删除时它一并消失。
// 真实定义在 `@knorvia/shared`，所以这不是「纯再导出桩」。
export { getRuntimeInfo } from "@knorvia/shared";
export type { RuntimeInfo } from "@knorvia/shared-types";
