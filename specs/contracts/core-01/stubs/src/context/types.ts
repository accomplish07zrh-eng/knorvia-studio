// SPDX-License-Identifier: Apache-2.0
// core-01 桩：保留 interface.md 列出的导出名与种类；函数体抛 Error，运行时值在首次使用时抛错。
// 精确签名见 interface.md（替换 PR 会用按签名生成的实现替换这些文件并删除旧实现）。

const notImplemented = (): never => {
  throw new Error("not implemented: core-01");
};

const _unimplementedValue = (): never => notImplemented();
export const EnvInfo = new Proxy({} as never, { get: _unimplementedValue });
export const PackageManager = new Proxy({} as never, { get: _unimplementedValue });
export const ProjectContext = new Proxy({} as never, { get: _unimplementedValue });
export const ProjectType = new Proxy({} as never, { get: _unimplementedValue });
export const ResolvedUserInstructionSource = new Proxy({} as never, { get: _unimplementedValue });
export const ResolvedUserInstructions = new Proxy({} as never, { get: _unimplementedValue });
export const UserInstructionsOptions = new Proxy({} as never, { get: _unimplementedValue });
export type ContextSource = never;
export type ContextInjectionTarget = never;
export type ContextCacheHint = never;
export type PresentationSurface = never;
export type ContextSection = never;
export type ContextMetaUserAttachmentSource = never;
export type ContextMetaUserAttachment = never;
export type ContextBuildResult = never;
export type OutputStylePromptConfig = never;
export type ContextBuilderConfig = never;
export type WorkflowActorContext = never;
export type ContextUserInstructionsRequest = never;
