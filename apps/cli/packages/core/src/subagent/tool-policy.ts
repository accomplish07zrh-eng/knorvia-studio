import {
  /* 进入计划模式 */ ENTER_PLAN_MODE_TOOL_NAME,
  /* 退出计划模式 */ EXIT_PLAN_MODE_TOOL_NAME,
} from "@knorvia/contracts";
import { filterDisallowedToolNames } from "../tool/tool-visibility.js";

const SUBAGENT_CHILD_FORCED_DISALLOWED_TOOLS: readonly string[] = [
  ENTER_PLAN_MODE_TOOL_NAME /* 进入计划模式 */,
  EXIT_PLAN_MODE_TOOL_NAME /* 退出计划模式 */,
] as const satisfies readonly string[];

export function buildSubagentChildDisallowRules(
  disallowedTools: readonly string[] | undefined,
): /* 过滤后的工具名 */ readonly string[] {
  return [...SUBAGENT_CHILD_FORCED_DISALLOWED_TOOLS, ...(disallowedTools ?? [])];
}

export function filterSubagentChildToolNames(
  toolNames: readonly string[],
  disallowedTools: readonly string[] | undefined,
): /* 过滤后的工具名 */ readonly string[] {
  // 子 agent 没有独立的 plan approval 恢复面，暴露 plan tools 会让
  // ExitPlanMode 等待用户确认并卡住父 turn，因此所有子 agent 工具面统一剔除。
  return filterDisallowedToolNames(toolNames, buildSubagentChildDisallowRules(disallowedTools));
}
