// SPDX-License-Identifier: Apache-2.0
// 工具名兼容层。
//
// `Agent` 与 `Task` 是同一个派发工具的两个名字：派发判定要同时认这两个名字，hook matcher
// 也要把它们放在一起匹配。`ApplyPatch` 是补丁工具的入口名，matcher 侧要覆盖它真正落地的
// `Write` 与 `Edit`。别名关系只在这一个函数里表达，派发名集合从同一份名字常量派生。

export const TASK_TOOL_NAME = "Task";

const AGENT_TOOL_NAME = "Agent";
const APPLY_PATCH_TOOL_NAME = "ApplyPatch";
const APPLY_PATCH_MATCHER_NAMES = ["Write", "Edit"] as const;

const DISPATCH_TOOL_NAMES = [AGENT_TOOL_NAME, TASK_TOOL_NAME] as const;
const SUBAGENT_DISPATCH_TOOL_NAMES: ReadonlySet<string> = new Set(DISPATCH_TOOL_NAMES);

/** 工具名 → matcher 还要一起匹配的名字；没有别名时返回 undefined。 */
function matcherAliases(toolName: string): readonly string[] | undefined {
  if (toolName === AGENT_TOOL_NAME) return [TASK_TOOL_NAME];
  if (toolName === TASK_TOOL_NAME) return [AGENT_TOOL_NAME];
  if (toolName === APPLY_PATCH_TOOL_NAME) return APPLY_PATCH_MATCHER_NAMES;
  return undefined;
}

export function isSubagentDispatchToolName(toolName: string | undefined): boolean {
  if (!toolName) return false;
  return SUBAGENT_DISPATCH_TOOL_NAMES.has(toolName);
}

// 每次返回新数组：第一个元素固定是传入的名字本身，随后是别名（去重）。
export function hookMatcherToolNamesForTool(toolName: string): readonly string[] {
  const aliases = matcherAliases(toolName);
  if (!aliases) return [toolName];
  const names = [toolName];
  for (const alias of aliases) {
    if (!names.includes(alias)) names.push(alias);
  }
  return names;
}
