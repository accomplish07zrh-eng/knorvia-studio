const TOOL_RULE_FLAGS = new Set(["--disallowedTools", "--disallowed-tools"]);
// 固定 assignment 语法：保留原 RegExp 的行终止符 / $ 边界，不扩大可接纳 token。
const INLINE_TOOL_RULES = /^(--disallowedTools|--disallowed-tools)=(.*)$/;
const OPTION_PREFIX = "-";
const OPEN_TOOL_ARGS = "(";
const CLOSE_TOOL_ARGS = ")";
const RULE_SEPARATORS = new Set([",", " "]);
const LEGACY_WEB_SEARCH = "web_search";
const PUBLIC_WEB_SEARCH = "WebSearch";

function* ruleSpans(value: string): Generator<string> {
  let start = 0;
  let insideToolArgs = false;
  for (let offset = 0; offset < value.length; offset += 1) {
    const character = value[offset]!;
    if (character === OPEN_TOOL_ARGS) insideToolArgs = true;
    else if (character === CLOSE_TOOL_ARGS) insideToolArgs = false;
    else if (!insideToolArgs && RULE_SEPARATORS.has(character)) {
      const rule = value.slice(start, offset).trim();
      if (rule) yield rule;
      start = offset + 1;
    }
  }
  const last = value.slice(start).trim();
  if (last) yield last;
}

function normalizedRule(rule: string): string {
  if (rule === LEGACY_WEB_SEARCH || rule.startsWith(`${LEGACY_WEB_SEARCH}${OPEN_TOOL_ARGS}`)) {
    return PUBLIC_WEB_SEARCH + rule.slice(LEGACY_WEB_SEARCH.length);
  }
  return rule;
}

export function extractToolRuleArguments(argv: readonly string[]): {
  args: string[];
  toolDisallowlist?: readonly string[];
} {
  const args: string[] = [];
  const rawRules: string[] = [];
  let cursor = 0;
  while (cursor < argv.length) {
    const token = argv[cursor++]!;
    const assigned = token.match(INLINE_TOOL_RULES);
    if (assigned) {
      rawRules.push(assigned[2] ?? "");
      continue;
    }
    if (!TOOL_RULE_FLAGS.has(token)) {
      args.push(token);
      continue;
    }

    const firstValue = cursor;
    while (cursor < argv.length && !argv[cursor]!.startsWith(OPTION_PREFIX)) cursor += 1;
    if (cursor === firstValue) throw new Error(`${token} requires at least one tool.`);
    for (let valueIndex = firstValue; valueIndex < cursor; valueIndex += 1) {
      rawRules.push(argv[valueIndex]!);
    }
  }

  const rules = new Set<string>();
  for (const value of rawRules) {
    for (const rule of ruleSpans(value)) rules.add(normalizedRule(rule));
  }
  return {
    args,
    toolDisallowlist: rules.size === 0 ? undefined : Array.from(rules),
  };
}
