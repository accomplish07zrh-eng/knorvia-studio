// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { wildcardToRegExp } from "./rule-matching.js";

const COMMAND_SUFFIX = ":*";
const COMMAND_BOUNDARIES = new Set([" ", "\t"]);

type RuleContentProgram =
  | { kind: "url" | "literal" | "command"; value: string }
  | { kind: "glob"; expression: RegExp };

export function compileRuleContent(content: string, webFetchInput: boolean): RuleContentProgram {
  // 默认授权建议保存完整 URL；不能把它变成域名许可或把 URL 中的星号当通配符。
  if (webFetchInput && URL.parse(content)?.hostname) return { kind: "url", value: content };
  if (content.endsWith(COMMAND_SUFFIX)) {
    return { kind: "command", value: content.slice(0, -COMMAND_SUFFIX.length) };
  }
  return content.includes("*")
    ? { kind: "glob", expression: wildcardToRegExp(content) }
    : { kind: "literal", value: content };
}

export function evaluateRuleContent(program: RuleContentProgram, subject: string): boolean {
  switch (program.kind) {
    case "url":
    case "literal":
      return subject === program.value;
    case "glob":
      return program.expression.test(subject);
    case "command":
      return (
        subject.startsWith(program.value) &&
        (subject.length === program.value.length ||
          COMMAND_BOUNDARIES.has(subject.charAt(program.value.length)))
      );
  }
}
