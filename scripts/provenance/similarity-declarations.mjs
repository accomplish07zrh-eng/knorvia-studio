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
  const patterns = names.map((name) => linePattern(name));
  const kept = [];
  let removed = 0;
  for (const line of text.split(/\r?\n/u)) {
    if (patterns.some((pattern) => pattern.test(line))) removed += 1;
    else kept.push(line);
  }
  return { text: kept.join("\n"), removed };
}

/**
 * 一个契约名字匹配整行的正则。
 * 带点号的名字（`mcp.server.reconnect.failed`、`tool.permission.session_grant.applied`）
 * 必须整体匹配 —— 若按标识符拆分，`mcp` 这样的片段会剔除掉所有含 `mcp` 的行，造成灾难性误剔。
 * 纯标识符则按标识符边界匹配，避免 `id` 命中 `width`。
 */
function linePattern(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  if (name.includes(".")) return new RegExp(escaped, "u");
  return new RegExp(`(^|[^\\w$])${escaped}([^\\w$]|$)`, "u");
}

/**
 * 契约行剔除专用的名字提取：**只认表格行里的反引号片段**。
 *
 * 用户约束是「只认合同 `interface.md` 里逐条列出的导出名、事件名、错误码、字段名」——
 * 这些逐条清单在本仓库的 `interface.md` 里正是「模块路径 × 导出名」表格。
 * 因此不扫描正文段落（正文里的 `src/`、`apps/`、`legacy` 会把整份文件剔空），
 * 也不扫描 code fence（那里常含完整签名，会带出参数名与类型名）。
 *
 * 与 `extractDeclarationNames` 的第二个区别是**保留带点号的路径名**：
 * `` `mcp.server.reconnect.failed` `` 必须整体保留，否则拆成 `mcp` 后会剔掉所有含该词的行。
 */
