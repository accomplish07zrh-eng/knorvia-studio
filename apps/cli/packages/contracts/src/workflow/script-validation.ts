// SPDX-License-Identifier: Apache-2.0
// 脚本工作流元数据的校验（实现逻辑，不属兼容面；行为由契约测试 B1 与 workflow 契约覆盖）。
//
// 组织方式（替换阶段的自主决定）：旧实现把重复标题检查写在 schema 的 superRefine 回调里，
// 这里抽成具名纯函数，回调只负责把问题转成 zod issue——规则可以单独测试，schema 定义也只剩声明。
export interface ScriptMetaIssue {
  message: string;
  path: (string | number)[];
}

interface ScriptMetaShape {
  phases: readonly { title: string }[];
}

// 阶段标题在一次脚本元数据里必须唯一；重复出现时对**每一次重复**都报一条 issue，
// path 指向具体数组下标（与旧实现逐字一致）。
export function collectScriptMetaIssues(meta: ScriptMetaShape): ScriptMetaIssue[] {
  const seenTitles = new Set<string>();
  const issues: ScriptMetaIssue[] = [];
  meta.phases.forEach((phase, index) => {
    if (seenTitles.has(phase.title)) {
      issues.push({
        message: `Duplicate workflow phase title: ${phase.title}`,
        path: ["phases", index, "title"],
      });
      return;
    }
    seenTitles.add(phase.title);
  });
  return issues;
}
