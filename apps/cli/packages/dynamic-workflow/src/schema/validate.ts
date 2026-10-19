// SPDX-License-Identifier: Apache-2.0
// Knorvia dynamic-workflow schema validation engine.
// Evaluates candidate JSON payloads against synthesized schema specifications.

import type { JsonSchema, JsonSchemaType, Violation } from "./types.js";
import { formatSummary, isEqualJson } from "./value-describer.js";

// 对单个违规记录进行文本排版。
export function formatViolation(violation: Violation): string {
  return `${violation.path}: expected ${violation.expected}, got ${violation.got}`;
}

// 批量格式化违规记录，条目之间以换行连接。
export function formatViolations(violations: readonly Violation[]): string {
  return violations.map((v) => formatViolation(v)).join("\n");
}

function verifyTypeMatch(expected: JsonSchemaType, val: unknown): boolean {
  if (expected === "null") return val === null;
  if (expected === "array") return Array.isArray(val);
  if (expected === "object") return typeof val === "object" && val !== null && !Array.isArray(val);
  if (expected === "integer" || expected === "number") {
    return typeof val === "number" && Number.isFinite(val);
  }
  return typeof val === expected;
}

class SchemaValidator {
  readonly violations: Violation[] = [];

  constructor(private readonly root: JsonSchema) {}

  addViolation(path: string, expected: string, got: string): void {
    this.violations.push({ path, expected, got });
  }

  validate(schema: JsonSchema, value: unknown, path: string): void {
    if (schema.$ref !== undefined) {
      const captured = /^#\/\$defs\/(.+)$/.exec(schema.$ref);
      const target = captured ? this.root.$defs?.[captured[1]!] : undefined;
      if (target === undefined) {
        this.addViolation(path, `schema ${schema.$ref}`, "unresolved $ref");
      } else {
        this.validate(target, value, path);
      }
    } else if ("const" in schema) {
      if (!isEqualJson(value, schema.const)) {
        this.addViolation(path, formatSummary(schema.const), formatSummary(value));
      }
    } else if (schema.enum !== undefined) {
      const allowed = schema.enum;
      if (!allowed.some((candidate) => isEqualJson(value, candidate))) {
        const repr = allowed.map((opt) => formatSummary(opt)).join(", ");
        this.addViolation(path, `one of ${repr}`, formatSummary(value));
      }
    } else if (schema.anyOf !== undefined) {
      const variants = schema.anyOf;
      const matched = variants.some((alt) => {
        const subInspector = new SchemaValidator(this.root);
        subInspector.validate(alt, value, path);
        return subInspector.violations.length === 0;
      });
      if (!matched) {
        this.addViolation(path, `one of ${variants.length} variants`, formatSummary(value));
      }
    } else if (schema.type !== undefined && !this.checkTypes(schema.type, value)) {
      const typeDisplay = Array.isArray(schema.type) ? schema.type.join(" | ") : schema.type;
      this.addViolation(path, typeDisplay, formatSummary(value));
    } else {
      this.checkDetails(schema, value, path);
    }
  }

  private checkTypes(kind: JsonSchemaType | JsonSchemaType[], value: unknown): boolean {
    const list = Array.isArray(kind) ? kind : [kind];
    return list.some((tag) => verifyTypeMatch(tag, value));
  }

  private checkDetails(schema: JsonSchema, value: unknown, path: string): void {
    if (schema.type === "object") {
      this.inspectObject(schema, value as Record<string, unknown>, path);
    } else if (schema.type === "array") {
      this.inspectArray(schema, value as unknown[], path);
    }

    if (typeof value === "string") {
      this.inspectString(schema, value, path);
    } else if (typeof value === "number") {
      this.inspectNumber(schema, value, path);
    }
  }

  private inspectObject(schema: JsonSchema, value: Record<string, unknown>, path: string): void {
    const required = schema.required;
    if (required && required.length > 0) {
      for (const reqKey of required) {
        if (!Object.hasOwn(value, reqKey)) {
          this.addViolation(`${path}.${reqKey}`, "present", "missing");
        }
      }
    }

    const specProperties = schema.properties;
    const extraPolicy = schema.additionalProperties;
    for (const [propName, propVal] of Object.entries(value)) {
      const targetPropSchema = specProperties?.[propName];
      const subLocation = `${path}.${propName}`;
      if (targetPropSchema) {
        this.validate(targetPropSchema, propVal, subLocation);
      } else if (extraPolicy === false) {
        this.addViolation(subLocation, "no additional property", formatSummary(propVal));
      } else if (typeof extraPolicy === "object" && extraPolicy !== null) {
        this.validate(extraPolicy, propVal, subLocation);
      }
    }
  }

  private inspectArray(schema: JsonSchema, value: unknown[], path: string): void {
    const count = value.length;
    const minCount = schema.minItems;
    if (minCount !== undefined && count < minCount) {
      this.addViolation(path, `at least ${minCount} items`, `array(${count})`);
    }
    const maxCount = schema.maxItems;
    if (maxCount !== undefined && count > maxCount) {
      this.addViolation(path, `at most ${maxCount} items`, `array(${count})`);
    }

    const prefixList = schema.prefixItems;
    if (prefixList) {
      const pLen = prefixList.length;
      for (let i = 0; i < count; i += 1) {
        const elemPath = `${path}[${i}]`;
        const elemSchema = i < pLen ? prefixList[i] : schema.items;
        if (elemSchema) {
          this.validate(elemSchema, value[i], elemPath);
        }
      }
    } else if (schema.items) {
      const itemSchema = schema.items;
      for (let i = 0; i < count; i += 1) {
        this.validate(itemSchema, value[i], `${path}[${i}]`);
      }
    }
  }

  private inspectString(schema: JsonSchema, value: string, path: string): void {
    const size = value.length;
    const minSize = schema.minLength;
    if (minSize !== undefined && size < minSize) {
      this.addViolation(path, `string length >= ${minSize}`, `length ${size}`);
    }
    const maxSize = schema.maxLength;
    if (maxSize !== undefined && size > maxSize) {
      this.addViolation(path, `string length <= ${maxSize}`, `length ${size}`);
    }
    const patternStr = schema.pattern;
    if (patternStr !== undefined) {
      const rx = new RegExp(patternStr);
      if (!rx.test(value)) {
        this.addViolation(path, `match /${patternStr}/`, formatSummary(value));
      }
    }
  }

  private inspectNumber(schema: JsonSchema, value: number, path: string): void {
    if (schema.type === "integer" && !Number.isInteger(value)) {
      this.addViolation(path, "integer", `number ${value}`);
    }
    const min = schema.minimum;
    if (min !== undefined && value < min) {
      this.addViolation(path, `>= ${min}`, `number ${value}`);
    }
    const max = schema.maximum;
    if (max !== undefined && value > max) {
      this.addViolation(path, `<= ${max}`, `number ${value}`);
    }
    const exMin = schema.exclusiveMinimum;
    if (exMin !== undefined && value <= exMin) {
      this.addViolation(path, `> ${exMin}`, `number ${value}`);
    }
    const exMax = schema.exclusiveMaximum;
    if (exMax !== undefined && value >= exMax) {
      this.addViolation(path, `< ${exMax}`, `number ${value}`);
    }
  }
}

// 核心校验入口，返回所有检测到的违规项。
export function validate(schema: JsonSchema, value: unknown): Violation[] {
  const validator = new SchemaValidator(schema);
  validator.validate(schema, value, "$");
  return validator.violations;
}
