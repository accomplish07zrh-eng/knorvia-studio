// SPDX-License-Identifier: Apache-2.0
// 兼容面：bash 权限规则求值的输入形状（兼容声明块）与公开函数。
// 求值实现已重组于 bash-exec/rule-evaluation.ts，本模块路径的导出不变。
import type { PermissionRuleBehavior, PermissionRuleValue } from "@knorvia/contracts";

export { evaluateBashRules } from "./bash-exec/rule-evaluation.js";

export interface BashRuleEvaluationInput {
  allSubjectGroups: readonly (readonly string[])[];
  behavior: PermissionRuleBehavior;
  exactCommands: readonly string[];
  requiredSubjectGroups: readonly (readonly string[])[];
  rules: readonly PermissionRuleValue[];
  safe: boolean;
}
