// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  createInvalidTypeIssue,
  createInvalidUnionIssue,
  createInvalidValueIssue,
  createTooBigIssue,
  createTooSmallIssue,
  type ToolInputValidationIssue,
} from "../tool-input-validation-issues.js";
import { issuePath, record, type Frame } from "./frame.js";

type Origin = "string" | "number" | "array";
interface Limit {
  key: string;
  origin: Origin;
  minimum: boolean;
  inclusive: boolean;
}

const LIMITS: readonly Limit[] = [
  { key: "minLength", origin: "string", minimum: true, inclusive: true },
  { key: "maxLength", origin: "string", minimum: false, inclusive: true },
  { key: "minimum", origin: "number", minimum: true, inclusive: true },
  { key: "maximum", origin: "number", minimum: false, inclusive: true },
  { key: "exclusiveMinimum", origin: "number", minimum: true, inclusive: false },
  { key: "exclusiveMaximum", origin: "number", minimum: false, inclusive: false },
  { key: "minItems", origin: "array", minimum: true, inclusive: true },
  { key: "maxItems", origin: "array", minimum: false, inclusive: true },
];

const TYPES: Readonly<Record<string, (value: unknown) => boolean>> = {
  array: Array.isArray,
  boolean: (value) => typeof value === "boolean",
  integer: Number.isInteger,
  null: (value) => value === null,
  number: (value) => typeof value === "number" && Number.isFinite(value),
  object: record,
  string: (value) => typeof value === "string",
};

function matches(value: unknown, type: unknown): boolean {
  const pending = [type];
  const visited = new Set<unknown>();
  while (pending.length) {
    const item = pending.pop();
    if (Array.isArray(item)) {
      if (!visited.has(item)) {
        visited.add(item);
        item.forEach((member) => pending.push(member));
      }
    } else {
      const predicate =
        typeof item === "string" && Object.hasOwn(TYPES, item) ? TYPES[item] : undefined;
      if (!predicate || predicate(value)) return true;
    }
  }
  return false;
}

export function valueAndType(frame: Frame): boolean {
  const { value, schema, display, diagnostics, trail } = frame;
  let rejectedValue = false;
  if ("const" in schema && !Object.is(value, schema.const)) {
    diagnostics.errors.push(`${display} must be ${JSON.stringify(schema.const)}`);
    diagnostics.issues.push(createInvalidValueIssue([schema.const], issuePath(trail)));
    rejectedValue = true;
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => Object.is(item, value))) {
    diagnostics.errors.push(
      `${display} must be one of ${schema.enum.map((item) => JSON.stringify(item)).join(", ")}`,
    );
    diagnostics.issues.push(createInvalidValueIssue(schema.enum, issuePath(trail)));
    rejectedValue = true;
  }
  if (schema.type === undefined || matches(value, schema.type)) return true;
  const label = Array.isArray(schema.type)
    ? schema.type.map(String).join(" or ")
    : String(schema.type);
  diagnostics.errors.push(`${display} must be ${label}`);
  // enum/const 已说明值不被接受；保留旧 errors，但不重复改变模型侧问题分类。
  if (!rejectedValue) {
    diagnostics.issues.push(
      Array.isArray(schema.type)
        ? createInvalidUnionIssue(
            schema.type.map((candidate) => [createInvalidTypeIssue(value, candidate, [])]),
            issuePath(trail),
          )
        : createInvalidTypeIssue(value, schema.type, issuePath(trail)),
    );
  }
  return false;
}

function errorText(display: string, rule: Limit, bound: number): string {
  if (rule.origin === "number") {
    const operator = `${rule.minimum ? ">" : "<"}${rule.inclusive ? "=" : ""}`;
    return `${display} must be ${operator} ${bound}`;
  }
  const comparison = rule.minimum ? "at least" : "at most";
  return rule.origin === "array"
    ? `${display} must contain ${comparison} ${bound} items`
    : `${display} must be ${comparison} ${bound} characters`;
}

export function bounds(frame: Frame, origin: Origin, amount: number): ToolInputValidationIssue[] {
  const issues: ToolInputValidationIssue[] = [];
  for (const rule of LIMITS) {
    const bound = frame.schema[rule.key];
    if (rule.origin !== origin || typeof bound !== "number") continue;
    const outside = rule.minimum
      ? rule.inclusive
        ? amount < bound
        : amount <= bound
      : rule.inclusive
        ? amount > bound
        : amount >= bound;
    if (!outside) continue;
    frame.diagnostics.errors.push(errorText(frame.display, rule, bound));
    // 严格边界原先被遗漏，导致无效 REPL 预算延后到 handler 才拒绝；此处与 schema 一致。
    const create = rule.minimum ? createTooSmallIssue : createTooBigIssue;
    issues.push(create(origin, bound, issuePath(frame.trail), { inclusive: rule.inclusive }));
  }
  return issues;
}
