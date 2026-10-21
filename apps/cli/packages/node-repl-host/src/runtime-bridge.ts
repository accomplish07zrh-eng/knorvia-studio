// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 从执行单元的全局符号里取回浏览器运行时桥，并校验它真的是桥。
//
// 为什么需要校验：全局符号是**执行单元之间约定的交接点**，两侧由不同模块写入，
// 类型系统在跨执行单元边界上帮不上忙。这里做运行期形状核对，把「拿到一个对象」
// 收窄成「拿到一个可用的桥」——否则第一次调用才会以 `is not a function` 暴露。
import type { BrowserClientTransport } from "@knorvia/core/browser-client";

/**
 * 桥在全局命名空间里的键。
 *
 * 值是与执行单元另一端约定的字面量，**不可改**（worker 侧用同一个键取这个符号）。
 * 单独提成常量是为了让它有个名字：`Symbol.for("...")` 里的裸字符串读起来
 * 只是一个魔法值，而具名常量能说明它是什么、为什么存在。
 */
const BRIDGE_GLOBAL_KEY = "knorvia.node-repl.browser-control-bridge";

/** 桥的交接符号：执行单元全局命名空间里唯一的键。 */
export const NODE_REPL_BROWSER_BRIDGE_SYMBOL: symbol = Symbol.for(BRIDGE_GLOBAL_KEY);

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
 * 成员按「期望的运行期类型」分组。
 *
 * 分组的收益不只是少写几行：它把「哪些成员必须是函数、哪些必须是字符串」
 * 变成两个可读的清单，新增成员时按类型放进对应数组即可。
 * 用逐成员对照表也能表达同样的信息，但读的人要一行行看值才能归纳出这个规律。
 */
const FUNCTION_MEMBERS: readonly (keyof NodeReplBrowserRuntimeBridge)[] = [
  "list",
  "execute",
  "assertAvailable",
];
const STRING_MEMBERS: readonly (keyof NodeReplBrowserRuntimeBridge)[] = ["documentationRoot"];

/** 一个成员在运行期应有的 `typeof` 结果。 */
type MemberKind = "function" | "string";

/**
 * 全部成员的期望类型（由上面两个分组展开而来，不另写一份对照表）。
 *
 * 由分组派生而不是手抄，避免「分组改了但对照表忘了改」这类分叉。
 */
const EXPECTED_KIND: Readonly<Record<string, MemberKind>> = Object.fromEntries([
  ...FUNCTION_MEMBERS.map((member) => [member, "function"] as const),
  ...STRING_MEMBERS.map((member) => [member, "string"] as const),
]);

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
  return Object.entries(EXPECTED_KIND).every(([member, expected]) => {
    const value: unknown = Reflect.get(target, member);
    return typeof value === expected;
  });
}

/**
 * 执行单元的全局命名空间。
 *
 * 用一个具名别名而不是内联 `Record<PropertyKey, unknown>`：它说明这个参数
 * 不是「任意对象」，而是「worker 的 globalThis 那一层」——与下方注释一致。
 */
type ExecutionUnitGlobals = Record<PropertyKey, unknown>;

/**
 * 从执行单元的全局对象里取浏览器运行时桥。
 *
 * @param globals - 执行单元的全局命名空间。
 * @returns 已校验形状的桥。
 * @throws 符号缺失或形状不符时抛错（不返回半可用的对象）。
 */
export function readNodeReplBrowserRuntimeBridge(
  globals: ExecutionUnitGlobals,
): NodeReplBrowserRuntimeBridge {
  const candidate: unknown = Reflect.get(globals, NODE_REPL_BROWSER_BRIDGE_SYMBOL);
  if (!matchesBridgeShape(candidate)) throw new Error(MISSING_BRIDGE);
  return candidate;
}
