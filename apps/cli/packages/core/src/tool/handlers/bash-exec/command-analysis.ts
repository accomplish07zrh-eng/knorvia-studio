// SPDX-License-Identifier: Apache-2.0
// bash 命令分析器：以 unbash 的 AST 为语法事实来源，把脚本折算成「命令段」清单，
// 并标注每段的操作符、重定向、环境赋值与动态成分。任何无法静态解释的语法
// （命令替换、算术展开、后台执行、子 shell 等）都会让整条分析失去静态判定资格。
import { parse } from "unbash";
import type { Command, Node, Redirect, Script, Statement, Word, WordPart } from "unbash";
import type {
  BashCommandAnalysis,
  BashCommandEnvAssignment,
  BashCommandInvocation,
  BashCommandOperator,
  BashCommandRedirect,
} from "../bash-command-parser.js";

const PARSE_INPUT_LIMIT = 10_000;
// 这些容器节点只负责传递操作符与重定向，本身不构成「不支持的语法」。
const ROUTING_NODE_KINDS = new Set(["AndOr", "Pipeline", "Statement"]);
// 字面量类词片段：原样进入 argv，不引入动态执行。
const PLAIN_WORD_FRAGMENTS = new Set(["AnsiCQuoted", "Literal", "SingleQuoted"]);
// 复合引号片段：自身不执行，但内部片段各自判定。
const NESTED_WORD_FRAGMENTS = new Set(["DoubleQuoted", "LocaleString"]);
// 空分析里的四个布尔事实统一置 false，字段名集中一处维护。
type ClearedFact = "hasDynamicWords" | "hasParseErrors" | "hasRedirects" | "hasUnsupportedSyntax";
const CLEARED_FACT_NAMES: readonly ClearedFact[] = [
  "hasDynamicWords",
  "hasParseErrors",
  "hasRedirects",
  "hasUnsupportedSyntax",
];

export function analyzeBashCommand(cmd: string): BashCommandAnalysis {
  if (cmd.trim().length === 0) return blankAnalysis();
  if (cmd.length > PARSE_INPUT_LIMIT) return brokenAnalysis();

  const script = tryParseScript(cmd);
  if (script === undefined) return brokenAnalysis();

  const state: DraftState = {
    segments: [],
    dynamicSeen: false,
    parseFailed: script.errors !== undefined && script.errors.length > 0,
    redirectSeen: false,
    blockedKinds: new Set(),
  };

  for (const [position, node] of script.commands.entries()) {
    descend(cmd, node, {
      analysis: state,
      carriedRedirects: [],
      leadingOperator: position === 0 ? undefined : "sequence",
    });
  }

  return sealAnalysis(state);
}

export function isBashCommandPermissionSafe(facts: BashCommandAnalysis): boolean {
  return !facts.hasParseErrors && !facts.hasUnsupportedSyntax && !facts.hasDynamicWords;
}

function tryParseScript(text: string): (Script & { errors?: unknown[] }) | undefined {
  try {
    return parse(text);
  } catch {
    return undefined;
  }
}

interface DraftState {
  segments: BashCommandInvocation[];
  dynamicSeen: boolean;
  parseFailed: boolean;
  redirectSeen: boolean;
  blockedKinds: Set<string>;
}

interface TraversalScope {
  analysis: DraftState;
  carriedRedirects: Redirect[];
  leadingOperator?: BashCommandOperator;
}

function descend(text: string, node: Node, scope: TraversalScope): void {
  if (node.type === "Command") {
    recordCommandSegment(text, node, scope);
    return;
  }
  if (node.type === "Statement") {
    recordStatement(text, node, scope);
    return;
  }
  if (node.type === "AndOr" || node.type === "Pipeline") {
    descendThroughOperators(text, node.commands, node.operators, scope);
    return;
  }
  scope.analysis.blockedKinds.add(node.type);
}

// 语句层：登记后台标记与语句级重定向，再把重定向遗产传给内部命令。
function recordStatement(text: string, statement: Statement, scope: TraversalScope): void {
  if (statement.background) scope.analysis.blockedKinds.add("background");
  registerRedirects(statement.redirects, scope.analysis);
  descend(text, statement.command, {
    analysis: scope.analysis,
    carriedRedirects: [...scope.carriedRedirects, ...statement.redirects],
    leadingOperator: scope.leadingOperator,
  });
}

// &&/||/管道层：两者结构一致——命令列表配操作符列表，逐段下钻并传递操作符。
function descendThroughOperators(
  text: string,
  members: readonly Node[],
  operators: readonly BashCommandOperator[],
  scope: TraversalScope,
): void {
  for (const [position, member] of members.entries()) {
    descend(text, member, {
      analysis: scope.analysis,
      carriedRedirects: scope.carriedRedirects,
      leadingOperator: position === 0 ? scope.leadingOperator : operators[position - 1],
    });
  }
}

