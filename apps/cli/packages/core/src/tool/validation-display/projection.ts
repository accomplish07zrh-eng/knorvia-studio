// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { RuntimeInputValidationIssue as RuntimeIssue } from "../input-normalization.js";
import type { ToolInputValidationIssue as Issue } from "../tool-input-validation-issues.js";
import { identity, matchKey, runtimeKeys, structural } from "./identity.js";
import { descendantsBeforeBounds } from "./order.js";
import { adaptRuntime, expandRuntime } from "./runtime.js";

type Candidates = { positions: number[]; cursor: number };

class Claims {
  private readonly queues = new Map<string, Candidates>();
  private readonly used = new Set<number>();

  constructor(runtime: readonly RuntimeIssue[]) {
    runtime.forEach((issue, position) => {
      for (const key of runtimeKeys(issue)) {
        let queue = this.queues.get(key);
        if (!queue) {
          queue = { positions: [], cursor: 0 };
          this.queues.set(key, queue);
        }
        queue.positions.push(position);
      }
    });
  }

  take(issue: Issue): number | undefined {
    const key = matchKey(issue.code, issue.path);
    const queue = key === undefined ? undefined : this.queues.get(key);
    if (!queue) return undefined;
    while (queue.cursor < queue.positions.length) {
      const position = queue.positions[queue.cursor++];
      if (this.used.has(position)) continue;
      this.used.add(position);
      return position;
    }
    return undefined;
  }
}

class Projection {
  readonly issues: Issue[] = [];
  private readonly seen = new Set<string>();

  add(issue: Issue): void {
    const key = identity(issue);
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.issues.push(issue);
  }
}

export function projectIssues(
  schema: unknown,
  json: readonly Issue[],
  runtime?: readonly RuntimeIssue[],
): Issue[] {
  if (!runtime?.length) return [...json];
  const expanded = expandRuntime(runtime, json);
  const claims = new Claims(expanded);
  const byPosition = new Map<number, Issue>();
  const parameters = new Projection();
  for (const issue of json) {
    const position = claims.take(issue);
    if (position !== undefined) byPosition.set(position, issue);
    else if (!structural(issue, schema)) continue;
    // 认领先于内容去重；重复 JSON 不能留下一个可被再次规范化的 runtime 槽位。
    parameters.add(issue);
  }
  if (
    parameters.issues.some(
      (issue) => issue.code === "invalid_type" || issue.code === "unrecognized_keys",
    )
  )
    return parameters.issues;

  const constraints = new Projection();
  expanded.forEach((source, position) => {
    const issue = byPosition.get(position) ?? adaptRuntime(source, schema);
    if (issue) constraints.add(issue);
  });
  return constraints.issues.length ? descendantsBeforeBounds(constraints.issues) : [...json];
}
