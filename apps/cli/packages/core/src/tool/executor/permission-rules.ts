// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { PermissionRuleset, PermissionRuleValue, PermissionUpdate } from "@knorvia/contracts";

function mergeCategory(
  previous: readonly PermissionRuleValue[],
  additions: readonly PermissionRuleValue[],
): PermissionRuleValue[] {
  const contentsByTool = new Map<string, Set<string>>();
  const result: PermissionRuleValue[] = [];
  for (const batch of [previous, additions]) {
    for (const rule of batch) {
      const name = rule.toolName;
      const content = rule.ruleContent ?? "";
      let identities = contentsByTool.get(name);
      if (identities?.has(content)) continue;
      // 字符串分隔拼接会使含 NUL 的不同二元组碰撞；工具名和内容必须分别比较。
      if (!identities) {
        identities = new Set();
        contentsByTool.set(name, identities);
      }
      identities.add(content);
      result.push(rule);
    }
  }
  return result;
}

export function applyPermissionUpdates(
  current: PermissionRuleset,
  updates: PermissionUpdate[],
): PermissionRuleset {
  const result: PermissionRuleset = { ...current, version: 1 };
  for (const update of updates) {
    if (update.type !== "addRules") continue;
    const previous = result[update.behavior];
    // 新增规则的 getter 可能改写 update；目标类别必须在该回调前捕获。
    const destination = update.behavior;
    // 先快照旧数组再读取新增数组；条目 getter 不能在去重时追加本次输入。
    const existing = Array.isArray(previous) ? [...previous] : [];
    const additions = [...update.rules];
    Object.defineProperty(result, destination, {
      value: mergeCategory(existing, additions),
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return result;
}
