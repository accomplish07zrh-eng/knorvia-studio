// SPDX-License-Identifier: Apache-2.0
// 权限 broker 能力判定的兼容面（B14）：实现见 ./permission/capability-guards.js。
import * as guards from "./permission/capability-guards.js";

export const isResolvablePermissionBroker = guards.isResolvablePermissionBroker;
export const isInspectablePermissionBroker = guards.isInspectablePermissionBroker;
