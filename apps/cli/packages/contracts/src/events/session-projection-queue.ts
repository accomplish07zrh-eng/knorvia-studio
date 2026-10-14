// SPDX-License-Identifier: Apache-2.0
// 投影队列 changes 的兼容出口：只声明名字，实现全部在 ./projection-queue-changes.js。
export {
  queueAdmissionChanges,
  queueDeliveryChanges,
  queueOrderChanges,
  queueRemovalChanges,
  sessionModeChanges,
} from "./projection-queue-changes.js";
