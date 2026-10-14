// SPDX-License-Identifier: Apache-2.0
// 子代理档案的 frontmatter 解析：Markdown 头部分割 + 宽松 YAML 子集。
// 只认「键: 标量」「键: 内联数组/对象」「键: 换行后的 - 列表」三种形态；解析不出来一律降级成
// 字符串或 null，绝不抛——档案文件是用户手写的，坏一行不该让整个子代理加载失败。
const FRONTMATTER_FENCE = "---";
const MCP_SERVERS_KEY = "mcpServers";
const LIST_ITEM_PATTERN = /^\s*-\s+(.*)$/u;
const INDENTED_LINE_PATTERN = /^\s+/u;
const KEY_VALUE_PATTERN = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/u;
const MAPPING_ENTRY_PATTERN = /^[^:]+:(?:\s|$)/u;
const DIGITS_PATTERN = /^\d+$/u;
const NUMBER_LITERAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu;
const NULL_LITERAL_PATTERN = /^(?:null|~)$/iu;
const BOOLEAN_LITERAL_PATTERN = /^(?:true|false)$/iu;
const WHITESPACE_PATTERN = /\s/u;
const NOT_CONFIGURED = undefined;
const INVALID_MCP_NAMES = null;
const EMPTY_LIST: unknown[] = [];

interface SplitFrontmatterResult {
  body: string;
  frontmatter?: string;
}

interface LooseFrontmatter {
  bareKeys: Set<string>;
  nestedListKeys: Set<string>;
  values: Record<string, unknown>;
}

interface McpNamesInput {
  isConfigured: boolean;
  hasBareValue: boolean;
  hasInvalidNestedValue: boolean;
  value: unknown;
}

function isQuotedScalar(value: string): boolean {
  const doubleQuoted = value.startsWith('"') && value.endsWith('"');
  const singleQuoted = value.startsWith("'") && value.endsWith("'");
  return doubleQuoted || singleQuoted;
}

function isBracketedList(value: string): boolean {
  return value.startsWith("[") && value.endsWith("]");
}

function isBracedMapping(value: string): boolean {
  return value.startsWith("{") && value.endsWith("}");
}

// 头部分割：没有 --- 围栏、或围栏没闭合时，整篇都算正文。
export function splitMarkdownFrontmatter(content: string): SplitFrontmatterResult {
  const text = content.replace(/^\uFEFF/u, "");
  if (!text.startsWith(FRONTMATTER_FENCE)) {
    return { body: text };
  }

  const rows = text.split(/\r?\n/u);
  if (rows[0]?.trim() !== FRONTMATTER_FENCE) return { body: text };
  const closingIndex = rows.findIndex(
    (row, index) => index > 0 && row.trim() === FRONTMATTER_FENCE,
  );
  if (closingIndex < 0) return { body: text };

  return {
    frontmatter: rows.slice(1, closingIndex).join("\n"),
    body: rows.slice(closingIndex + 1).join("\n"),
  };
}

interface ParsedAgentFrontmatter {
  mcpServers: string[] | null | undefined;
  values: Record<string, unknown>;
}

export function parseAgentFrontmatter(frontmatter: string): ParsedAgentFrontmatter {
  const loose = parseLooseFrontmatter(frontmatter);
  if (loose.bareKeys.has("tools")) {
    delete loose.values.tools;
  }
  const mcpServers = parseMcpServerNames({
    isConfigured: Object.prototype.hasOwnProperty.call(loose.values, MCP_SERVERS_KEY),
    hasBareValue: loose.bareKeys.has(MCP_SERVERS_KEY),
    hasInvalidNestedValue: loose.nestedListKeys.has(MCP_SERVERS_KEY),
    value: loose.values[MCP_SERVERS_KEY],
  });
  const parsed: ParsedAgentFrontmatter = { mcpServers: mcpServers, values: loose.values };
  return parsed;
}

// 列表项续行：并进当前键的数组；mcpServers 的每一项要按 server 名单项规则解析。
function appendListItem(loose: LooseFrontmatter, key: string, rawItem: string): void {
  loose.bareKeys.delete(key);
  if (key === MCP_SERVERS_KEY && isUnquotedMappingValue(rawItem)) loose.nestedListKeys.add(key);
  const existing = Array.isArray(loose.values[key]) ? (loose.values[key] as unknown[]) : [];
  const parsed =
    key === MCP_SERVERS_KEY ? parseMcpServerListItem(rawItem) : parseScalarValue(rawItem);
  loose.values[key] = [...existing, parsed];
}

// 键值行：空值开一个待续列表并记入 bare；mcpServers 的内联 mapping 单独记一笔。
// 返回新的「待续列表键」。
function applyKeyValue(loose: LooseFrontmatter, entry: RegExpExecArray): string | undefined {
  const key = entry[1]!;
  const rawValue = entry[2] ?? "";
  const isBareKey = rawValue.trim().length === 0;
  if (isBareKey) {
    loose.values[key] = EMPTY_LIST.slice();
    loose.bareKeys.add(key);
    return key;
  }
  if (key === MCP_SERVERS_KEY && hasUnquotedInlineMappingItem(rawValue)) {
    loose.nestedListKeys.add(key);
  }
  loose.values[key] = parseScalarValue(rawValue, key === MCP_SERVERS_KEY);
  return undefined;
}

