// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { JsonSchema } from "@knorvia/contracts";
import type {
  ToolInputValidationIssue,
  ToolInputValidationPath,
} from "../tool-input-validation-issues.js";

export interface Trail {
  parent: Trail | undefined;
  segment: string | number;
}

export interface Diagnostics {
  errors: string[];
  issues: ToolInputValidationIssue[];
}

export interface Frame {
  value: unknown;
  schema: JsonSchema;
  trail: Trail | undefined;
  display: string;
  diagnostics: Diagnostics;
}

export function collect(): Diagnostics {
  return { errors: [], issues: [] };
}

export function issuePath(trail: Trail | undefined): ToolInputValidationPath {
  const segments: ToolInputValidationPath = [];
  for (let cursor = trail; cursor; cursor = cursor.parent) segments.push(cursor.segment);
  return segments.reverse();
}

export function record(value: unknown): value is JsonSchema {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
