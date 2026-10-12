// SPDX-License-Identifier: MIT
/* eslint-disable max-lines -- 桩文件按 interface.md 的导出清单生成，行数由导出数量决定。 */
// contracts-01 桩：保留 interface.md 列出的导出名与种类；函数体抛 Error，运行时值在首次使用时抛错。
// 精确签名见 interface.md（替换 PR 会用按签名生成的桩替换这些文件并删除旧实现）。

const notImplemented = (): never => {
  throw new Error("not implemented: contracts-01");
};

const _unimplementedValue = (): never => notImplemented();

export function isOfficialMarketplaceId(..._args: unknown[]): never {
  return notImplemented();
}
export const KNORVIA_DWF_CHILD_COMMAND = new Proxy({} as never, { get: _unimplementedValue });
export const KNORVIA_INLINE_PLUGIN_MARKETPLACE = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const KNORVIA_PLUGIN_HOST_COMMAND = new Proxy({} as never, { get: _unimplementedValue });
export type PluginComponentGroup = never;
export type PluginComponentItem = never;
export type PluginComponentKind = never;
export type PluginConfig = never;
export type PluginDiagnostic = never;
export type PluginDiagnosticCode = never;
export type PluginDiagnosticSeverity = never;
export type PluginDiscoverRequest = never;
export type PluginHookDetail = never;
export type PluginLoadOutcome = never;
export type PluginManifest = never;
export type PluginMarketplaceConfig = never;
export type PluginMarketplaceSourceConfig = never;
export type PluginMetadata = never;
export type PluginOperationOptions = never;
export type PluginOptionValue = never;
export type PluginOptionValues = never;
export type PluginPort = never;
export type PluginReferenceCatalog = never;
export type PluginReferenceCatalogEntry = never;
export type PluginSource = never;
export type PluginStoreListing = never;
export type PluginUserConfigOption = never;
