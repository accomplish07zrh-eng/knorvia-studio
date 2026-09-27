// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { JsonSchema } from "@knorvia/contracts";
import type { Diagnostics } from "./schema-validation/frame.js";
import { evaluateSchema } from "./schema-validation/machine.js";

export type {
  ToolInputValidationIssue,
  ToolInputValidationPath,
} from "./tool-input-validation-issues.js";

interface JsonSchemaValidationResult extends Diagnostics {
  valid: boolean;
}

export function validateJsonSchemaValue(
  value: unknown,
  schema: JsonSchema | undefined,
): JsonSchemaValidationResult {
  const diagnostics =
    !schema || Object.keys(schema).length === 0
      ? { errors: [], issues: [] }
      : evaluateSchema(value, schema);
  return {
    valid: diagnostics.errors.length === 0,
    errors: diagnostics.errors,
    issues: diagnostics.issues,
  };
}
