// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { parseScript } from "meriyah";

/** Pure compilation result; the caller owns execution, state, imports and cancellation. */
export interface CompiledReplCell {
  source: string;
  topLevelBindings: readonly string[];
}

type SyntaxNode = { type: string; start: number; end: number; [key: string]: unknown };
type Edit = { from: number; to: number; text: string };
const PARSE_PREFIX = "async function __knorvia_parse_cell__() {\n";
const PARSE_SUFFIX = "\n}";
const IMPORT_KEYWORD_LENGTH = "import".length;
const SCOPE_PREFIX = "__knorviaCellScope";

function node(value: unknown): SyntaxNode | undefined {
  if (value === null || typeof value !== "object" || !("type" in value)) return undefined;
  return typeof value.type === "string" ? (value as SyntaxNode) : undefined;
}

function nodes(value: unknown): SyntaxNode[] {
  return Array.isArray(value) ? value.flatMap((entry) => node(entry) ?? []) : [];
}

function visit(value: unknown, observe: (item: SyntaxNode) => void): void {
  if (Array.isArray(value)) {
    for (const child of value) visit(child, observe);
    return;
  }
  const item = node(value);
  if (!item) return;
  observe(item);
  for (const child of Object.values(item)) {
    if (Array.isArray(child) || node(child)) visit(child, observe);
  }
}

function bindingNames(pattern: unknown): string[] {
  const item = node(pattern);
  if (!item) return [];
  switch (item.type) {
    case "Identifier":
      return typeof item.name === "string" ? [item.name] : [];
    case "AssignmentPattern":
      return bindingNames(item.left);
    case "RestElement":
      return bindingNames(item.argument);
    case "ArrayPattern":
      return nodes(item.elements).flatMap(bindingNames);
    case "ObjectPattern":
      return nodes(item.properties).flatMap((property) =>
        bindingNames(property.type === "RestElement" ? property.argument : property.value),
      );
    default:
      return [];
  }
}

function declarationBindings(statement: SyntaxNode): string[] {
  if (statement.type === "VariableDeclaration") {
    return nodes(statement.declarations).flatMap((declaration) => bindingNames(declaration.id));
  }
  return ["FunctionDeclaration", "ClassDeclaration"].includes(statement.type)
    ? bindingNames(statement.id)
    : [];
}

function applyEdits(source: string, edits: Edit[]): string {
  const pieces: string[] = [];
  let position = 0;
  // 同一位置先插入再替换，保证最后表达式本身是 import() 时仍返回加载结果。
  for (const edit of edits.sort((a, b) => a.from - b.from || a.to - b.to)) {
    if (edit.from < position || edit.to < edit.from || edit.to > source.length) {
      throw new Error("Overlapping or invalid REPL compilation edits");
    }
    pieces.push(source.slice(position, edit.from), edit.text);
    position = edit.to;
  }
  pieces.push(source.slice(position));
  return pieces.join("");
}

/** Compile one async script from its grammar, without executing or inspecting the context. */
export function compileReplCell(source: string): CompiledReplCell {
  const parsed = parseScript(`${PARSE_PREFIX}${source}${PARSE_SUFFIX}`, {
    next: true,
    ranges: true,
  });
  const declaration = node(parsed.body[0]);
  const body = node(declaration?.body);
  if (
    !body ||
    parsed.body.length !== 1 ||
    body.end !== PARSE_PREFIX.length + source.length + PARSE_SUFFIX.length
  ) {
    throw new SyntaxError("Invalid REPL cell boundary");
  }
  const statements = nodes(body.body);
  const identifiers = new Set<string>();
  const imports: SyntaxNode[] = [];
  visit(body, (item) => {
    if (item.type === "Identifier" && typeof item.name === "string") identifiers.add(item.name);
    if (item.type === "ImportExpression") imports.push(item);
  });
  let suffix = 0;
  while (identifiers.has(`${SCOPE_PREFIX}${suffix}`)) suffix++;
  const scope = `${SCOPE_PREFIX}${suffix}`;
  const offset = (position: number) => position - PARSE_PREFIX.length;
  const edits: Edit[] = imports.map((item) => ({
    from: offset(item.start),
    to: offset(item.start) + IMPORT_KEYWORD_LENGTH,
    text: `${scope}.importModule`,
  }));
  const bindings: string[] = [];
  for (const statement of statements) {
    const names = declarationBindings(statement);
    if (!names.length) continue;
    bindings.push(...names);
    edits.push({
      from: offset(statement.end),
      to: offset(statement.end),
      text: `;${names.map((name) => `${scope}[${JSON.stringify(name)}]=${name};`).join("")}`,
    });
  }
  const last = statements.at(-1);
  if (last?.type === "ExpressionStatement") {
    const end = offset(last.end);
    // expression 的范围可能不含外层括号；在 statement 边界返回，避免生成 `(return ...)`。
    edits.push({ from: offset(last.start), to: offset(last.start), text: "return (" });
    edits.push({ from: source[end - 1] === ";" ? end - 1 : end, to: end, text: ");" });
  }
  const transformed = applyEdits(source, edits);
  return {
    source: `(async (${scope}) => {\n${transformed}\n})(globalThis)`,
    topLevelBindings: [...new Set(bindings)],
  };
}
