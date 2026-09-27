// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { RuntimeInputValidationIssue as RuntimeIssue } from "../input-normalization.js";
import type {
  ToolInputValidationIssue as Issue,
  ToolInputValidationPath as Path,
} from "../tool-input-validation-issues.js";

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function runtimePath(issue: RuntimeIssue): Path | undefined {
  const path = issue.path;
  return Array.isArray(path) &&
    path.every((part) => typeof part === "string" || typeof part === "number")
    ? [...path]
    : undefined;
}

export function matchKey(code: string, path: Path): string | undefined {
  // 严格相等的路径语义不能用 JSON(path) 代替：NaN 永不匹配，Infinity 与字符串也须区分。
  if (path.some((part) => typeof part === "number" && Number.isNaN(part))) return undefined;
  return JSON.stringify([code, Array.from(path, (part) => [typeof part, String(part)])]);
}

export function runtimeKeys(issue: RuntimeIssue): string[] {
  const path = runtimePath(issue);
  if (!path || typeof issue.code !== "string") return [];
  const code =
    issue.code === "invalid_enum_value" || issue.code === "invalid_literal"
      ? "invalid_value"
      : issue.code === "invalid_string"
        ? "invalid_format"
        : issue.code;
  const codes =
    issue.code === "invalid_type" && issue.received === "undefined"
      ? [code, "invalid_value"]
      : [code];
  return codes.flatMap((candidate) => {
    const key = matchKey(candidate, path);
    return key === undefined ? [] : [key];
  });
}

export function schemaAt(schema: unknown, path: Path): Record<string, unknown> | undefined {
  let node = schema;
  for (const part of path) {
    if (!record(node)) return undefined;
    node =
      typeof part === "number"
        ? node.items
        : record(node.properties)
          ? node.properties[part]
          : undefined;
  }
  return record(node) ? node : undefined;
}

export function missing(issue: Issue): boolean {
  return issue.code === "invalid_type" && issue.message.includes("received undefined");
}

export function structural(issue: Issue, schema: unknown): boolean {
  if (issue.code === "unrecognized_keys") return true;
  if (!missing(issue)) return false;
  const node = schemaAt(schema, issue.path);
  return node === undefined || !Object.hasOwn(node, "default");
}

export function identity(issue: Issue): string {
  return `${issue.code}:${JSON.stringify(issue.path)}:${issue.message}`;
}

export function descendant(child: Path, parent: Path): boolean {
  return child.length > parent.length && parent.every((part, index) => child[index] === part);
}
