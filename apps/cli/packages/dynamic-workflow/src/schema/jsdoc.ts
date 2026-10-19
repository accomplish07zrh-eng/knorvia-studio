// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import type { JsonSchema, JsonValue } from "./types.js";

// Knorvia dynamic-workflow schema constraint harvesting from TypeScript JSDoc comments and tags.

class TagConstraintCollector {
  private readonly attributes: Partial<JsonSchema> = {};

  extractDoc(sym: ts.Symbol, typeChecker: ts.TypeChecker): void {
    const parts = sym.getDocumentationComment(typeChecker);
    const docString = ts.displayPartsToString(parts).trim();
    if (docString.length > 0) {
      this.attributes.description = docString;
    }
  }

  processTag(tagInfo: ts.JSDocTagInfo): void {
    const pieces = tagInfo.text;
    const textContent = pieces ? ts.displayPartsToString(pieces).trim() : "";
    const key = tagInfo.name;

    switch (key) {
      case "minimum":
      case "maximum":
      case "exclusiveMinimum":
      case "exclusiveMaximum":
      case "minLength":
      case "maxLength":
      case "minItems":
      case "maxItems": {
        const parsedNum = Number(textContent);
        if (Number.isFinite(parsedNum)) {
          (this.attributes as Record<string, unknown>)[key] = parsedNum;
        }
        break;
      }
      case "pattern":
      case "format": {
        if (textContent.length > 0) {
          (this.attributes as Record<string, unknown>)[key] = textContent;
        }
        break;
      }
      case "default": {
        this.attributes.default = this.decodeDefaultValue(textContent);
        break;
      }
      default:
        break;
    }
  }

  private decodeDefaultValue(rawText: string): JsonValue {
    if (rawText.length === 0) {
      return "";
    }
    try {
      const parsed: unknown = JSON.parse(rawText);
      return parsed as JsonValue;
    } catch {
      return rawText;
    }
  }

  build(): Partial<JsonSchema> {
    return this.attributes;
  }
}

// Harvest description and schema constraint tags attached to a TypeScript symbol.
export function harvestConstraints(
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
): Partial<JsonSchema> {
  const collector = new TagConstraintCollector();
  collector.extractDoc(symbol, checker);
  const tagList = symbol.getJsDocTags(checker);
  for (const tag of tagList) {
    collector.processTag(tag);
  }
  return collector.build();
}

// Combine harvested JSDoc constraints with an existing JsonSchema.
// Keeps any existing description on the target schema.
export function mergeConstraints(schema: JsonSchema, extra: Partial<JsonSchema>): JsonSchema {
  const combined: JsonSchema = { ...schema };
  for (const [attrName, attrValue] of Object.entries(extra)) {
    if (attrValue === undefined) {
      continue;
    }
    if (attrName === "description" && combined.description !== undefined) {
      continue;
    }
    (combined as Record<string, unknown>)[attrName] = attrValue;
  }
  return combined;
}
