// SPDX-License-Identifier: Apache-2.0
// Knorvia dynamic-workflow schema engine type definitions.
// Defines JSON schema primitives and validation error models used by the workflow compiler.

// 支持的 JSON 字面量类型集合。
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

// 发射层与校验器支持的基元类型标签。
export type JsonSchemaType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null"
  | "array"
  | "object";

// 结构化 schema 描述对象，覆盖类型标签、组合逻辑、边界约束与 JSDoc 元信息。
export interface JsonSchema {
  type?: JsonSchemaType | JsonSchemaType[];
  const?: JsonValue;
  enum?: JsonValue[];
  anyOf?: JsonSchema[];

  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;

  items?: JsonSchema;
  prefixItems?: JsonSchema[];
  minItems?: number;
  maxItems?: number;

  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;

  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;

  description?: string;
  default?: JsonValue;

  $ref?: string;
  $defs?: Record<string, JsonSchema>;
}

// 结构化数据校验违规条目。
export interface Violation {
  // 违规字段的 JSON 访问路径。
  path: string;
  // 约束期望的形态。
  expected: string;
  // 实际收到的形态或值。
  got: string;
}

// 静态工作流 schema 生成阶段的诊断码。
export const SCHEMA_DIAGNOSTIC_CODE = 9002;

// union 变体数量上限，防止展开失控。
export const MAX_UNION_MEMBERS = 100;
