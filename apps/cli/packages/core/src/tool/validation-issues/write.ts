// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type {
  ToolInputValidationIssue as Issue,
  ToolInputValidationPath as Path,
} from "./protocol.js";

type Code = Issue["code"];
const FIELDS: Record<Code, readonly string[]> = {
  invalid_type: ["expected", "format?", "code", "received?", "path", "message"],
  invalid_value: ["code", "values", "path", "message"],
  unrecognized_keys: ["code", "keys", "path", "message"],
  too_small: ["origin", "code", "minimum", "inclusive", "exact?", "path", "message"],
  too_big: ["origin", "code", "maximum", "inclusive", "exact?", "path", "message"],
  invalid_union: ["code", "errors", "path", "message"],
  custom: ["code", "path", "message"],
  invalid_format: ["origin?", "code", "format", "pattern?", "path", "message"],
};

export function writeIssue<C extends Code>(
  code: C,
  path: Path,
  data: Readonly<Record<string, unknown>>,
  message: () => string,
): Extract<Issue, { code: C }> {
  const output: Record<string, unknown> = {};
  for (const field of FIELDS[code]) {
    const optional = field.endsWith("?");
    const key = optional ? field.slice(0, -1) : field;
    // 字段存在性已由工厂决定；getter 二次读取为 undefined 时也必须保留该字段。
    if (optional && !Object.hasOwn(data, key)) continue;
    let value =
      key === "code" ? code : key === "path" ? path : key === "message" ? message() : data[key];
    // 稀疏列表的副本应稠密化，但不能提前复制后再用副本计算文案；union errors 保留原引用。
    if (key === "path" || key === "values" || key === "keys") value = [...(value as unknown[])];
    output[key] = value;
  }
  // 字段由上面的封闭协议表写入；动态顺序编码在这里恢复对应公开诊断类型。
  return output as unknown as Extract<Issue, { code: C }>;
}
