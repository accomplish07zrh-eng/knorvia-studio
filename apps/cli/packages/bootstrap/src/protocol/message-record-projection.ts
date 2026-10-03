// 显式键集合避免对结果联合逐个分发；每个字段仍严格绑定自己的 Result[Key]。
export type RecordRecipe<Source, Result, Keys extends keyof Result = keyof Result> = readonly {
  [Key in Keys]-?: readonly [Key, (source: Source) => Result[Key]];
}[Keys][];

// 字段 recipe 同时规定存在性、求值顺序和插入次序；undefined 不会被省略。
export function projectRecord<Source, Result extends object>(
  source: Source,
  recipe: RecordRecipe<Source, Result>,
): Result {
  const result = {} as Result;
  for (const [key, read] of recipe) result[key] = read(source);
  return result;
}

export function omitOwnMetadata(
  metadata: Record<string, unknown> | undefined,
  fields: readonly string[],
): Record<string, unknown> | undefined {
  let visible = metadata;
  for (const field of fields) {
    if (!visible || !Object.prototype.hasOwnProperty.call(visible, field)) continue;
    // 先浅拷贝再删键，保留 getters / symbols 的既有读取与枚举行为。
    const projected = { ...visible };
    delete projected[field];
    visible = projected;
  }
  return visible;
}
