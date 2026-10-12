// SPDX-License-Identifier: Apache-2.0
// contracts-03 桩：保留 interface.md 列出的导出名与种类；函数体抛 Error，运行时值在首次使用时抛错。
// 精确签名见 interface.md（替换 PR 会用按签名生成的实现替换这些文件并删除旧实现）。

const notImplemented = (): never => {
  throw new Error("not implemented: contracts-03");
};

const _unimplementedValue = (): never => notImplemented();
export type SkillScope = never;
export type SkillSource = never;
export type SkillDiagnosticSeverity = never;
export type SkillDiagnosticCode = never;
export type SkillRoot = never;
export type SkillPolicy = never;
export type SkillMetadata = never;
export type SkillTelemetryMetadata = never;
export type SkillDiagnostic = never;
export type SkillLoadOutcome = never;
export type SkillContent = never;
export type SkillDiscoverRequest = never;
export type SkillLoadRequest = never;
export type SkillOperationOptions = never;
export type SkillPort = never;
export type SkillConfig = never;