function recordCommandSegment(text: string, command: Command, scope: TraversalScope): void {
  const redirects = [...scope.carriedRedirects, ...command.redirects];
  const words = [command.name, ...command.suffix].filter(presentWordsOnly);
  const bindings: BashCommandEnvAssignment[] = command.prefix.map((binding) => ({
    name: binding.name,
    value: binding.value ? renderWord(binding.value) : undefined,
  }));
  const dynamic = segmentHasDynamicInput(command, words, redirects);

  if (dynamic) scope.analysis.dynamicSeen = true;
  const carriesRedirects = redirects.length > 0;
  if (carriesRedirects) scope.analysis.redirectSeen = true;

  const prefixBindings = command.prefix;
  const segment: BashCommandInvocation = {
    argv: words.map(renderWord),
    commandText: sliceSegmentText(text, command),
    envAssignments: bindings,
    hasAssignmentPrefix: prefixBindings.length > 0,
    hasDynamicWords: dynamic,
    hasRedirects: carriesRedirects,
    name: command.name ? renderWord(command.name) : "",
    operatorBefore: scope.leadingOperator,
    redirects: redirects.map(toPublicRedirect),
  };
  scope.analysis.segments.push(segment);
}

// 动态成分 = 词列表、赋值值或重定向目标里出现会触发执行/展开的片段。
function segmentHasDynamicInput(
  command: Command,
  words: readonly Word[],
  redirects: readonly Redirect[],
): boolean {
  const overWords = words.some(wordTriggersExecution);
  const overBindings = command.prefix.some(
    (binding) => binding.value !== undefined && wordTriggersExecution(binding.value),
  );
  const overRedirects = redirects.some(redirectTriggersExecution);
  return overWords || overBindings || overRedirects;
}

function sliceSegmentText(text: string, command: Command): string {
  return text.slice(command.pos, command.end);
}

function registerRedirects(redirects: Redirect[], state: DraftState): void {
  if (redirects.length === 0) return;
  state.redirectSeen = true;
  if (redirects.some(redirectTriggersExecution)) state.dynamicSeen = true;
}

// 逐字段搬运重定向：目标词取渲染文本，fd 与操作符原样保留。
function toPublicRedirect(redirect: Redirect): BashCommandRedirect {
  const view: Record<string, unknown> = { target: redirectBodyText(redirect) };
  for (const field of ["fileDescriptor", "operator"] as const) {
    view[field] = redirect[field];
  }
  return view as unknown as BashCommandRedirect;
}

function redirectTriggersExecution(redirect: Redirect): boolean {
  const overTarget = redirect.target !== undefined && wordTriggersExecution(redirect.target);
  const overBody = redirect.body !== undefined && wordTriggersExecution(redirect.body);
  return overTarget || overBody;
}

function redirectBodyText(redirect: Redirect): string {
  if (redirect.target !== undefined) return renderWord(redirect.target);
  const hereDocument = redirect.content;
  return hereDocument ?? "";
}

// 某些片段在主命令之前就产生副作用，权限判断不能把它们当作普通 argv。
function wordTriggersExecution(word: Word): boolean {
  return word.parts?.some(fragmentTriggersExecution) ?? false;
}

function fragmentTriggersExecution(fragment: WordPart): boolean {
  if (NESTED_WORD_FRAGMENTS.has(fragment.type)) {
    const nested = fragment as Extract<WordPart, { parts: WordPart[] }>;
    return nested.parts.some(fragmentTriggersExecution);
  }
  return !PLAIN_WORD_FRAGMENTS.has(fragment.type);
}

function renderWord(word: Word): string {
  const literal = word.value;
  return literal ?? word.text;
}

function presentWordsOnly(word: Word | undefined): word is Word {
  return word !== null && word !== undefined;
}

function blankAnalysis(): BashCommandAnalysis {
  const clearedFacts = Object.fromEntries(
    CLEARED_FACT_NAMES.map((fact) => [fact, false]),
  ) as Record<ClearedFact, boolean>;
  return {
    commands: [],
    unsupportedNodeTypes: [],
    ...clearedFacts,
  };
}

function brokenAnalysis(): BashCommandAnalysis {
  const base = blankAnalysis();
  return { ...base, hasParseErrors: true };
}

function sealAnalysis(state: DraftState): BashCommandAnalysis {
  const blocked = [...state.blockedKinds].filter((kind) => !ROUTING_NODE_KINDS.has(kind));
  return {
    commands: state.segments,
    hasDynamicWords: state.dynamicSeen,
    hasParseErrors: state.parseFailed,
    hasRedirects: state.redirectSeen,
    hasUnsupportedSyntax: blocked.length > 0,
    unsupportedNodeTypes: blocked,
  };
}
