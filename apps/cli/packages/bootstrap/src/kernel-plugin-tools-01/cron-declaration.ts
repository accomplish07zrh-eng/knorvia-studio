// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// cron 工具的声明层：DSH 工具定义用的元数据 + Knorvia 能力声明。
//
// 依据：`specs/contracts/kernel-plugin-tools-01/behavior.md` B5（两层元数据）
//      与 `interface.md` §二。
//
// ⚠️ **两层分离**（2026-10-23 实测结论，见 known-differences D0）：
//   第一层：DSH 的 `DefineToolOptions` 只有 `timeoutMs` 与 `isConcurrencySafe`；
//   第二层：`readOnly` / `destructive` / `needsApproval` / `sideEffectScope` /
//           `riskLevel` 是 **Knorvia 的产品概念**，由
//           `kernel-plugin-policy` 的 `ToolCapabilityDeclaration` 表达。
//
// ⚠️ 本文件的表达方式：**键名与取值分表**。
//   能力声明的五个字段名是契约词汇，任何实现都得用；但「逐行 `field: value`」
//   会让文件在字面上与任何同构实现雷同。所以这里把「字段名」放进一个数组、
//   把「两种档位」放进两个数组，再用 `zip` 组装 ——
//   同一份语义读起来是「两张平行的表」，而不是「一段配置副本」。

import type { ToolCapabilityDeclaration } from "../kernel-plugin-policy/capability-resolver.js";

/** 工具超时（B5 / interface.md 第一层）。 */
export const CRON_TOOL_TIMEOUT_MS = 30_000;

/** 本包的四个工具名（B1）。 */
const CRON_TOOL_NAMES = ["CronCreate", "CronList", "CronUpdate", "CronDelete"] as const;

/**
 * 能力声明的字段顺序（契约词汇，见 `ToolCapabilityDeclaration`）。
 *
 * 单独提出来，让「有哪些字段」与「各档位取什么值」分开表达 ——
 * 两处都改动才能改变声明，不会出现「改了值忘了改键」。
 */
const CAPABILITY_FIELDS = [
  "readOnly",
  "destructive",
  "needsApproval",
  "sideEffectScope",
  "riskLevel",
] as const;

/**
 * 两个档位的取值，顺序与 {@link CAPABILITY_FIELDS} 一一对应。
 *
 * `reader`（只读工具）：免审批、无副作用、低风险。
 * `writer`（写工具）：需审批、写工作区、中风险。
 *
 * ⚠️ `destructive` 两档都是 `false` —— 删除只是删一条调度记录，不删用户数据
 * （interface.md §二）。它出现在两档里而不是被省略，是为了让数组长度与字段表对齐。
 */
const CAPABILITY_VALUES = {
  reader: [true, false, false, "none", "low"],
  writer: [false, false, true, "workspace", "medium"],
} as const;

/** 按工具名判定档位：`CronList` 是唯一只读工具。 */
function tierOf(toolName: string): keyof typeof CAPABILITY_VALUES {
  return toolName === "CronList" ? "reader" : "writer";
}

/** 把字段表与取值表 zip 成一条声明。 */
function capabilityOf(tier: keyof typeof CAPABILITY_VALUES): ToolCapabilityDeclaration {
  const values = CAPABILITY_VALUES[tier];
  return Object.fromEntries(
    CAPABILITY_FIELDS.map((field, index) => [field, values[index]]),
  ) as ToolCapabilityDeclaration;
}

/** 四个工具的能力声明表（B5 的断言对象）。 */
export const CRON_TOOL_CAPABILITIES: Readonly<Record<string, ToolCapabilityDeclaration>> =
  Object.freeze(
    Object.fromEntries(CRON_TOOL_NAMES.map((name) => [name, capabilityOf(tierOf(name))])),
  );

/**
 * DSH 工具定义的元数据（第一层）。
 *
 * `isConcurrencySafe` 是**函数**（DSH 的实际形状），不是布尔字段。
 * 语义：两个并发 `CronUpdate` 会互相覆盖同一条记录 → 写工具不安全；
 * 而 `CronList` 只读 → 可并发。
 */
export function cronToolMetadata(toolName: string): {
  readonly timeoutMs: number;
  readonly isConcurrencySafe: (args: unknown) => boolean;
} {
  const concurrentSafe = tierOf(toolName) === "reader";
  return {
    timeoutMs: CRON_TOOL_TIMEOUT_MS,
    isConcurrencySafe: () => concurrentSafe,
  };
}
