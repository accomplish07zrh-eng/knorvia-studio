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

/**
 * 路径形态的反引号内容是「模块路径」而不是「声明名」。
 * 必须在**提取之前**整段丢弃：一旦按标识符切分，`apps/cli/core` 会变成
 * `apps` / `cli` / `core` 三个看起来完全合法的标识符，路径信息就丢失了。
 */
const PATH_LIKE =
  /^[\w./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|yaml|yml)$|^[\w-]+(?:\/[\w.-]+)+$|^[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs)$/u;

/**
 * 路径词黑名单：这些词只会由「路径被切开」产生，本身不是任何声明名。
 * 放在提取后统一兜底 —— 因为 fence 里的路径形态太多（`core/src/runtime/{a,b}.ts`、
 * `export * from "./x/index.js"`），逐形态写正则必然漏。
 *
 * 刻意**不含 `index`**：实测 `contracts-02` 里有 `index?: number | undefined` 这样的真实字段名，
 * 拦截它会漏掉合法契约字段。带 `.ts` 后缀的 `index.ts` 已由 PATH_LIKE 在前一步整段丢弃。
 */
const PATH_FRAGMENT = new Set([
  "apps",
  "cjs",
  "cli",
  "contracts",
  "core",
  "dist",
  "js",
  "jsx",
  "mjs",
  "node",
  "packages",
  "specs",
  "src",
  "test",
  "tests",
  "ts",
  "tsx",
]);

/** 从 interface.md 提取兼容名字：反引号片段与代码块里的标识符，排除语言关键字与模块路径。 */
export function extractDeclarationNames(text) {
  const names = new Set();
  const collect = (span) => {
    for (const match of span.matchAll(/[A-Za-z_$][\w$]*/gu))
      if (!KEYWORDS.has(match[0])) names.add(match[0]);
  };
  // 模块路径整段丢弃，不让它被切成 `apps` / `cli` / `core` 这类碎片名。
  for (const match of text.matchAll(/`([^`\n]+)`/gu))
    if (!PATH_LIKE.test(match[1].trim())) collect(match[1]);
  for (const match of text.matchAll(/```[A-Za-z]*\n([\s\S]*?)```/gu)) {
    // 代码块内的路径字面量（如 import 说明）同样跳过，其余照常提取。
    for (const line of match[1].split(/\r?\n/u)) {
      const quoted = /^\s*[`'"]?[\w./-]+\.(?:ts|tsx|js|jsx|mjs|cjs)[`'"]?\s*$/u;
      if (!quoted.test(line)) collect(line);
    }
  }
  // 兜底：路径碎片一律剔除。它们不是声明名，留着会剥错声明块。
  return [...names].filter((name) => !PATH_FRAGMENT.has(name));
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

/** 形如 `name.ts` / `src/x/name.ts` 的模块单元格；用来定位表格的模块列。 */
const MODULE_CELL = /^`([^`]*\.ts)`$/u;

/** 把表格行拆成单元格（去掉源自行首/行尾 `|` 产生的空串）。 */
function tableCells(line) {
  const cells = line.split("|").map((cell) => cell.trim());
  return cells.slice(1, cells.length - 1);
}

/**
 * 解析 interface.md 的「模块 × 导出名」表格，返回每行的 { module, exportCell }。
 *
 * 本仓库的表格有三/四种列数（第一列都是模块名），所以不能写死「第 2 列」：
 *   4 列：| 模块 | 导出名 | 类型 | 是否公开 |   ← core-runtime-helpers-01 / methods-01 / methods-02
 *   3 列：| 模块 | 导出名 | 说明 |               ← core-03
 *   2 列：| 模块 | 说明（散文） |                ← core-hooks，第二列不是导出名
 * 做法：先定位模块列，再取它右边那一列；只有 2 列时那一列是说明文字，仍按反引号过滤。
 */
function tableRows(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/u)) {
    if (!line.trimStart().startsWith("|")) continue;
    const cells = tableCells(line);
    const moduleIndex = cells.findIndex((cell) => MODULE_CELL.test(cell));
    if (moduleIndex < 0) continue;
    rows.push({
      exportCell: cells[moduleIndex + 1] ?? "",
      module: MODULE_CELL.exec(cells[moduleIndex])[1],
    });
  }
  return rows;
}

/**
 * 从一个单元格里取出名字：带点号的整体保留，排除语言关键字与路径片段。
 *
 * 单元格不一定只列名字：`core-hooks/interface.md` 是 2 列表，第 2 列是散文
 * （`**必须**保留：`@knorvia/core` 的 `src/index.ts` 以 `export * from "./hooks/index.js"` 引出`），
 * 里面的反引号路径若不整段跳过，会被切成 `src` / `index` / `hooks` 等碎片名。
 */
function namesInCell(cell, names) {
  for (const match of cell.matchAll(/`([^`\n]+)`/gu)) {
    const span = match[1].trim();
    // 路径形态（含 / 或带 .ts/.js 后缀）整段丢弃，只留真正的标识符。
    if (span.includes("/") || /\.(?:ts|tsx|js|jsx|mjs|cjs)$/u.test(span)) continue;
    for (const token of span.matchAll(
      /[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+|[A-Za-z_$][\w$]*/gu,
    )) {
      const value = token[0];
      if (value.includes(".")) names.add(value);
      else if (!KEYWORDS.has(value)) names.add(value);
    }
  }
}

