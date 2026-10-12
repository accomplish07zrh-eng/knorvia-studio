// SPDX-License-Identifier: Apache-2.0
// AskUserQuestion 的 provider-visible schema 调整（实现逻辑，不属兼容面）。
//
// 背景：provider 可见的 schema 里 multiSelect 带 default false，却仍然出现在 required 中；
// 运行时 zod 的 default 继续允许旧调用省略该字段。这里只调整投影出来的 JSON schema 副本，
// 不改变运行时 schema 的任何行为。
// 按路径取一段嵌套 JSON schema 片段；路径中间不是普通对象就返回 undefined。
function readSchemaPath(schema: Record<string, unknown>, path: readonly string[]): unknown {
  let cursor: unknown = schema;
  for (const segment of path) {
    const isPlainObject = typeof cursor === "object" && cursor !== null && !Array.isArray(cursor);
    if (!isPlainObject) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

export function withRequiredDefaultedMultiSelect<T extends Record<string, unknown>>(schema: T): T {
  const questionsProperty = readSchemaPath(schema, ["properties", "questions", "items"]);
  if (!questionsProperty || typeof questionsProperty !== "object") return schema;
  const required = (questionsProperty as Record<string, unknown>).required;
  if (!Array.isArray(required)) return schema;
  // 只补一次：已经列出 multiSelect 的 schema 原样返回。
  if (!required.includes("multiSelect")) required.push("multiSelect");
  return schema;
}
