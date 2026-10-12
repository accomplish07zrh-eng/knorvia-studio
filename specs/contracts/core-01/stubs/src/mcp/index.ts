// SPDX-License-Identifier: Apache-2.0
// core-01 桩：保留 interface.md 列出的导出名与种类；函数体抛 Error，运行时值在首次使用时抛错。
// 精确签名见 interface.md（替换 PR 会用按签名生成的实现替换这些文件并删除旧实现）。

const notImplemented = (): never => {
  throw new Error("not implemented: core-01");
};

const _unimplementedValue = (): never => notImplemented();
export const toMcpToolName = new Proxy({} as never, { get: _unimplementedValue });
export const HOST_NODE_REPL_IMAGE_MAX_DIMENSION = new Proxy({} as never, { get: _unimplementedValue });
export const MCP_IMAGE_INLINE_BASE64_BYTES = new Proxy({} as never, { get: _unimplementedValue });
export const MCP_IMAGE_INLINE_RAW_BYTES = new Proxy({} as never, { get: _unimplementedValue });
export type RegisterMcpToolsOptions = never;
export function registerMcpTools(..._args: unknown[]): never {
  return notImplemented();
}
export const McpToolOutputJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
