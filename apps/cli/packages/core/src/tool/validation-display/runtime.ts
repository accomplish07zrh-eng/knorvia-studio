// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { RuntimeInputValidationIssue as RuntimeIssue } from "../input-normalization.js";
import {
  createCustomIssue,
  createInvalidFormatIssue,
  createTooBigIssue,
  createTooSmallIssue,
  type ToolInputValidationIssue as Issue,
} from "../tool-input-validation-issues.js";
import { matchKey, record, runtimeKeys, runtimePath, schemaAt } from "./identity.js";

type Visit = { issue: RuntimeIssue; leaving: boolean };
const DEFAULT_MESSAGE = "Invalid input";

export function expandRuntime(
  source: readonly RuntimeIssue[],
  json: readonly Issue[],
): RuntimeIssue[] {
  const covered = new Set(json.map((issue) => matchKey(issue.code, issue.path)));
  const active = new Set<RuntimeIssue>();
  const pending: Visit[] = source.map((issue) => ({ issue, leaving: false })).reverse();
  const leaves: RuntimeIssue[] = [];
  while (pending.length) {
    const { issue, leaving } = pending.pop()!;
    if (leaving) {
      active.delete(issue);
      continue;
    }
    const children: RuntimeIssue[] = [];
    if (
      !runtimeKeys(issue).some((key) => covered.has(key)) &&
      issue.code === "invalid_union" &&
      Array.isArray(issue.unionErrors)
    ) {
      for (const branch of issue.unionErrors) {
        if (!record(branch) || !Array.isArray(branch.issues)) continue;
        for (const child of branch.issues) if (record(child)) children.push(child);
      }
    }
    if (!children.length) {
      leaves.push(issue);
      continue;
    }
    // 只检测实际展开的祖先；兄弟共享对象合法，已匹配 JSON union 的节点无需展开。
    if (active.has(issue)) throw new TypeError("Runtime validation issues contain a cycle");
    active.add(issue);
    pending.push({ issue, leaving: true });
    for (let index = children.length - 1; index >= 0; index--)
      pending.push({ issue: children[index], leaving: false });
  }
  return leaves;
}

export function adaptRuntime(issue: RuntimeIssue, schema: unknown): Issue | undefined {
  const path = runtimePath(issue);
  if (!path) return undefined;
  const message = typeof issue.message === "string" ? issue.message : DEFAULT_MESSAGE;
  if (issue.code === "custom") return createCustomIssue(message, path);
  if (issue.code === "invalid_string") {
    if (issue.validation === "url")
      return createInvalidFormatIssue(
        "url",
        message === "Invalid url" ? "Invalid URL" : message,
        path,
      );
    if (issue.validation !== "regex") return undefined;
    const expression = schemaAt(schema, path)?.pattern;
    const pattern = typeof expression === "string" ? `/${expression}/` : undefined;
    return createInvalidFormatIssue(
      "regex",
      message === "Invalid" && pattern ? `Invalid string: must match pattern ${pattern}` : message,
      path,
      { origin: "string", pattern },
    );
  }
  if (issue.code !== "too_big" && issue.code !== "too_small") return undefined;
  const origin = issue.type;
  if (origin !== "array" && origin !== "number" && origin !== "string") return undefined;
  const limit = issue.code === "too_big" ? issue.maximum : issue.minimum;
  if (typeof limit !== "number") return undefined;
  const make = issue.code === "too_big" ? createTooBigIssue : createTooSmallIssue;
  return make(origin, limit, path, {
    inclusive: issue.inclusive !== false,
    exact: issue.exact === true,
  });
}
