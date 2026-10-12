// SPDX-License-Identifier: Apache-2.0
// 工作流定义的交叉字段校验（实现逻辑，不属兼容面；行为由契约测试 B9 与 B1 覆盖）。
//
// 组织方式（替换阶段的自主决定）：旧实现把四类校验写在同一个 superRefine 回调里顺序执行，
// 这里改成「一次遍历收集问题列表」的纯函数，回调只负责把问题转成 zod issue。这样校验规则
// 可以单独测试，也不会因为新增规则继续加深回调嵌套。
//
// 规则与顺序（与旧实现一致，zod issue 的顺序是调用方可见的）：
//   1. phases 里重复出现的阶段定义 → path ["phases"]；
//   2. phaseOrder 里重复出现的条目 → path ["phaseOrder"]；
//   3. phaseOrder 引用未在 phases 中定义的阶段 → path ["phaseOrder"]；
//   4. phases 中定义的阶段没有出现在 phaseOrder → path ["phases"]。

// 问题条目的形状只在本文件里用（调用方按 path 转成 zod issue），不进公开面。
interface WorkflowDefinitionIssue {
  message: string;
  path: ["phases"] | ["phaseOrder"];
}

interface DefinitionShape {
  phaseOrder: readonly string[];
  phases: readonly { phase: string }[];
}

export function collectWorkflowDefinitionIssues(
  definition: DefinitionShape,
): WorkflowDefinitionIssue[] {
  const issues: WorkflowDefinitionIssue[] = [];
  const definedPhases = new Set<string>();
  for (const { phase } of definition.phases) {
    if (definedPhases.has(phase)) {
      issues.push({
        message: `Duplicate workflow phase definition: ${phase}`,
        path: ["phases"],
      });
    }
    definedPhases.add(phase);
  }

  const orderedPhases = new Set<string>();
  for (const phase of definition.phaseOrder) {
    if (orderedPhases.has(phase)) {
      issues.push({
        message: `Duplicate workflow phase order entry: ${phase}`,
        path: ["phaseOrder"],
      });
    }
    orderedPhases.add(phase);
    if (!definedPhases.has(phase)) {
      issues.push({
        message: `Workflow phaseOrder references unknown phase: ${phase}`,
        path: ["phaseOrder"],
      });
    }
  }

  for (const phase of definedPhases) {
    if (!orderedPhases.has(phase)) {
      issues.push({
        message: `Workflow phase definition is missing from phaseOrder: ${phase}`,
        path: ["phases"],
      });
    }
  }

  return issues;
}
