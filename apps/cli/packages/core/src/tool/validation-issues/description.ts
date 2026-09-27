// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { ToolInputTooBigIssue } from "./protocol.js";

type Origin = ToolInputTooBigIssue["origin"];
const DIRECTIONS = {
  minimum: { label: "Too small", sign: ">" },
  maximum: { label: "Too big", sign: "<" },
};
const UNITS: Partial<Record<Origin, string>> = { string: "characters", array: "items" };
export const INVALID_INPUT = "Invalid input";

function receivedName(value: unknown): string {
  const category = typeof value;
  if (category === "number") return Number.isNaN(value) ? "NaN" : category;
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object" && Object.getPrototypeOf(value) !== Object.prototype)
    return value.constructor ? value.constructor.name : category;
  return category;
}

export function describeType(value: unknown, schemaType: unknown) {
  const finite = typeof value === "number" && Number.isFinite(value);
  const integer = schemaType === "integer";
  const expected = integer ? (finite ? "int" : "number") : String(schemaType);
  const format = integer && finite ? "safeint" : undefined;
  const received =
    typeof value === "number" && !finite ? (Number.isNaN(value) ? "NaN" : "Infinity") : undefined;
  return {
    expected,
    ...(format !== undefined ? { format } : {}),
    ...(received !== undefined ? { received } : {}),
    message: `${INVALID_INPUT}: expected ${expected}, received ${receivedName(value)}`,
  };
}

function quoted(value: unknown): string {
  switch (typeof value) {
    case "string":
      return `"${value}"`;
    case "bigint":
      return `${value.toString()}n`;
    default:
      return String(value);
  }
}

export function choiceMessage(values: unknown[]): string {
  const single = values.length === 1;
  return single
    ? `${INVALID_INPUT}: expected ${quoted(values[0])}`
    : `Invalid option: expected one of ${values.map(quoted).join("|")}`;
}

export function keysMessage(keys: string[]): string {
  return `Unrecognized key${keys.length > 1 ? "s" : ""}: ${keys.map(quoted).join(", ")}`;
}

export function rangeMessage(
  direction: keyof typeof DIRECTIONS,
  origin: Origin,
  limit: number,
  inclusive: boolean,
): string {
  const { label, sign } = DIRECTIONS[direction];
  const comparison = sign + (inclusive ? "=" : "");
  const unit = UNITS[origin];
  const verb = unit ? "have" : "be";
  const quantity = `${comparison}${limit.toString()}${unit ? ` ${unit}` : ""}`;
  return `${label}: expected ${origin} to ${verb} ${quantity}`;
}
