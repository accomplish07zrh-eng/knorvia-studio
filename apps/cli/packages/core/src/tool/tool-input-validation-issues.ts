// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type {
  ToolInputValidationPath as Path,
  ToolInputValidationIssue as Issue,
  ToolInputTooBigIssue,
} from "./validation-issues/protocol.js";
import { writeIssue } from "./validation-issues/write.js";
import {
  choiceMessage,
  describeType,
  INVALID_INPUT,
  keysMessage,
  rangeMessage,
} from "./validation-issues/description.js";
export type * from "./validation-issues/protocol.js";

type Origin = ToolInputTooBigIssue["origin"];
interface Bounds {
  exact?: boolean;
  inclusive?: boolean;
}

export function createInvalidTypeIssue(value: unknown, schemaType: unknown, path: Path) {
  const description = describeType(value, schemaType);
  return writeIssue("invalid_type", path, description, () => description.message);
}

export function createInvalidValueIssue(values: unknown[], path: Path) {
  return writeIssue("invalid_value", path, { values }, () => choiceMessage(values));
}

export function createUnrecognizedKeysIssue(keys: string[], path: Path) {
  return writeIssue("unrecognized_keys", path, { keys }, () => keysMessage(keys));
}

function range<D extends "minimum" | "maximum">(
  direction: D,
  origin: Origin,
  limit: number,
  path: Path,
  options: Bounds,
) {
  const inclusive = options.inclusive ?? true;
  const code = direction === "minimum" ? "too_small" : "too_big";
  return writeIssue(
    code,
    path,
    {
      origin,
      [direction]: limit,
      inclusive,
      ...(options.exact === true ? { exact: true } : {}),
    },
    () => rangeMessage(direction, origin, limit, inclusive),
  );
}

export function createTooSmallIssue(
  origin: Origin,
  minimum: number,
  path: Path,
  options: Bounds = {},
) {
  return range("minimum", origin, minimum, path, options) as Extract<Issue, { code: "too_small" }>;
}

export function createTooBigIssue(
  origin: Origin,
  maximum: number,
  path: Path,
  options: Bounds = {},
) {
  return range("maximum", origin, maximum, path, options) as Extract<Issue, { code: "too_big" }>;
}

export function createInvalidUnionIssue(errors: Issue[][], path: Path) {
  return writeIssue("invalid_union", path, { errors }, () => INVALID_INPUT);
}

export function createCustomIssue(message: string, path: Path) {
  return writeIssue("custom", path, {}, () => message);
}

export function createInvalidFormatIssue(
  format: string,
  message: string,
  path: Path,
  options: { origin?: "string"; pattern?: string } = {},
) {
  const data: Record<string, unknown> = {};
  // 选项可能是 getter：检查决定字段是否存在，第二次读取决定其值，不能合并两次读取。
  if (options.origin !== undefined) data.origin = options.origin;
  data.format = format;
  if (options.pattern !== undefined) data.pattern = options.pattern;
  return writeIssue("invalid_format", path, data, () => message);
}
