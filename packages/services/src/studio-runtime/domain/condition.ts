const MAX_LENGTH = 2000;
const MAX_TOKENS = 256;
const MAX_DEPTH = 12;
const FORBIDDEN_FIELDS = new Set(["__proto__", "prototype", "constructor"]);

export interface StudioConditionScope {
  input: string;
  output: string;
  nodes: Readonly<Record<string, string>>;
}
type Literal = string | number | boolean | null;
type Operand =
  | { kind: "literal"; value: Literal }
  | { kind: "reference"; name: string; path: string[] };
type Condition =
  | { kind: "compare"; left: Operand; operator?: string; right?: Operand }
  | { kind: "and"; left: Condition; right: Condition }
  | { kind: "or"; left: Condition; right: Condition };
interface Token {
  type: "literal" | "reference" | "operator";
  value: string;
  literal?: Literal;
}

function tokenize(source: string): Token[] {
  if (!source.trim() || source.length > MAX_LENGTH)
    throw new Error("Condition must contain 1–2000 characters.");
  const tokens: Token[] = [];
  const pattern =
    /\s+|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\{\{[^{}\r\n]+\}\}(?:\.[A-Za-z_][\w-]*)*|(?:input|output)(?:\.[A-Za-z_][\w-]*)*\b|(?:true|false|null)\b|-?(?:\d+(?:\.\d+)?)(?:[eE][+-]?\d+)?|(?:contains|equals)\b|&&|\|\||==|!=|>=|<=|[><()]/gy;
  let offset = 0;
  while (offset < source.length) {
    pattern.lastIndex = offset;
    const match = pattern.exec(source);
    if (!match) throw new Error(`Unsupported condition syntax at character ${offset + 1}.`);
    const value = match[0];
    offset = pattern.lastIndex;
    if (!value.trim()) continue;
    if (tokens.length >= MAX_TOKENS) throw new Error("Condition has too many terms.");
    if (value.startsWith('"') || value.startsWith("'")) {
      let literal: unknown;
      try {
        literal = value.startsWith('"')
          ? JSON.parse(value)
          : JSON.parse(
              '"' +
                value
                  .slice(1, -1)
                  .replace(/\\'/g, "'")
                  .replace(/(?<!\\)"/g, '\\"') +
                '"',
            );
      } catch {
        throw new Error("Invalid condition string literal.");
      }
      tokens.push({ type: "literal", value, literal: literal as string });
    } else if (/^(true|false|null|-?\d)/.test(value)) {
      const literal = JSON.parse(value) as Literal;
      if (typeof literal === "number" && !Number.isFinite(literal))
        throw new Error("Condition numbers must be finite.");
      tokens.push({ type: "literal", value, literal });
    } else
      tokens.push({ type: /^(input|output|\{\{)/.test(value) ? "reference" : "operator", value });
  }
  return tokens;
}

function reference(value: string): Operand {
  const match = /^(?:\{\{([^{}]+)\}\}|(input|output))((?:\.[A-Za-z_][\w-]*)*)$/.exec(value);
  if (!match) throw new Error("Invalid condition reference.");
  const name = (match[1] ?? match[2])!.trim();
  const path = match[3]!.split(".").filter(Boolean);
  if (
    !name ||
    name.length > 200 ||
    path.length > MAX_DEPTH ||
    [name, ...path].some((field) => FORBIDDEN_FIELDS.has(field))
  )
    throw new Error("Unsafe or excessive condition path.");
  return { kind: "reference", name, path };
}

export function parseStudioCondition(source: string): Condition {
  const tokens = tokenize(source);
  let cursor = 0;
  const take = (value: string) => {
    if (tokens[cursor]?.value !== value) return false;
    cursor++;
    return true;
  };
  const operand = (): Operand => {
    const token = tokens[cursor++];
    if (token?.type === "literal") return { kind: "literal", value: token.literal! };
    if (token?.type === "reference") return reference(token.value);
    throw new Error("Expected input, output, {{nodeId}}, or a literal value.");
  };
  const primary = (depth: number): Condition => {
    if (depth > MAX_DEPTH) throw new Error("Condition nesting is too deep.");
    if (take("(")) {
      const result = or(depth + 1);
      if (!take(")")) throw new Error("Missing closing condition parenthesis.");
      return result;
    }
    const left = operand();
    const operator = tokens[cursor]?.value;
    if (operator && ["==", "!=", ">", "<", ">=", "<=", "equals", "contains"].includes(operator)) {
      cursor++;
      return { kind: "compare", left, operator, right: operand() };
    }
    return { kind: "compare", left };
  };
  const and = (depth: number): Condition => {
    let left = primary(depth);
    while (take("&&")) left = { kind: "and", left, right: primary(depth) };
    return left;
  };
  const or = (depth: number): Condition => {
    let left = and(depth);
    while (take("||")) left = { kind: "or", left, right: and(depth) };
    return left;
  };
  const result = or(0);
  if (cursor !== tokens.length) throw new Error("Unexpected condition token.");
  return result;
}

export function studioConditionReferences(source: string): string[] {
  const names = new Set<string>();
  const visit = (condition: Condition) => {
    if (condition.kind !== "compare") {
      visit(condition.left);
      visit(condition.right);
      return;
    }
    for (const value of [condition.left, condition.right])
      if (value?.kind === "reference" && value.name !== "input" && value.name !== "output")
        names.add(value.name);
  };
  visit(parseStudioCondition(source));
  return [...names];
}

function resolve(operand: Operand, scope: StudioConditionScope): unknown {
  if (operand.kind === "literal") return operand.value;
  const { name, path } = operand;
  let value: unknown =
    name === "input"
      ? scope.input
      : name === "output"
        ? scope.output
        : Object.hasOwn(scope.nodes, name)
          ? scope.nodes[name]
          : undefined;
  if (value === undefined) throw new Error(`Condition references unavailable node: ${name}.`);
  if (!path.length) return value;
  try {
    value = JSON.parse(value as string);
  } catch {
    throw new Error(`Condition reference ${name} is not JSON.`);
  }
  for (const field of path) {
    if (typeof value !== "object" || value === null || !Object.hasOwn(value, field))
      throw new Error(`Condition field is unavailable: ${name}.${path.join(".")}.`);
    value = (value as Record<string, unknown>)[field];
  }
  return value;
}

export function evaluateStudioCondition(source: string, scope: StudioConditionScope): boolean {
  const evaluate = (condition: Condition): boolean => {
    if (condition.kind === "and") return evaluate(condition.left) && evaluate(condition.right);
    if (condition.kind === "or") return evaluate(condition.left) || evaluate(condition.right);
    const left = resolve(condition.left, scope);
    if (!condition.operator) {
      if (typeof left !== "boolean")
        throw new Error("A condition without comparison must be boolean.");
      return left;
    }
    const right = resolve(condition.right!, scope);
    if (condition.operator === "contains") {
      if (typeof left !== "string" || typeof right !== "string")
        throw new Error("contains requires two strings.");
      return left.includes(right);
    }
    if (["==", "equals", "!="].includes(condition.operator)) {
      if (
        (typeof left === "object" && left !== null) ||
        (typeof right === "object" && right !== null)
      )
        throw new Error("Equality comparisons require scalar values.");
      return condition.operator === "!=" ? left !== right : left === right;
    }
    if (typeof left !== "number" || typeof right !== "number")
      throw new Error("Ordered comparisons require two numbers.");
    return condition.operator === ">"
      ? left > right
      : condition.operator === ">="
        ? left >= right
        : condition.operator === "<"
          ? left < right
          : left <= right;
  };
  return evaluate(parseStudioCondition(source));
}
