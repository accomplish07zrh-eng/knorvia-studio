// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 从执行单元的全局符号里取回浏览器运行时桥，并校验它真的是桥。
//
// 为什么需要校验：全局符号是**执行单元之间约定的交接点**，两侧由不同模块写入，
// 类型系统在跨执行单元边界上帮不上忙。这里做运行期形状核对，把「拿到一个对象」
// 收窄成「拿到一个可用的桥」——否则第一次调用才会以 `is not a function` 暴露。
import type { BrowserClientTransport } from "@knorvia/core/browser-client";

/** 桥的交接符号：执行单元全局命名空间里唯一的键。 */
export const NODE_REPL_BROWSER_BRIDGE_SYMBOL: symbol = Symbol.for(
  "knorvia.node-repl.browser-control-bridge",
);

/** 子代理里调用浏览器时的固定拒绝文案（与 cua-bridge 同类文案保持一致口径）。 */
export const BROWSER_UNAVAILABLE_IN_SUBAGENT_MESSAGE = "Browser is not available in subagent";

/** 取不到桥时的固定诊断文案。 */
const MISSING_BRIDGE = "Browser runtime bridge is unavailable; use the Knorvia execution host";

/** 浏览器运行时桥：传输面 + 文档根 + 可用性断言。 */
export interface NodeReplBrowserRuntimeBridge extends BrowserClientTransport {
  documentationRoot: string;
  assertAvailable(): void;
}

/**
 * 桥必须满足的成员形状。
 *
 * 用一张表而不是逐个 `typeof` 判断：新增一个成员时只改表，
 * 不会出现「加了成员却忘了校验」的漏项。
 */
const REQUIRED_MEMBERS: Readonly<
  Record<keyof NodeReplBrowserRuntimeBridge, "function" | "string">
> = {
  list: "function",
  execute: "function",
  assertAvailable: "function",
  documentationRoot: "string",
};

/**
 * 判断一个候选对象是否满足桥的全部成员形状。
 *
 * 三条约束都来自实际使用方式，不是保守检查：
 *   1. **可以是函数** —— 桥可能被挂成可调用对象（`Object.assign(() => {}, …)`）；
 *   2. **成员可以来自原型链** —— 桥可能是 `Object.create(prototype)` 的产物，
 *      因此用 `Reflect.get` 读值，而不是只看自有属性；
 *   3. **只读、不调用** —— `assertAvailable` 虽然名字像「检查」，但它是有副作用的成员；
 *      校验阶段调用它会让「读取桥」变成「使用桥」。
 *
 * @param candidate - 从全局符号取回的值。
 * @returns 是否是可用的桥。
 */
function matchesBridgeShape(candidate: unknown): candidate is NodeReplBrowserRuntimeBridge {
  if (candidate === null) return false;
  const kind = typeof candidate;
  if (kind !== "object" && kind !== "function") return false;
  const target = candidate as object;
  return Object.entries(REQUIRED_MEMBERS).every(([member, expected]) => {
    const value: unknown = Reflect.get(target, member);
    return typeof value === expected;
  });
}

/**
 * 从执行单元的全局对象里取浏览器运行时桥。
 *
 * @param globals - 执行单元的全局命名空间。
 * @returns 已校验形状的桥。
 * @throws 符号缺失或形状不符时抛错（不返回半可用的对象）。
 */
export function readNodeReplBrowserRuntimeBridge(
  globals: Record<PropertyKey, unknown>,
): NodeReplBrowserRuntimeBridge {
  const candidate: unknown = Reflect.get(globals, NODE_REPL_BROWSER_BRIDGE_SYMBOL);
  if (!matchesBridgeShape(candidate)) throw new Error(MISSING_BRIDGE);
  return candidate;
}
