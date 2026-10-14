// SPDX-License-Identifier: Apache-2.0
// 工具可见性规则的兼容面：实现见 ./internal/tool-visibility-rules.js。
// 模块路径与导出名保持不变；规则解析与过滤的语义见实现文件头部。
import * as rules from "./internal/tool-visibility-rules.js";

export const normalizeToolNameAlias = rules.normalizeToolNameAlias;
export const createToolRuleNameSet = rules.createToolRuleNameSet;
export const isToolNameDisallowed = rules.isToolNameDisallowed;
export const filterDisallowedToolNames = rules.filterDisallowedToolNames;
