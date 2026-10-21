// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// `js` 执行请求的形状转换与信号合并。
//
// 单独成模块的理由：这些函数只依赖参数（不闭包捕获运行时状态），
// 所以可以脱离 MCP 服务器装配独立测试与阅读。
// 运行时装配（`Server` 与 handler 注册）留在 `mcp-runtime.ts`。
import type { CallToolResult } from "@modelcontextprotocol/server";
import type { JsRuntimeInput } from "@knorvia/contracts/tools/node-repl";
import type { NodeReplExecuteInput } from "./executor.js";
import { NODE_REPL_DEFAULT_TIMEOUT_MS } from "./tool-contract.js";

/** `js` 工具的源码为空时的固定拒绝文案。 */
const EMPTY_SOURCE_TEXT = "js expects non-empty JavaScript source";

/**
 * 一次执行需要的协作面。
 *
 * 只声明「执行时需要什么」，不引用具体的 `RuntimeLifetime` / `SessionAdmission` ——
 * 那样会把本模块绑死在两个实现类上，也让它的测试需要构造整条运行时链路。
 */
export type ExecutorPort = {
  readonly run: (input: {
    code: string;
    signal: AbortSignal;
    syncTimeoutMs: number;
    cuaBroker: unknown;
    requestMeta: Record<string, unknown>;
  }) => Promise<unknown>;
  readonly brokerReady: Promise<unknown> | undefined;
  readonly brokerConnection: unknown;
  readonly lifetimeSignal: AbortSignal;
};

/**
 * 取本次执行的时间预算。
 *
 * 预算来自调用参数；缺席时用工具契约里的默认值 —— 那个数字只在契约里写一次，
 * 本模块引用它而不是另抄一个常量。
 *
 * @param requestedMs - 调用方给的值。
 * @returns 实际使用的预算（毫秒）。
 */
export function budgetOf(requestedMs: number | undefined): number {
  return requestedMs ?? NODE_REPL_DEFAULT_TIMEOUT_MS;
}

/**
 * 合并出本次执行的信号。
 *
 * 三路都必须参与：调用方可能主动取消、运行时可能被关闭、预算可能耗尽。
 * 任一触发都不能让「迟到的成功」被发布 —— 客户端已经不等了。
 *
 * @param callerSignal - 客户端请求的信号。
 * @param runtimeSignal - 运行时生命周期信号。
 * @param budgetMs - 时间预算。
 * @returns 合并后的信号。
 */
export function executionSignal(
  callerSignal: AbortSignal,
  runtimeSignal: AbortSignal,
  budgetMs: number,
): AbortSignal {
  const cancelPaths = [callerSignal, runtimeSignal, AbortSignal.timeout(budgetMs)];
  return AbortSignal.any(cancelPaths);
}

/**
 * 源码是否为空（只含空白也算空）。
 *
 * @param code - 调用方给的源码。
 * @returns 是否需要拒绝。
 */
export function isEmptySource(code: string): boolean {
  return code.trim() === "";
}

/**
 * 构造「源码为空」的失败结果。
 *
 * 单独成函数是为了让调用点的分支保持一行 —— 内联的对象字面量会把
 * 「这是失败」这件事埋在三层嵌套里。
 *
 * @returns MCP 工具调用的失败结果。
 */
export function emptySourceResult(): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: EMPTY_SOURCE_TEXT }],
  };
}

/**
 * 把调用方给的标题并入 requestMeta。
 *
 * `title` 缺席时不写 `title: undefined`：那会把「没有标题」从
 * 「键不存在」变成「键存在但值为 undefined」，两种语义下游要分开处理。
 *
 * @param meta - 已归一化的调用方元数据。
 * @param title - 调用方给的标题。
 * @returns 合并后的元数据。
 */
export function withTitle(
  meta: Record<string, unknown>,
  title: string | undefined,
): Record<string, unknown> {
  if (title === undefined) return meta;
  return { ...meta, title };
}

/**
 * 把 `js` 参数转成执行器入参。
 *
 * 字段名与顺序在这里集中，调用点只写「用哪个参数、哪个信号」，
 * 不必重复罗列执行器的入参形状。
 *
 * @param args - 已通过 schema 校验的调用参数。
 * @param signal - 已合并的执行信号。
 * @param budget - 本次预算。
 * @param broker - CUA broker 连接（可能没有）。
 * @param requestMeta - 调用方元数据（含标题）。
 * @returns 执行器入参。
 */
export function toExecutorInput(
  args: JsRuntimeInput,
  signal: AbortSignal,
  budget: number,
  broker: NodeReplExecuteInput["cuaBroker"],
  requestMeta: Record<string, unknown>,
): NodeReplExecuteInput {
  return { code: args.code, signal, syncTimeoutMs: budget, cuaBroker: broker, requestMeta };
}
