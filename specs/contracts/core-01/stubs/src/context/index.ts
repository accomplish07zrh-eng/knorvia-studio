// SPDX-License-Identifier: Apache-2.0
// core-01 桩：保留 interface.md 列出的导出名与种类；函数体抛 Error，运行时值在首次使用时抛错。
// 精确签名见 interface.md（替换 PR 会用按签名生成的实现替换这些文件并删除旧实现）。

const notImplemented = (): never => {
  throw new Error("not implemented: core-01");
};

const _unimplementedValue = (): never => notImplemented();
export * from "./types.js";
export * from "./builder.js";
export * from "./utils.js";
export const buildCliPrefixSection = new Proxy({} as never, { get: _unimplementedValue });
export const buildIdentitySection = new Proxy({} as never, { get: _unimplementedValue });
export const buildWorkflowActorIdentitySection = new Proxy({} as never, { get: _unimplementedValue });
export const buildEnvInfoSection = new Proxy({} as never, { get: _unimplementedValue });
export const buildGitSystemContextSection = new Proxy({} as never, { get: _unimplementedValue });
export const buildSkillsSection = new Proxy({} as never, { get: _unimplementedValue });
export const buildCurrentDateSection = new Proxy({} as never, { get: _unimplementedValue });
export const buildMemorySection = new Proxy({} as never, { get: _unimplementedValue });
export const buildDesktopContextSection = new Proxy({} as never, { get: _unimplementedValue });
