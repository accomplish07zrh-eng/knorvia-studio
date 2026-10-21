// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// MCP 工具表与工具调用的分派。
//
// 本模块只回答两个问题：「对外暴露哪些工具」与「这次调用该交给谁」。
// 生命周期门槛、准入队列、执行器本体都由调用方注入，
// 因此这里不持有任何运行时状态。
import {
  INVALID_PARAMS,
  type CallToolResult,
  type CallToolRequest,
  type Tool,
} from "@modelcontextprotocol/server";
import {
  JsInputJsonSchema,
  JsRuntimeInputSchema,
  type JsRuntimeInput,
} from "@knorvia/contracts/tools/node-repl";
import type { WindowsComputerRuntime } from "@knorvia/cua/windows";
import { CONTEXT_META_KEY } from "./mcp-caller-context.js";
import { JS_TOOL_DESCRIPTION } from "./tool-contract.js";
import { windowsComputerContext } from "./windows-computer.js";

/** 工具名：唯一由本包提供的工具。 */
export const JS_TOOL_NAME = "js";

/** MCP 请求里携带调用方上下文的元数据键。 */
const CONTEXT_KEY = CONTEXT_META_KEY;

/**
 * 把原生工具的描述转成 MCP 工具条目。
 *
 * 唯一职责是**形状转换**（原生 schema → MCP schema），
 * 与能力加载、生命周期判断无关，因此可以独立阅读。
 *
 * @param native - 已加载的原生能力；缺席表示本次没有原生工具。
 * @returns MCP 工具条目（可能为空）。
 */
export function nativeToolEntries(native: WindowsComputerRuntime | undefined): Tool[] {
  if (native === undefined) return [];
  return native.listTools().map((tool) => ({
    ...tool,
    inputSchema: tool.inputSchema as Tool["inputSchema"],
  }));
}

/**
 * 组装对外暴露的工具列表：原生工具在前，`js` 在末位。
 *
 * `js` 放末位是有意的：它总是存在，放在最后让「原生工具是动态追加的」
 * 这件事在返回值顺序上也成立。
 *
 * @param native - 已加载的原生能力。
 * @returns 完整工具表。
 */
export function toolCatalogue(native: WindowsComputerRuntime | undefined): Tool[] {
  const entries = nativeToolEntries(native);
  entries.push({
    name: JS_TOOL_NAME,
    inputSchema: JsInputJsonSchema as Tool["inputSchema"],
    description: JS_TOOL_DESCRIPTION,
  });
  return entries;
}

/**
 * 这次调用是否该交给原生能力。
 *
 * 顺序很重要：原生工具名是动态的，先判 `js` 会漏掉同名的原生工具。
 *
 * @param native - 已加载的原生能力。
 * @param name - 本次调用的工具名。
 * @returns 是否应走原生路径。
 */
export function isNativeCall(native: WindowsComputerRuntime | undefined, name: string): boolean {
  if (native === undefined) return false;
  return native.listTools().some((tool) => tool.name === name);
}

/**
 * 从 MCP 请求扩展里取调用方上下文。
 *
 * `_meta` 是可选字段，取值结果可能是 undefined —— 那是正常情况
 * （客户端没带上下文），不是错误。
 *
 * @param extra - `setRequestHandler` 给出的请求扩展。
 * @returns 原始上下文（可能为 undefined）。
 */
export function rawContextOf(extra: { mcpReq: { _meta?: Record<string, unknown> } }): unknown {
  const meta = extra.mcpReq._meta;
  return meta === undefined ? undefined : meta[CONTEXT_KEY];
}

/**
 * 解析 `js` 参数；失败时抛出 INVALID_PARAMS。
 *
 * 单独成函数是为了让 handler 里的分支保持「名字对不对」「参数对不对」
 * 两件事各自一行，而不是把 safeParse 的三段判断摊在主流程里。
 *
 * @param name - 本次调用的工具名。
 * @param args - 原始参数。
 * @returns 已校验的参数。
 * @throws 工具名不匹配或参数不合法时抛 INVALID_PARAMS。
 */
export function requireJsArguments(name: string, args: unknown): JsRuntimeInput {
  const parsed = JsRuntimeInputSchema.safeParse(args);
  if (name !== JS_TOOL_NAME || !parsed.success) {
    const error = Object.assign(new Error("Invalid js tool arguments"), {
      code: INVALID_PARAMS,
    });
    throw error;
  }
  return parsed.data;
}

/**
 * 构造原生工具的调用入参。
 *
 * @param native - 原生能力。
 * @param request - MCP 工具调用请求。
 * @param rawContext - 原始调用方上下文。
 * @param signal - 已合并的信号。
 * @returns 原生调用入参。
 */
export function nativeInvocation(
  request: CallToolRequest,
  rawContext: unknown,
  signal: AbortSignal,
): NativeRunArguments {
  const { name, arguments: args } = request.params;
  return {
    toolName: name,
    arguments: args,
    context: windowsComputerContext(rawContext),
    signal,
  };
}

/** 原生执行结果的形状（MCP 工具结果）。 */
export type NativeResult = CallToolResult;

/** 原生工具的执行入参（由 `windowsComputerContext` 与请求共同决定）。 */
export type NativeRunArguments = Parameters<WindowsComputerRuntime["execute"]>[0];
