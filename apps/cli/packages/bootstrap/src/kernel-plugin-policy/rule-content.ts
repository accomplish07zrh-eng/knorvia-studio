// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-policy：规则内容编译与求值。
//
// 契约依据：specs/contracts/kernel-plugin-policy/interface.md §九（旧实现导出面映射）、
//           behavior.md B12（平台差异）、specs/knorvia-permission-rule-matching.md。
//
// 对应旧实现的 `rule-matching.ts`（通配符→正则、WebFetch 主体）+ `rule-content-program.ts`
// （内容编译/求值）。行为按规格重写；**不逐行照搬旧代码**。
//
// 三类内容的判定：
//   ① 命令前缀（`<cmd>:*`）—— 要求主体以 `<cmd>` 开头，且下一个字符是边界
//   ② 通配符（含 `*`）    —— 全串正则匹配
//   ③ 字面量 / URL        —— 整串精确匹配
// 单独把「语法字符」转义出来，避免用户写的内容被当成正则元字符执行。

/** 需要转义的正则元字符。 */
const REGEXP_METACHARACTERS: ReadonlySet<string> = new Set("\\^$.*+?()[]{}|".split(""));

/** 通配符字符。 */
const WILDCARD = "*";

/** 通配符对应的正则片段。 */
const ANY_SEQUENCE = ".*";

/** 命令前缀后缀标记（`ls:*` 表示「以 `ls` 开头、后面是边界」）。 */
const COMMAND_SUFFIX = ":*";

/** 命令边界字符（`ls` 匹配 `ls -la` 但不匹配 `lsof`）。 */
const COMMAND_BOUNDARIES: ReadonlySet<string> = new Set([" ", "\t"]);

/** 主体来源类别。 */
export type RuleContentKind = "url" | "literal" | "command" | "glob";

/** 编译后的规则内容。 */
export type RuleContentProgram =
  | { readonly kind: "url" | "literal" | "command"; readonly value: string }
  | { readonly kind: "glob"; readonly expression: RegExp };

/**
 * 把通配符模式编译成正则：`*` 变 `.*`，其余正则元字符转义，整串锚定。
 *
 * 为什么逐字符构串而不是 `split("*").map(escape).join(".*")`：
 * 后者在连续 `**` 时会产生 `.*.*`（语义相同但串更长），逐字符处理更直白。
 */
export function wildcardToRegExp(pattern: string): RegExp {
  const fragments: string[] = ["^"];
  for (const character of pattern) {
    if (character === WILDCARD) {
      fragments.push(ANY_SEQUENCE);
    } else if (REGEXP_METACHARACTERS.has(character)) {
      fragments.push(`\\${character}`);
    } else {
      fragments.push(character);
    }
  }
  fragments.push("$");
  return new RegExp(fragments.join(""), "u");
}

/**
 * 编译规则内容。
 *
 * @param content 规则内容原文
 * @param webFetchInput 本次主体是否来自 WebFetch 的 `url`
 *
 * `webFetchInput` 为真且 `content` 是合法 URL → 按 URL 整串精确匹配：
 * 不能把它退化成域名匹配，也不能把 URL 里的 `*` 当通配符。
 */
export function compileRuleContent(content: string, webFetchInput: boolean): RuleContentProgram {
  if (webFetchInput && isValidUrl(content)) return { kind: "url", value: content };
  if (content.endsWith(COMMAND_SUFFIX)) {
    return { kind: "command", value: content.slice(0, -COMMAND_SUFFIX.length) };
  }
  if (content.includes(WILDCARD)) return { kind: "glob", expression: wildcardToRegExp(content) };
  return { kind: "literal", value: content };
}

/**
 * 求值：主体是否命中已编译的规则内容。
 *
 * 命令前缀匹配要求「主体以命令开头，且后面是边界或整体结束」——
 * 这样 `ls:*` 不会匹配 `lsof`（安全相关：否则前缀规则会意外放行无关命令）。
 */
export function evaluateRuleContent(program: RuleContentProgram, subject: string): boolean {
  switch (program.kind) {
    case "url":
    case "literal":
      return subject === program.value;
    case "glob":
      return program.expression.test(subject);
    case "command": {
      if (!subject.startsWith(program.value)) return false;
      if (subject.length === program.value.length) return true;
      return COMMAND_BOUNDARIES.has(subject.charAt(program.value.length));
    }
  }
}

/** 内容里的 URL 检测（不依赖外部 URL 解析器能在所有平台一致行为）。 */
function isValidUrl(value: string): boolean {
  const parsed = URL.parse(value);
  return parsed?.hostname !== undefined && parsed.hostname.length > 0;
}

/** WebFetch 的规则主体（`domain:` 前缀 + 小写主机名，去掉尾点）。 */
export function webFetchRuleSubjects(url: string): string[] {
  const parsed = URL.parse(url.trim());
  if (parsed?.hostname === undefined) return [];
  const host = parsed.hostname.toLowerCase();
  // 完全限定的域名允许尾点（`example.com.`）；去掉它才能与规则里的写法匹配。
  const domain = host.endsWith(".") ? host.slice(0, -1) : host;
  return domain.length === 0 ? [] : [`domain:${domain}`];
}
