// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// `@knorvia/permission-core` 的公开出口。
//
// 背景（2026-10-23，kernel-switch 前置的符号移出）：
// 这批定义原先在 `core/src/permission/prepared-request.ts`，而消费者跨越
// `core`（权限 broker 与运行时）、`bootstrap`（协议交互）、`cli`（无头与 TUI 权限）
// 与 `tui`（权限交互界面）四个包。core 会随 kernel-switch 删除，
// 所以必须提到一个双方都能稳定依赖的位置。
//
// **为什么不放 `@knorvia/shared`**：`contracts` 已经依赖 `shared`，
// 而本模块依赖 `contracts` 的类型 —— 放进 shared 会形成 `shared ↔ contracts` 循环。
// 也不放 `contracts`：那里是纯声明面（type / interface / port），
// 而这里有 class 与定时器/取消的真实实现。
//
// **所以提成独立包**：只依赖 `contracts`，`contracts` 不可能反向依赖它（它还不存在），
// 因此天然无环。四个消费包平级依赖它。
//
// 本模块承载「一次权限请求的准备生命周期」：
// 准备（prepare）→ 激活（activate）→ 结算或处置（resolve / dispose）。

export {
  PermissionPreparation,
  activatePermissionRequest,
  awaitPermissionPreparation,
  mapPreparedPermission,
} from "./prepared-request.js";
