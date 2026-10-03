import type { RestrictedCelExpression } from "./parser.js";
import { RestrictedCelError, type JsonObject, type JsonValue, type RestrictedCelValue } from "./types.js";

type Sink = (value: JsonValue) => void;
type BinaryExpression = Extract<RestrictedCelExpression, { type: "binary" }>;

export function evaluateRestrictedCel(expression: RestrictedCelExpression, input: RestrictedCelValue): JsonValue {
  if (typeof input === "number") safeNumber(input, expression.offset);
  else if (typeof input !== "string") {
    throw new RestrictedCelError("input value must be a string or number", expression.offset);
  }
  const tasks: (() => void)[] = [];
  let result!: JsonValue;
  function schedule(node: RestrictedCelExpression, receive: Sink): void {
    tasks.push(() => {
      switch (node.type) {
        case "literal": receive(node.value); return;
        case "input": receive(input); return;
        case "unary":
          schedule(node.operand, value => {
            if (node.operator === "!") receive(!booleanValue(value, node.offset));
            else {
              const number = numericValue(value, node.offset);
              receive(safeNumber(node.operator === "-" ? -number : number, node.offset));
            }
          });
          return;
        case "conditional":
          schedule(node.condition, value => {
            schedule(booleanValue(value, node.condition.offset) ? node.whenTrue : node.whenFalse, receive);
          });
          return;
        case "binary":
          schedule(node.left, left => {
            if (node.operator === "&&" || node.operator === "||") {
              const truth = booleanValue(left, node.left.offset);
              if ((node.operator === "&&" && !truth) || (node.operator === "||" && truth)) receive(truth);
              else schedule(node.right, right => receive(booleanValue(right, node.right.offset)));
            } else schedule(node.right, right => receive(binaryValue(node, left, right)));
          });
          return;
        case "array": {
          const values = node.elements.map(() => undefined as unknown as JsonValue);
          const visits = node.elements.map((element, index) => () => schedule(element, value => { values[index] = value; }));
          tasks.push(() => receive(values));
          for (let index = visits.length - 1; index >= 0; index -= 1) {
            if (index in visits) tasks.push(visits[index]!);
          }
          return;
        }
        case "object": {
          const values = Object.create(null) as Record<string, JsonValue>;
          tasks.push(() => receive(values));
          for (let index = node.entries.length - 1; index >= 0; index -= 1) {
            const entry = node.entries[index]!;
            tasks.push(() => schedule(entry.value, value => {
              Object.defineProperty(values, entry.key, { value, enumerable: true, configurable: true, writable: true });
            }));
          }
          return;
        }
      }
    });
  }
  schedule(expression, value => { result = value; });
  while (tasks.length) tasks.pop()!();
  return sealJson(result);
}

function binaryValue(expression: BinaryExpression, left: JsonValue, right: JsonValue): JsonValue {
  const operator = expression.operator;
  if (operator === "==" || operator === "!=") {
    const equal = equalJson(left, right);
    return operator === "==" ? equal : !equal;
  }
  if (["<", "<=", ">", ">="].includes(operator)) {
    if (typeof left !== typeof right || (typeof left !== "number" && typeof left !== "string")) {
      throw new RestrictedCelError("comparison operands must have the same numeric or string type", expression.offset);
    }
    const ordering = typeof left === "number" && typeof right === "number"
      ? left < right ? -1 : left > right ? 1 : 0
      : String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0;
    if (operator === "<") return ordering < 0;
    if (operator === "<=") return ordering <= 0;
    if (operator === ">") return ordering > 0;
    return ordering >= 0;
  }
  if (operator === "+" && typeof left === "string" && typeof right === "string") return left + right;
  if (!["+", "-", "*", "/", "%"].includes(operator)) {
    throw new RestrictedCelError(`unsupported operator ${operator}`, expression.offset);
  }
  const a = numericValue(left, expression.left.offset);
  const b = numericValue(right, expression.right.offset);
  let value: number;
  switch (operator) {
    case "+": value = a + b; break;
    case "-": value = a - b; break;
    case "*": value = a * b; break;
    case "/": value = a / b; break;
    default: value = a % b;
  }
  return safeNumber(value, expression.offset);
}

function booleanValue(value: JsonValue, offset: number): boolean {
  if (typeof value === "boolean") return value;
  throw new RestrictedCelError("boolean operand required", offset);
}

function numericValue(value: JsonValue, offset: number): number {
  if (typeof value === "number") return value;
  throw new RestrictedCelError("numeric operand required", offset);
}

function safeNumber(value: number, offset: number): number {
  if (Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))) return value;
  throw new RestrictedCelError("numeric result is not JSON-safe", offset);
}

function jsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function equalJson(left: JsonValue, right: JsonValue): boolean {
  const pending: [JsonValue, JsonValue][] = [[left, right]];
  while (pending.length) {
    const [a, b] = pending.pop()!;
    if (Object.is(a, b)) continue;
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      for (let index = a.length - 1; index >= 0; index -= 1) {
        if (index in a) pending.push([a[index]!, b[index]!]);
      }
    } else if (jsonObject(a) && jsonObject(b)) {
      const keys = Object.keys(a);
      if (keys.length !== Object.keys(b).length) return false;
      for (let index = keys.length - 1; index >= 0; index -= 1) {
        const key = keys[index]!;
        if (!Object.hasOwn(b, key)) return false;
        pending.push([a[key]!, b[key]!]);
      }
    } else return false;
  }
  return true;
}

function sealJson(value: JsonValue): JsonValue {
  const tasks: (() => void)[] = [];
  function visit(entry: JsonValue): void {
    if (!Array.isArray(entry) && !jsonObject(entry)) return;
    tasks.push(() => { Object.freeze(entry); });
    const children = Array.isArray(entry) ? Array.from(entry) : Object.values(entry);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      tasks.push(() => visit(children[index]!));
    }
  }
  visit(value);
  while (tasks.length) tasks.pop()!();
  return value;
}
