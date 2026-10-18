// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-02 合同桩：apps/cli/packages/dynamic-workflow/src/engine/types.ts
// 分类 `upstream-modified`。只列 interface.md 的**运行时**导出名（纯类型不进运行时，省略）；
// 末行的 throw 让任何经由这些模块的 import 立刻失败——桩用于「桩替换后契约测试必须全部失败」
// 的验证与替换阶段的起始状态，进入实现后随 stubs/ 一起退役。
// 机器生成：node --import tsx specs/contracts/dynamic-workflow-02/stubs/build-stubs.mjs（勿手改）

export function refToString(..._args: unknown[]): unknown {
  throw new Error("not implemented: dynamic-workflow-02");
}
export { WorkflowError } from "./workflow-error.js";
export const WORLD_READ_INPUT_MAX_BYTES: unknown = undefined;
export { INSTRUCTIONS_HEAD_MAX_CHARS } from "./ask-observation-types.js";
export { LAST_TOOL_NAME_MAX_CHARS } from "./ask-observation-types.js";
export { LAST_TOOL_TARGET_MAX_CHARS } from "./ask-observation-types.js";
export const REPAIR_ATTEMPTS: unknown = undefined;
export const NUDGE_ATTEMPTS: unknown = undefined;

throw new Error("not implemented: dynamic-workflow-02");
