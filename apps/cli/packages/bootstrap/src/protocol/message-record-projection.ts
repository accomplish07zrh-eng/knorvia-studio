export type RecordRecipe<Source, Result> = readonly {
  [Key in keyof Result]-?: readonly [Key, (source: Source) => Result[Key]];
}[keyof Result][];

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
