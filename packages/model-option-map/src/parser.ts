import { RestrictedCelError, type ModelOptionName } from "./types.js";
import type { RestrictedCelToken } from "./tokenizer.js";

export type RestrictedCelExpression =
  | {
      readonly type: "literal";
      readonly value: string | number | boolean | null;
      readonly offset: number;
    }
  | { readonly type: "input"; readonly offset: number }
  | {
      readonly type: "array";
      readonly elements: readonly RestrictedCelExpression[];
      readonly offset: number;
    }
  | {
      readonly type: "object";
      readonly entries: readonly {
        readonly key: string;
        readonly value: RestrictedCelExpression;
        readonly offset: number;
      }[];
      readonly offset: number;
    }
  | {
      readonly type: "unary";
      readonly operator: "!" | "-" | "+";
      readonly operand: RestrictedCelExpression;
      readonly offset: number;
    }
  | {
      readonly type: "binary";
      readonly operator: string;
      readonly left: RestrictedCelExpression;
      readonly right: RestrictedCelExpression;
      readonly offset: number;
    }
  | {
      readonly type: "conditional";
      readonly condition: RestrictedCelExpression;
      readonly whenTrue: RestrictedCelExpression;
      readonly whenFalse: RestrictedCelExpression;
      readonly offset: number;
    };

const precedence = new Map<string, number>([
  ["||", 1], ["&&", 2], ["==", 3], ["!=", 3],
  ["<", 4], ["<=", 4], [">", 4], [">=", 4],
  ["+", 5], ["-", 5], ["*", 6], ["/", 6], ["%", 6],
]);

type ObjectEntry = Extract<RestrictedCelExpression, { type: "object" }>["entries"][number];

export function parseRestrictedCel(
  tokens: readonly RestrictedCelToken[],
  variableName: ModelOptionName,
): RestrictedCelExpression {
  let position = 0;
  const current = (): RestrictedCelToken => tokens[position] ?? tokens[tokens.length - 1]!;
  const take = (): RestrictedCelToken => {
    const token = current();
    if (token.kind !== "eof") position += 1;
    return token;
  };
  const accept = (value: string): boolean => {
    if (current().value !== value) return false;
    position += 1;
    return true;
  };
  const expect = (value: string): void => {
    if (!accept(value)) throw new RestrictedCelError(`expected ${JSON.stringify(value)}`, current().offset);
  };
  const unexpected = (token: RestrictedCelToken): never => {
    throw new RestrictedCelError(`unexpected token ${JSON.stringify(token.value)}`, token.offset);
  };

  function expression(): RestrictedCelExpression {
    const condition = binary(1);
    if (!accept("?")) return condition;
    const whenTrue = expression();
    expect(":");
    const whenFalse = expression();
    return { type: "conditional", condition, whenTrue, whenFalse, offset: condition.offset };
  }

  function binary(minimum: number): RestrictedCelExpression {
    let left = unary();
    while (current().kind === "operator") {
      const priority = precedence.get(current().value);
      if (priority === undefined || priority < minimum) break;
      const operator = take();
      left = {
        type: "binary", operator: operator.value, left,
        right: binary(priority + 1), offset: operator.offset,
      };
    }
    return left;
  }

  function unary(): RestrictedCelExpression {
    const token = current();
    if (token.kind !== "operator" || !["!", "-", "+"].includes(token.value)) return atom();
    take();
    return {
      type: "unary", operator: token.value as "!" | "-" | "+",
      operand: unary(), offset: token.offset,
    };
  }

  function atom(): RestrictedCelExpression {
    const token = take();
    if (token.kind === "number") {
      const value = Number(token.value);
      if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
        throw new RestrictedCelError("number literal is not JSON-safe", token.offset);
      }
      return { type: "literal", value, offset: token.offset };
    }
    if (token.kind === "string") return { type: "literal", value: token.value, offset: token.offset };
    if (token.kind === "identifier") {
      if (current().value === "(") {
        throw new RestrictedCelError("function calls are not supported", current().offset);
      }
      if (token.value === variableName) return { type: "input", offset: token.offset };
      if (token.value === "null") return { type: "literal", value: null, offset: token.offset };
      if (token.value === "true" || token.value === "false") {
        return { type: "literal", value: token.value === "true", offset: token.offset };
      }
      throw new RestrictedCelError(`unknown identifier ${JSON.stringify(token.value)}`, token.offset);
    }
    if (token.value === "(") { const value = expression(); expect(")"); return value; }
    if (token.value === "[") {
      const elements: RestrictedCelExpression[] = [];
      if (!accept("]")) {
        do { elements.push(expression()); } while (accept(","));
        expect("]");
      }
      return { type: "array", elements: Object.freeze(elements), offset: token.offset };
    }
    if (token.value === "{") {
      const entries: ObjectEntry[] = [];
      const keys = new Set<string>();
      if (!accept("}")) {
        do {
          const key = take();
          if (key.kind !== "string") throw new RestrictedCelError("object keys must be string literals", key.offset);
          if (keys.has(key.value)) {
            throw new RestrictedCelError(`duplicate object key ${JSON.stringify(key.value)}`, key.offset);
          }
          keys.add(key.value);
          expect(":");
          entries.push({ key: key.value, value: expression(), offset: key.offset });
        } while (accept(","));
        expect("}");
      }
      return { type: "object", entries: Object.freeze(entries), offset: token.offset };
    }
    return unexpected(token);
  }

  const result = expression();
  const trailing = current();
  if (trailing.kind === "eof") return result;
  if (trailing.value === ".") throw new RestrictedCelError("member access is not supported", trailing.offset);
  if (trailing.value === "(") throw new RestrictedCelError("function calls are not supported", trailing.offset);
  return unexpected(trailing);
}
