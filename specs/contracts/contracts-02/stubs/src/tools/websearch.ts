// SPDX-License-Identifier: MIT
/* eslint-disable max-lines -- 桩文件按 interface.md 的导出清单生成，行数由导出数量决定。 */
// contracts-02 桩：保留 interface.md 列出的导出名与种类；函数体抛 Error，运行时值在首次使用时抛错。
// 精确签名见 interface.md（替换 PR 会用按签名生成的实现替换这些文件并删除旧实现）。

const notImplemented = (): never => {
  throw new Error("not implemented: contracts-02");
};

const _unimplementedValue = (): never => notImplemented();

export function toWebSearchProviderNativeArgs(..._args: unknown[]): never {
  return notImplemented();
}
export const WEBSEARCH_PROVIDER_NATIVE_SPEC = new Proxy({} as never, { get: _unimplementedValue });
export const WEBSEARCH_TOOL_CONTRACT = new Proxy({} as never, { get: _unimplementedValue });
export type WebSearchInput = never;
export const WebSearchInputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const WebSearchInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WebSearchOutput = never;
export const WebSearchOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export const WebSearchOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WebSearchProviderNativeArgs = never;
export type WebSearchResultItem = never;
export const WebSearchResultItemSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WebSearchSource = never;
export const WebSearchSourceSchema = new Proxy({} as never, { get: _unimplementedValue });