function parseLooseFrontmatter(frontmatter: string): LooseFrontmatter {
  const loose: LooseFrontmatter = {
    bareKeys: new Set<string>(),
    nestedListKeys: new Set<string>(),
    values: {},
  };
  const rows = frontmatter.split(/\r?\n/u);
  const meaningfulLines = rows
    .map((rawLine) => rawLine.trimEnd())
    .filter((line) => line.trim().length > 0 && !line.trimStart().startsWith("#"));
  let openListKey: string | undefined;

  for (const line of meaningfulLines) {
    const listItem = LIST_ITEM_PATTERN.exec(line);
    if (listItem && openListKey) {
      appendListItem(loose, openListKey, listItem[1] ?? "");
    } else if (openListKey && INDENTED_LINE_PATTERN.test(line)) {
      // 块状 mapping 不是 server-name 列表：不能被空数组吞掉后扩大 child MCP scope。
      loose.nestedListKeys.add(openListKey);
      openListKey = undefined;
    } else {
      openListKey = undefined;
      const entry = KEY_VALUE_PATTERN.exec(line);
      if (entry) openListKey = applyKeyValue(loose, entry);
    }
  }

  return loose;
}

// 三种结果：没配置 → undefined；配置了但形态可疑（裸值/嵌套列表/非字符串/空白名）→ null；否则给名单。
function parseMcpServerNames(input: McpNamesInput): string[] | null | undefined {
  if (!input.isConfigured) return NOT_CONFIGURED;
  if (!Array.isArray(input.value) || input.hasBareValue || input.hasInvalidNestedValue) {
    return INVALID_MCP_NAMES;
  }

  const serverNames: string[] = [];
  for (const item of input.value) {
    if (typeof item !== "string") return INVALID_MCP_NAMES;
    const name = item.trim();
    if (name.length === 0) return INVALID_MCP_NAMES;
    serverNames.push(name);
  }
  return serverNames;
}

// 内联数组里有没有「看起来是 mapping 的裸项」（{"a":1} 或 a: 1）——有的话整条 mcpServers 判可疑。
function hasUnquotedInlineMappingItem(rawValue: string): boolean {
  const value = stripInlineComment(rawValue.trim());
  if (!isBracketedList(value)) return false;
  const items = splitTopLevelList(value.slice(1, -1), true);
  return items.some(isUnquotedMappingValue);
}

function isUnquotedMappingValue(rawValue: string): boolean {
  const value = stripInlineComment(rawValue.trim());
  if (isQuotedScalar(value)) return false;
  if (isBracedMapping(value)) return true;
  return MAPPING_ENTRY_PATTERN.test(value);
}

// 列表项里的 server 名：引号包裹的按标量去引号；数组/null/布尔/数字按 YAML 语义归一；其余原样。
function parseMcpServerListItem(rawValue: string): unknown {
  const text = stripInlineComment(rawValue.trim());
  if (isQuotedScalar(text)) return unquoteScalar(text);
  if (isBracketedList(text)) return INVALID_MCP_NAMES;
  if (NULL_LITERAL_PATTERN.test(text)) return INVALID_MCP_NAMES;
  if (BOOLEAN_LITERAL_PATTERN.test(text)) return text.toLowerCase() === "true";
  if (NUMBER_LITERAL_PATTERN.test(text)) return Number(text);
  return text;
}

function parseScalarValue(rawValue: string, parseInlineItemScalars = false): unknown {
  const text = stripInlineComment(rawValue.trim());
  if (text === "true") return true;
  if (text === "false") return false;
  if (DIGITS_PATTERN.test(text)) return Number(text);
  if (isBracketedList(text)) {
    const items = splitTopLevelList(
      text.slice(1, -1),
      parseInlineItemScalars,
      parseInlineItemScalars,
    );
    return items.map((item) =>
      parseInlineItemScalars
        ? parseMcpServerListItem(item)
        : unquoteScalar(stripInlineComment(item.trim())),
    );
  }
  if (isBracedMapping(text)) {
    try {
      const parsed: unknown = JSON.parse(text);
      return parsed;
    } catch {
      return text;
    }
  }
  return unquoteScalar(text);
}

// 去掉行尾注释：只认「引号外 + 前面是空白」的 #；引号本身按成对切换，转义的反斜杠不算开引号。
function stripInlineComment(value: string): string {
  let openQuote: string | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const previous = value[index - 1];
    if ((char === '"' || char === "'") && previous !== "\\") {
      openQuote = openQuote === char ? undefined : (openQuote ?? char);
    }
    if (!openQuote && char === "#" && WHITESPACE_PATTERN.test(previous ?? "")) {
      return value.slice(0, index).trimEnd();
    }
  }
  return value;
}

function unquoteScalar(value: string): string {
  if (isQuotedScalar(value)) return value.slice(1, -1);
  return value;
}

// 顶层逗号切分：引号内与括号内的逗号不算分隔符；trackContainerDepth 打开后 {} 与 [] 也参与深度。
function splitTopLevelList(
  value: string,
  trackContainerDepth = false,
  preserveEmptyItems = false,
): string[] {
  const items: string[] = [];
  let buffer = "";
  let openQuote: string | undefined;
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;

  for (const char of value) {
    if ((char === '"' || char === "'") && !openQuote) {
      openQuote = char;
      buffer += char;
      continue;
    }
    if (openQuote === char) {
      openQuote = undefined;
      buffer += char;
      continue;
    }
    if (!openQuote) {
      if (char === "(") parenDepth += 1;
      else if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
      else if (trackContainerDepth && char === "{") braceDepth += 1;
      else if (trackContainerDepth && char === "}") braceDepth = Math.max(0, braceDepth - 1);
      else if (trackContainerDepth && char === "[") bracketDepth += 1;
      else if (trackContainerDepth && char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    }
    const atTopLevel = parenDepth === 0 && braceDepth === 0 && bracketDepth === 0;
    if (!openQuote && atTopLevel && char === ",") {
      if (buffer.trim() || preserveEmptyItems) items.push(buffer.trim());
      buffer = "";
      continue;
    }
    buffer += char;
  }

  if (buffer.trim()) items.push(buffer.trim());
  return items;
}
