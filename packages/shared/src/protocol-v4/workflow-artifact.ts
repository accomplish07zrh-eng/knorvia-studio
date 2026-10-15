// SPDX-License-Identifier: Apache-2.0
// 脚本产物 → 面向模型/读者的文本。工作流脚本顶层返回值、report(item) 的条目都走这里换算。
// 规则固定：undefined 交回 undefined（调用方据此让整个字段缺席）；字符串原样；其余值用两空格
// 缩进的 JSON。JSON.stringify 对函数/symbol/undefined 会回 undefined、对循环引用会抛错——这两种
// 退化路径一律退回 String(value)，绝不把值整段丢掉。产物形状不受约束（record/数组/字符串/数字/
// null 都合法），因此这里不设长度上限：截断属于各自的边界（完成通知、TaskOutput、投影各自限长）。
export function serializeWorkflowArtifact(payload: unknown): string | undefined {
  const sort = typeof payload;
  if (sort === "undefined") return undefined;
  if (sort === "string") return payload as string;

  let rendered: string | undefined;
  try {
    rendered = JSON.stringify(payload, null, 2);
  } catch {
    // 循环引用等：退回可读的字符串表示，不向上抛。
    return String(payload);
  }

  // stringify 回 undefined（function / symbol）时同样退回 String(payload)。
  return rendered === undefined ? String(payload) : rendered;
}
