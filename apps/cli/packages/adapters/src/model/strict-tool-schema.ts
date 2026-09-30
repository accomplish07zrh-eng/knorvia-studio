// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type { JsonSchema } from "@knorvia/contracts";
import { isRecord } from "./runner-record.js";

export function isAnthropicFirstPartyModelId(modelId: string | undefined): boolean {
  return modelId?.startsWith("claude-") === true;
}

const DROP = new Set([
  "title",
  "description",
  "default",
  "examples",
  "deprecated",
  "readOnly",
  "writeOnly",
  "format",
]);
export function toStrictToolSchema(schema: JsonSchema): JsonSchema | undefined {
  const visit = (value: unknown): unknown | undefined => {
    if (!isRecord(value) || Array.isArray(value) || Object.keys(value).length === 0)
      return undefined;
    if ("$ref" in value || "$defs" in value || "prefixItems" in value) return undefined;
    const type = value.type;
    if (
      typeof type !== "string" &&
      !Array.isArray(type) &&
      !("enum" in value) &&
      !("const" in value) &&
      !("anyOf" in value) &&
      !("oneOf" in value)
    )
      return undefined;
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (DROP.has(key)) continue;
      if (key === "additionalProperties" && isRecord(entry)) return undefined;
      if (key === "properties") {
        if (!isRecord(entry) || Array.isArray(entry)) return undefined;
        const properties: Record<string, unknown> = {};
        for (const [name, property] of Object.entries(entry)) {
          const converted = visit(property);
          if (converted === undefined) return undefined;
          properties[name] = converted;
        }
        output.properties = properties;
        output.required = Object.keys(properties);
        output.additionalProperties = false;
      } else if (key === "items") {
        const converted = visit(entry);
        if (converted === undefined) return undefined;
        output.items = converted;
      } else if (key === "anyOf" || key === "oneOf" || key === "allOf") {
        if (!Array.isArray(entry)) return undefined;
        const converted = entry.map(visit);
        if (converted.some((item) => item === undefined)) return undefined;
        output[key] = converted;
      } else if (key !== "required") output[key] = entry;
    }
    if (type === "object" && !("properties" in value)) {
      output.additionalProperties = false;
      output.properties = {};
      output.required = [];
    }
    return output;
  };
  return visit(schema) as JsonSchema | undefined;
}
