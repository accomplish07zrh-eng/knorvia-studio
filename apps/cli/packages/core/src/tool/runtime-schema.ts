// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

type Result = { success: true; data: unknown } | { success: false; error?: unknown };
type Parser = (input: unknown) => Result;

export function runtimeParser(
  schema: unknown,
  stage: "input" | "output" = "input",
): Parser | undefined {
  if (schema === null || typeof schema !== "object") return undefined;
  const source = schema as { safeParse?: unknown };
  const method = source.safeParse;
  if (typeof method !== "function") return undefined;
  // 输入旧路径拆出 safeParse 后丢失 this；输入与输出都应以声明该方法的 schema 为 receiver。
  // 输出原契约在能力检查后再次取方法，不能复用第一次读取而误接受已变化的校验器。
  return (input) =>
    Reflect.apply(stage === "input" ? method : (source.safeParse as Parser), schema, [
      input,
    ]) as Result;
}
