// SPDX-License-Identifier: Apache-2.0
// 工具允许/禁用清单的兼容面（B37）：实现见 ./tooling/allowlist-rules.js。
import * as allowlist from "./tooling/allowlist-rules.js";

export const resolveRuntimeDisallowedTools = allowlist.resolveRuntimeDisallowedTools;
export const resolveRuntimeDynamicWorkflowToolsIncluded =
  allowlist.resolveRuntimeDynamicWorkflowToolsIncluded;
export const resolveBuiltInToolAllowlist = allowlist.resolveBuiltInToolAllowlist;
