// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-02 合同桩：apps/cli/packages/dynamic-workflow/src/engine/engine-artifacts.ts
// 分类 `upstream-modified`。只列 interface.md 的**运行时**导出名（纯类型不进运行时，省略）；
// 末行的 throw 让任何经由这些模块的 import 立刻失败——桩用于「桩替换后契约测试必须全部失败」
// 的验证与替换阶段的起始状态，进入实现后随 stubs/ 一起退役。
// 机器生成：node --import tsx specs/contracts/dynamic-workflow-02/stubs/build-stubs.mjs（勿手改）

export function publishContentArtifact(..._args: unknown[]): unknown {
  throw new Error("not implemented: dynamic-workflow-02");
}
export function declarePresetArtifact(..._args: unknown[]): unknown {
  throw new Error("not implemented: dynamic-workflow-02");
}
export function rememberArtifactRow(..._args: unknown[]): unknown {
  throw new Error("not implemented: dynamic-workflow-02");
}
export function isDeclaredPreset(..._args: unknown[]): unknown {
  throw new Error("not implemented: dynamic-workflow-02");
}
export function declaredPresetIds(..._args: unknown[]): unknown {
  throw new Error("not implemented: dynamic-workflow-02");
}

throw new Error("not implemented: dynamic-workflow-02");
