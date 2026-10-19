// SPDX-License-Identifier: Apache-2.0
// 脚本产物 → 面向模型/读者的文本。工作流脚本顶层返回值、report(item) 的条目都走这里换算。
// 规则固定：undefined 交回 undefined（调用方据此让整个字段缺席）；字符串原样；其余值用两空格
// 缩进的 JSON。JSON.stringify 对函数/symbol 这类值会回 undefined——此时退回 String(payload)；
// 对循环引用、BigInt 等会抛错——此时退回 stringifyFallback 里同一条 String 路径。两种退化都
// 绝不把值整段丢掉。产物形状不受约束（record/数组/字符串/数字/null 都合法），因此这里不设
// 长度上限：截断属于各自的边界（完成通知、TaskOutput、投影各自限长）。
export function serializeWorkflowArtifact(payload: unknown): string | undefined {
  if (typeof payload === "undefined") return undefined;
  if (typeof payload === "string") return payload as string;
  const rendered = tryStringify(payload);
  return rendered ?? String(payload);
}

// 两空格 JSON 的一次尝试；抛错（循环引用等）时交给同文件的退化读法。
function tryStringify(input: unknown): string | undefined {
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return stringifyFallback(input);
  }
}

// 抛错路径的退化文本：与函数/symbol 路径一样收敛到 String，保证不向上抛。
function stringifyFallback(raw: unknown): string {
  return String(raw);
}