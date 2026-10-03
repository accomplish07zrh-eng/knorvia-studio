import { evaluateRestrictedCel } from "./evaluator.js";
import { parseRestrictedCel, type RestrictedCelExpression } from "./parser.js";
import { tokenizeRestrictedCel } from "./tokenizer.js";
import {
  RestrictedCelError, type JsonObject, type ModelOptionName, type ModelOptionMapProgram,
  type RestrictedCelProgram, type RestrictedCelValue,
} from "./types.js";

interface CompiledSource {
  readonly expression: RestrictedCelExpression;
  restricted?: RestrictedCelProgram;
  objectMap?: ModelOptionMapProgram;
}
const sources = new Map<string, CompiledSource>();

function sourceEntry(source: string, variableName: ModelOptionName): [string, CompiledSource] {
  const normalized = source.trim();
  if (!normalized.length) throw new RestrictedCelError("expression must not be empty", 0);
  const key = `${variableName}\0${normalized}`;
  let entry = sources.get(key);
  if (!entry) {
    entry = { expression: parseRestrictedCel(tokenizeRestrictedCel(normalized), variableName) };
    sources.set(key, entry);
  }
  return [normalized, entry];
}

export function compileRestrictedCel(source: string, variableName: ModelOptionName): RestrictedCelProgram {
  const [normalized, entry] = sourceEntry(source, variableName);
  if (!entry.restricted) {
    entry.restricted = Object.freeze({
      source: normalized,
      evaluate: (input: RestrictedCelValue) => evaluateRestrictedCel(entry.expression, input),
    });
  }
  return entry.restricted;
}

export function compileModelOptionMap(source: string, variableName: ModelOptionName): ModelOptionMapProgram {
  const [normalized, entry] = sourceEntry(source, variableName);
  if (entry.objectMap) return entry.objectMap;
  const pending = [entry.expression];
  while (pending.length) {
    const expression = pending.pop()!;
    if (expression.type === "object") continue;
    if (expression.type !== "conditional") {
      throw new RestrictedCelError("model option map must return a JSON object", expression.offset);
    }
    pending.push(expression.whenFalse, expression.whenTrue);
  }
  entry.objectMap = Object.freeze({
    source: normalized,
    evaluate(input: RestrictedCelValue): JsonObject {
      const value = evaluateRestrictedCel(entry.expression, input);
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new RestrictedCelError("model option map must return a JSON object", 0);
      }
      return value as JsonObject;
    },
  });
  return entry.objectMap;
}
