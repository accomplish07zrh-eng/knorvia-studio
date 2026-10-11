// SPDX-License-Identifier: Apache-2.0
// 工具可见性规则：把「禁用工具」规则串解析成名字集合，并据此判断/过滤工具名。
//
// 规则串允许带参数列表（例如 `Bash(git status)`），比较时只取工具名部分；
// 兼容名（例如 `web_search`）在规则侧与调用点侧统一归一，避免两边写法不一致导致规则失效。
//
// 三条不变量：
// 1. 规则为空、全部解析不出名字时返回 undefined，调用点据此**跳过过滤**而不是过滤掉一切；
// 2. 括号只有出现在第二个字符之后才截断；以 "(" 开头的规则整体当名字（保持旧行为）；
// 3. 过滤保持原数组顺序与元素引用，未命中时直接返回入参本身。

const WEB_SEARCH_ALIAS = "web_search";
const WEB_SEARCH_CANONICAL = "WebSearch";

/** 只有「名字 + 左括号」形式才截断；至少要有一个字符在括号之前。 */
const RULE_WITH_PARAMETERS = /^(.+?)\(/u;

export function normalizeToolNameAlias(toolName: string): string {
  switch (toolName) {
    case WEB_SEARCH_ALIAS:
      return WEB_SEARCH_CANONICAL;
    default:
      return toolName;
  }
}

function getToolRuleName(rule: string): string {
  const trimmed = rule.trim();
  const withParameters = RULE_WITH_PARAMETERS.exec(trimmed);
  return normalizeToolNameAlias(withParameters ? withParameters[1]! : trimmed);
}

export function createToolRuleNameSet(
  rules: readonly string[] | undefined,
): ReadonlySet<string> | undefined {
  if (rules === undefined || rules.length === 0) return undefined;
  const names = rules.reduce<Set<string>>((collected, rule) => {
    const name = getToolRuleName(rule);
    if (name.length > 0) collected.add(name);
    return collected;
  }, new Set<string>());
  return names.size === 0 ? undefined : names;
}

export function isToolNameDisallowed(
  toolName: string,
  disallowedTools: readonly string[] | undefined,
): boolean {
  const disallowed = createToolRuleNameSet(disallowedTools);
  if (disallowed === undefined) return false;
  return disallowed.has(normalizeToolNameAlias(toolName));
}

export function filterDisallowedToolNames(
  toolNames: readonly string[],
  disallowedTools: readonly string[] | undefined,
): readonly string[] {
  const disallowed = createToolRuleNameSet(disallowedTools);
  if (disallowed === undefined) return toolNames;
  return toolNames.filter((toolName) => !disallowed.has(normalizeToolNameAlias(toolName)));
}