/**
 * 契约行剔除专用的名字提取：只取表格**导出名列**里的反引号名字。
 *
 * 为什么不扫整张表格：模块列里的 `attachment-artifacts.ts`、`src/workflow/definition.ts`
 * 会被切成 `attachment`/`src`/`workflow` 等词，随后 `src`、`core` 这类路径词会剔掉
 * 大量无关实现行。只取导出名列可以自然排除这些路径词。
 *
 * 也不扫描正文与 code fence（那里常含完整签名，会带出参数名与类型名）。
 * 带点号的路径名（`mcp.server.reconnect.failed`）整体保留，否则拆成 `mcp` 会误剔。
 *
 * `moduleFilter` 给出时只保留模块名匹配的行 —— 整包 interface.md 有数百条导出名，
 * 不过滤会剔掉邻居文件的契约行。
 */
export function extractContractNames(text, moduleFilter) {
  const names = new Set();
  for (const row of tableRows(text)) {
    if (moduleFilter && !moduleMatches(row.module, moduleFilter)) continue;
    namesInCell(row.exportCell, names);
  }
  return [...names];
}

/**
 * 模块匹配：精确相等，或一方是另一方的路径后缀，或 basename 相同。
 * 双向都试 —— 表格可能写全路径而命令行给 basename，反之亦然。
 */
function moduleMatches(moduleName, filter) {
  const normalize = (value) => value.replaceAll("\\", "/");
  const left = normalize(moduleName);
  const right = normalize(filter);
  if (left === right) return true;
  if (left.endsWith(`/${right}`) || right.endsWith(`/${left}`)) return true;
  const baseOf = (value) => value.slice(value.lastIndexOf("/") + 1);
  return baseOf(left) === baseOf(right) && baseOf(left).length > 0;
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
 * 一行是否「仅由契约名与标点组成」。
 *
 * 用户裁决（2026-10-21）：**只有整行仅由清单名与标点组成才剔除**；
 * zod schema 等含构造代码的行属于实现，照常计分。
 *
 * 判据：把该行里所有清单名挖掉后，剩下的只能是标点与空白。于是：
 *   `  entry: ToolEntry;`             → 挖掉 entry/ToolEntry → `  : ;`      → 剔除
 *   `  code: z.string(),`             → 挖掉 code          → `: z.string()` → 含 z.string，不剔除
 *   `  sessionId: request.sessionId,` → 挖掉 sessionId     → `: request.`   → 含 request，不剔除
 *
 * `names` 须按长度降序使用，避免短名先命中破坏长名（先挖 `Tool` 会让 `ToolEntry` 对不上）。
 */
function isContractOnlyLine(line, names) {
  if (!line.trim()) return false;
  let rest = line;
  for (const name of names) {
    if (!rest.includes(name)) continue;
    rest = rest.split(name).join(" ");
  }
  // 剩下只能是标点与空白；否则说明还有构造代码或未列名的标识符。
  if (!/^[\s{}()[\]<>;:,|&?=.!*'"`/\\#@+-]*$/u.test(rest)) return false;
  // 必须真的挖掉过东西，否则「空行/纯标点行」也会被误判为契约行。
  return rest.length < line.length;
}

/**
 * 契约行剔除（严格版）：只剔除「仅由契约名与标点组成」的整行。
 *
 * 与 `stripDeclarationLines` 的区别：后者只要行内出现契约名就剔除，
 * 会把 `code: z.string(),` 这类含 zod 构造的实现行也剔掉。
 * 本函数按用户裁决收紧为「整行仅由清单名与标点组成」，实现行照常计分。
 */
export function stripContractOnlyLines(text, names) {
  const ordered = [...names].sort((a, b) => b.length - a.length);
  const kept = [];
  let removed = 0;
  for (const line of text.split(/\r?\n/u)) {
    if (isContractOnlyLine(line, ordered)) removed += 1;
    else kept.push(line);
  }
  return { text: kept.join("\n"), removed };
}

/**
 * 契约行剔除：返回剔除结果与两个质量信号。
 * `suspiciousRatio`：剩余行不足原行数 20%（剔过头）；
 * `tooManyNames`：名字数超过上限（提取偏宽）。
 * 两者都只作为报告里的可疑标记，不改变门槛判定。
 */
export function stripContractLines(text, names) {
  const total = text.split(/\r?\n/u).length;
  const { text: stripped, removed } = stripContractOnlyLines(text, names);
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
