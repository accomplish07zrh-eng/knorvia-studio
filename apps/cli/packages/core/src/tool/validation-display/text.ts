// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type {
  ToolInputValidationIssue as Issue,
  ToolInputValidationPath as Path,
} from "../tool-input-validation-issues.js";
import { missing } from "./identity.js";
import { issueJson } from "./issue-json.js";

function label(path: Path): string {
  return path
    .map((part, index) =>
      typeof part === "number" ? `[${part.toString()}]` : `${index ? "." : ""}${part}`,
    )
    .join("");
}

export function issueText(name: string, issues: readonly Issue[]): string {
  const required: string[] = [];
  const extra: string[] = [];
  const types: string[] = [];
  for (const issue of issues) {
    if (issue.code === "unrecognized_keys") {
      // 稀疏 keys 的空槽不是额外参数；与原数组投影一样跳过它。
      issue.keys.forEach((key) => extra.push(`An unexpected parameter \`${key}\` was provided`));
    } else if (issue.code === "invalid_type") {
      const parameter = label(issue.path);
      if (missing(issue)) required.push(`The required parameter \`${parameter}\` is missing`);
      else {
        const received = issue.message.match(/received (\w+)/)?.[1] ?? "unknown";
        types.push(
          `The parameter \`${parameter}\` type is expected as \`${issue.expected}\` but provided as \`${received}\``,
        );
      }
    }
  }
  const lines = required.concat(extra, types);
  return lines.length
    ? `${name} failed due to the following ${lines.length > 1 ? "issues" : "issue"}:\n${lines.join("\n")}`
    : issueJson(issues);
}
