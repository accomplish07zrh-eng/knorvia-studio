// SPDX-License-Identifier: Apache-2.0
// 运行时工具允许/禁用清单与结构性禁用（B37）。
// 三条规则收在一处（注册面有两个入口，两份名单必然漂移）：
// ① 运行时禁用名单 = turn 级 toolDisallowlist ∪ workflow_child 的结构性禁用（alwaysAsk 工具
//    在 child 里会发出父界面看不到的确认请求挂到超时；编排/问答类按不变式禁入）；
// ② 动态工作流灰度门「缺席即开启」（只有受信 Host 的 protocol session 显式写 false）；
// ③ 内建工具允许清单：别名归一、explore 档位取交集、subagent_child 补回 RespondToCoordinator。
import {
  AMEND_WORKFLOW_TOOL_NAME,
  CREATE_WORKFLOW_TOOL_NAME,
  RESOLVE_WORKFLOW_QUESTION_TOOL_NAME,
  RESPOND_TO_COORDINATOR_TOOL_NAME,
  RESUME_WORKFLOW_RUN_TOOL_NAME,
  SAVE_WORKFLOW_TOOL_NAME,
} from "@knorvia/contracts";
import { EXPLORE_AGENT_ALLOWED_TOOLS } from "../../../subagent/explore-tools.js";
import type { AgentRuntimeConfig } from "../../types.js";
import { normalizeToolNameAlias } from "../../../tool/tool-visibility.js";

const EXPLORE_AGENT_ALLOWED_TOOL_SET = new Set<string>(EXPLORE_AGENT_ALLOWED_TOOLS);

// 允许/禁用清单的统一形状。
type ToolAllowlist = readonly string[] | undefined;

// workflow child 结构性禁用名单：alwaysAsk 门（Create/Amend/Save）会挂隐形确认；编排复活
// （ResumeWorkflowRun）与代答升级问答（ResolveWorkflowQuestion）按不变式禁入——child 不得
// 再编排、也不得替创建方拍板。与 bootstrap 侧的 actor 名单刻意重复（双列先例）。
const WORKFLOW_CHILD_DISALLOWED_TOOLS = [
  CREATE_WORKFLOW_TOOL_NAME, // alwaysAsk 门
  AMEND_WORKFLOW_TOOL_NAME, // 同门嵌套编排
  SAVE_WORKFLOW_TOOL_NAME, // 同门保存
  RESUME_WORKFLOW_RUN_TOOL_NAME, // 编排复活
  RESOLVE_WORKFLOW_QUESTION_TOOL_NAME, // 代答升级问答
] as const;

// 运行时最终的工具禁用名单：workflow_child 叠加结构性禁用，其余原样透传 turn 级名单。
export function resolveRuntimeDisallowedTools(settings: AgentRuntimeConfig): ToolAllowlist {
  if (settings.taskType !== "workflow_child") return settings.toolDisallowlist;
  return [...new Set([...(settings.toolDisallowlist ?? []), ...WORKFLOW_CHILD_DISALLOWED_TOOLS])];
}

// 动态工作流灰度门：缺席即开启；显式 false 只由受信 Host 的 protocol session 写入。
export function resolveRuntimeDynamicWorkflowToolsIncluded(settings: AgentRuntimeConfig): boolean {
  return settings.dynamicWorkflowEnabled !== false;
}

export function resolveBuiltInToolAllowlist(settings: AgentRuntimeConfig): ToolAllowlist {
  const requested = normalizeBuiltInToolAllowlist(settings.toolAllowlist);
  const exploreBase = settings.toolset === "explore";
  const effective = exploreBase
    ? (requested?.filter((toolName) => EXPLORE_AGENT_ALLOWED_TOOL_SET.has(toolName)) ??
      EXPLORE_AGENT_ALLOWED_TOOLS)
    : requested;
  return appendChildControlTool(settings, effective);
}

// subagent_child 的控制工具补回：Explore 会在注册前再求交集，必须在最终结果补。
function appendChildControlTool(
  settings: AgentRuntimeConfig,
  allowlist: readonly string[] | undefined,
): ToolAllowlist {
  if (!allowlist) return allowlist;
  const needsChildControlTool =
    settings.taskType === "subagent_child" && !allowlist.includes(RESPOND_TO_COORDINATOR_TOOL_NAME);
  // workflow child 没有 allowlist 收窄（工具面只有减法），submit_result / escalate 由
  // includeSubmitResult / includeEscalate 两道门注册，这里不补回。
  return needsChildControlTool ? [...allowlist, RESPOND_TO_COORDINATOR_TOOL_NAME] : allowlist;
}

// 允许清单的别名归一：同义工具名收敛到规范名。
function normalizeBuiltInToolAllowlist(allowlist: readonly string[] | undefined): ToolAllowlist {
  return allowlist?.map((toolName) => normalizeToolNameAlias(toolName));
}
