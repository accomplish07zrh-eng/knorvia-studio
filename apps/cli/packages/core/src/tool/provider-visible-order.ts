// SPDX-License-Identifier: Apache-2.0
// 供应商可见的工具顺序：参考工具集合按名字排序后排在前面，其余保持调用方给的顺序。
//
// 名字集合按工具族分组写成多段字符串，读起来比一张平铺的长名单更容易核对；分组不影响集合语义。

const SORTED_PROVIDER_TOOL_NAMES: ReadonlySet<string> = new Set(
  [
    "Agent Read Glob Grep LSP NotebookEdit",
    "AskUserQuestion Skill WebFetch WebSearch Workflow",
    "Bash CronCreate CronDelete CronList CronUpdate",
    "Edit Write",
    "EnterPlanMode ExitPlanMode EnterWorktree ExitWorktree ScheduleWakeup",
    "TaskCreate TaskGet TaskList TaskOutput TaskStop TaskUpdate",
    "TodoRead TodoWrite",
  ]
    .join(" ")
    .split(" "),
);

export function orderProviderVisibleToolContracts<T extends { name: string }>(
  tools: readonly T[],
): T[] {
  const reference = tools.filter((tool) => SORTED_PROVIDER_TOOL_NAMES.has(tool.name));
  const local = tools.filter((tool) => !SORTED_PROVIDER_TOOL_NAMES.has(tool.name));
  reference.sort((left, right) => left.name.localeCompare(right.name));
  return reference.concat(local);
}
