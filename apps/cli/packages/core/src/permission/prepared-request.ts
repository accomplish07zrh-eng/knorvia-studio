// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// `@knorvia/core` 的权限准备转发层。
//
// 2026-10-23 移出：`PermissionPreparation` / `activatePermissionRequest` /
// `awaitPermissionPreparation` / `mapPreparedPermission` 已提到
// `@knorvia/permission-core`。
//
// **为什么提成独立包**（而不是放进 shared 或 contracts）：
//   · 不放 `shared`：`contracts` 已依赖 `shared`，而本模块依赖 `contracts` 的类型
//     → 放进 shared 会形成 `shared ↔ contracts` 循环。
//   · 不放 `contracts`：那里是纯声明面，而这里有 class 与定时器/取消的真实实现。
//   · 独立包只依赖 `contracts`，`contracts` 不可能反向依赖它 → 天然无环。
//
// **为什么保留这个文件**：core 的导出面是对外契约，bootstrap / cli / tui 都从
// `@knorvia/core` 取这些符号。保留一层转发让调用方无需改动；
// 等 core 整包随 kernel-switch 删除时它一并消失。
// 真实定义在 `@knorvia/permission-core`，所以这不是「纯再导出桩」。
export {
  PermissionPreparation,
  activatePermissionRequest,
  awaitPermissionPreparation,
  mapPreparedPermission,
} from "@knorvia/permission-core";