export function extractContractNames(text) {
  const names = new Set();
  for (const line of text.split(/\r?\n/u)) {
    if (!line.trimStart().startsWith("|")) continue;
    for (const match of line.matchAll(/`([^`\n]+)`/gu)) {
      for (const token of match[1].matchAll(
        /[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+|[A-Za-z_$][\w$]*/gu,
      )) {
        const value = token[0];
        if (value.includes(".")) names.add(value);
        else if (!KEYWORDS.has(value)) names.add(value);
      }
    }
  }
  return [...names];
}

/**
 * 过于通用的短名白名单外护栏：这些词几乎出现在每一行，剔它们等于把文件删空。
 * 契约行剔除模式下直接拒绝（usage error），避免产出无意义的「剔除后为 0 行」。
 */
const TOO_GENERIC = new Set([
  "body",
  "code",
  "count",
  "data",
  "error",
  "event",
  "field",
  "index",
  "items",
  "key",
  "kind",
  "list",
  "message",
  "mode",
  "name",
  "path",
  "payload",
  "result",
  "size",
  "status",
  "text",
  "time",
  "type",
  "url",
  "value",
]);

/** 一个名字是否过于通用（短纯标识符且在白名单里）。 */
export function isTooGenericName(name) {
  return TOO_GENERIC.has(name) && name.length < 6;
}

/** 剔除后剩余行占比下限：低于此值说明剔过头了。 */
const MIN_RESIDUAL_RATIO = 0.2;

/** 契约名数量上限：超过说明提取偏宽（散散文里的词也被当成了名字）。 */
const MAX_CONTRACT_NAMES = 100;

/**
 * 契约行剔除：返回剔除结果与两个质量信号。
 * `suspiciousRatio`：剩余行不足原行数 20%（剔过头）；
 * `tooManyNames`：名字数超过上限（提取偏宽）。
 * 两者都只作为报告里的可疑标记，不改变门槛判定。
 */
export function stripContractLines(text, names) {
  const total = text.split(/\r?\n/u).length;
  const { text: stripped, removed } = stripDeclarationLines(text, names);
  const residual = stripped.split(/\r?\n/u).length;
  return {
    removed,
    residual,
    suspiciousRatio: total > 0 && residual / total < MIN_RESIDUAL_RATIO,
    text: stripped,
    tooManyNames: names.length > MAX_CONTRACT_NAMES,
    total,
  };
}

const DECLARATION_START =
  /^\s*(?:export\s+)?(?:declare\s+)?(interface|type|class|enum)\s+([A-Za-z_$][\w$]*)/u;
// `const` 声明块：zod schema、常量表、`as const` 枚举对象都是合同冻结面（名字由 interface.md
// 列出），与 interface/type/class/enum 同等对待；只按名字匹配，不做「剔除所有 const」的启发式。
const CONST_DECLARATION_START =
  /^\s*(?:export\s+)?(?:declare\s+)?const\s+([A-Za-z_$][\w$]*)\s*[:=]/u;

/**
 * 声明模式：按 interface.md 列出的名字定位**整块**声明（interface / type / class / enum，
 * 以及名字同样被列出的 `const` 声明块，含成员行与嵌套），整块剔除。
 * 只按名字精确匹配，不做启发式、不做通配。
 * 只应在 `--declaration --interface` 模式下调用；普通模式继续用 stripDeclarationLines。
 */
export function stripDeclarationBlocks(text, names) {
  const wanted = new Set(names);
  const lines = text.split(/\r?\n/u);
  const kept = [];
  let strippedBlocks = 0;
  let index = 0;
  while (index < lines.length) {
    const start = DECLARATION_START.exec(lines[index]);
    const constStart = start ? null : CONST_DECLARATION_START.exec(lines[index]);
    const name = start ? start[2] : constStart?.[1];
    if (!name || !wanted.has(name)) {
      kept.push(lines[index]);
      index += 1;
      continue;
    }
    const kind = start ? start[1] : "const";
    const end = findDeclarationEnd(lines, index, kind);
    if (kind === "const" && !isPureDataConst(lines.slice(index, end + 1).join("\n"))) {
      // 列名的 const 夹带函数、条件或计算：不享受声明豁免，整块照常计分。
      kept.push(...lines.slice(index, end + 1));
      index = end + 1;
      continue;
    }
    strippedBlocks += 1;
    index = end + 1;
  }
  return { text: kept.join("\n"), strippedBlocks };
}

/** 找到声明块的结束行：interface/class/enum 到花括号归零，type 与 const 到深度 0 且以分号结尾。 */
function findDeclarationEnd(lines, start, kind) {
  let depth = 0;
  let opened = false;
  for (let index = start; index < lines.length; index += 1) {
    for (const char of lines[index]) {
      if (char === "{" || char === "(" || char === "[") depth += 1;
      else if (char === "}" || char === ")" || char === "]") depth -= 1;
    }
    if (depth > 0) {
      opened = true;
      continue;
    }
    if (kind === "type" || kind === "const") {
      if (/;\s*$/u.test(lines[index])) return index;
      continue;
    }
    if (opened || /\}\s*;?\s*$/u.test(lines[index])) return index;
  }
  return lines.length - 1;
}

/** 允许出现在纯数据常量表里的调用：只做字面量收口，不做计算。 */
const PURE_DATA_CALLS = new Set(["Object.freeze"]);

/**
 * 纯数据常量：右侧只由字符串/数字/布尔/null 字面量、数组、对象、`as const`、
 * `satisfies`/类型注解、`Object.freeze(...)`，以及 zod 声明式构造链（`z.xxx(...).yyy(...)`，
 * 实参同样只能是字面量或 zod 构造）组成。
 * 出现箭头函数、function、条件、逻辑/算术运算、模板插值、展开或其他调用即不算纯数据；
 * 所以 `.refine(fn)` / `.transform(fn)` 这类夹带函数的 schema 仍照常计分。
 */
export function isPureDataConst(block) {
  const eq = block.search(/[^=!<>]=(?![=>])/u);
  if (eq < 0) return false;
  let body = block.slice(eq + 2);
  if (/\$\{/u.test(body)) return false;
  body = body
    .replace(/\/\/[^\n]*/gu, " ")
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`[^`$]*`/gu, " S ");
  // 负数字面量（`-1`）是数据；其余减号都算计算。
  body = body.replace(/([[(,:=]\s*)-(?=\s*\d)/gu, "$1");
  const operators = /=>|\bfunction\b|\?|&&|\|\||\.\.\.|\bnew\b|[-+*/%<>]/u;
  if (operators.test(body.replace(/\bas const\b/gu, " "))) return false;
  // zod 构造链：`z.object(`、`.strict(`、`.min(` 等声明式调用整体视作声明。
  const withoutZod = body.replace(/\bz(?:\s*\.\s*[A-Za-z_$][\w$]*)+\s*\(/gu, "(");
  const withoutChains = withoutZod.replace(/\)\s*\.\s*[A-Za-z_$][\w$]*\s*\(/gu, ")(");
  for (const call of withoutChains.matchAll(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/gu))
    if (!PURE_DATA_CALLS.has(call[1])) return false;
  if (/\.[A-Za-z_$]/u.test(withoutChains.replace(/Object\.freeze/gu, " "))) return false;
  return true;
}
