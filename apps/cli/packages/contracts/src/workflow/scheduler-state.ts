// SPDX-License-Identifier: Apache-2.0
// 调度器状态的公开入口：只做再导出。
// 声明在 scheduler-state-declarations.ts，推导实现在 scheduler-state-derivation.ts；
// 兼容面名字见 contracts-02 的 interface.md。
export {
  WorkflowSchedulerActiveActivitySchema,
  WorkflowSchedulerCollectionStateSchema,
  WorkflowSchedulerDerivedNodeSchema,
  WorkflowSchedulerStateSchema,
} from "./scheduler-state-declarations.js";

export type {
  WorkflowSchedulerActiveActivity,
  WorkflowSchedulerCollectionState,
  WorkflowSchedulerDerivedNode,
  WorkflowSchedulerState,
} from "./scheduler-state-declarations.js";

export {
  deriveWorkflowRunSchedulerState,
  deriveWorkflowSchedulerState,
} from "./scheduler-state-derivation.js";
