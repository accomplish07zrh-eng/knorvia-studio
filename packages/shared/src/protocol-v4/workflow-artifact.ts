// SPDX-License-Identifier: Apache-2.0
// 脚本产物 → 面向模型/读者的文本。工作流脚本顶层返回值、report(item) 的条目都走这里换算。
// 规则固定：undefined 交回 undefined（调用方据此让整个字段缺席）；字符串原样；其余值用两空格
// 缩进的 JSON。JSON.stringify 对函数/symbol/undefined 会回 undefined、对循环引用会抛错——这两种
// 退化路径一律退回 String(value)，绝不把值整段丢掉。产物形状不受约束（record/数组/字符串/数字/
// null 都合法），因此这里不设长度上限：截断属于各自的边界（完成通知、TaskOutput、投影各自限长）。
// 两空格缩进是渲染契约的一部分：产物文本进模型上下文，缩进宽度与完成通知的预览口径一致。
const ARTIFACT_JSON_INDENT = 2;

export function serializeWorkflowArtifact(payload: unknown): string | undefined {
  const sort = typeof payload;
  if (sort === "undefined") return undefined;
  if (sort === "string") return payload as string;

  let rendered: string | undefined;
  try {
    // stringify 回 undefined（function / symbol）时当场退回可读文本表示。
    rendered = JSON.stringify(payload, null, ARTIFACT_JSON_INDENT) ?? String(payload);
  } catch {
    // 循环引用等抛错形态：同样收敛到 String，绝不把值整段丢掉。
    rendered = String(payload);
  }
  return rendered;
}
