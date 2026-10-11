// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 纯声明文件的兼容行剔除：按 interface.md 列出的名字先剔除兼容行，再算两道门槛。

const KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "boolean",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "declare",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "keyof",
  "let",
  "never",
  "new",
  "null",
  "number",
  "object",
  "of",
  "readonly",
  "return",
  "static",
  "string",
  "super",
  "switch",
  "symbol",
  "this",
  "throw",
  "true",
  "try",
  "type",
  "typeof",
  "undefined",
  "unknown",
  "var",
  "void",
  "while",
  "yield",
]);

/** 从 interface.md 提取兼容名字：反引号片段与代码块里的标识符，排除语言关键字。 */
export function extractDeclarationNames(text) {
  const names = new Set();
  const collect = (span) => {
    for (const match of span.matchAll(/[A-Za-z_$][\w$]*/gu))
      if (!KEYWORDS.has(match[0])) names.add(match[0]);
  };
  for (const match of text.matchAll(/`([^`\n]+)`/gu)) collect(match[1]);
  for (const match of text.matchAll(/```[A-Za-z]*\n([\s\S]*?)```/gu)) collect(match[1]);
  return [...names];
}

/** 兼容行 = 含 interface.md 所列名字（按标识符边界匹配）的行。 */
export function stripDeclarationLines(text, names) {
  const patterns = names.map(
    (name) =>
      new RegExp(`(^|[^\\w$])${name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}([^\\w$]|$)`, "u"),
  );
  const kept = [];
  let removed = 0;
  for (const line of text.split(/\r?\n/u)) {
    if (patterns.some((pattern) => pattern.test(line))) removed += 1;
    else kept.push(line);
  }
  return { text: kept.join("\n"), removed };
}
