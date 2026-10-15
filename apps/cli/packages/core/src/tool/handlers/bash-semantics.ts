// SPDX-License-Identifier: Apache-2.0
// bash 语义层：把「命令串 → 只读裁决 / 静默裁决 / 退出码读数 / 提供方判错」四件事
// 收在一处。判定依赖解析器的命令段划分与只读策略主链；退出码读数依据各命令公开
// 文档的退出码约定（grep 无匹配、diff 有差异、test 条件为假都不是错误）。
import type { ExecutionResult } from "@knorvia/contracts";
import {
  analyzeBashCommand,
  isBashCommandPermissionSafe,
  type BashCommandInvocation,
} from "./bash-command-parser.js";
import {
  analysisContainsGitAndDirectoryChange,
  analysisContainsGitCommand,
  isGitRuntimeContextUnsafe,
  type BashReadonlyRuntimeContext,
} from "./bash-git-runtime-safety.js";
import {
  evaluateBashReadonlyPolicy,
  hasKnownBashWriteOption,
  isSedInPlaceOption,
} from "./bash-readonly-policy.js";

// `||` 之后出现这些中性回退命令时，不把它们计入「产生输出的段」。
const FALLBACK_NEUTRAL_WORDS = new Set(": echo false printf true".split(" "));
// 这些命令只改文件系统或进程状态，不产生值得回灌模型的输出。
const NO_OUTPUT_WORDS = new Set(
  "cd chgrp chmod chown cp export ln mkdir mv rm rmdir touch unset wait".split(" "),
);
// 退出码 1 的语义化读数（按命令名查表）；grep 族的「无匹配」单独声明。
const NO_MATCH_READING = "No matches found";
const EXIT_CODE_ONE_READINGS: ReadonlyArray<readonly [string, string]> = [
  ["find", "Some directories were inaccessible"],
  ["diff", "Files differ"],
  ["test", "Condition is false"],
  ["[", "Condition is false"],
];
// 下列读数是命令的正常语义结果，不构成提供方错误。
const NORMAL_READINGS = new Set<string>([
  ...EXIT_CODE_ONE_READINGS.map(([, reading]) => reading),
  NO_MATCH_READING,
]);
const NO_MATCH_WORDS = new Set("egrep fgrep grep rg".split(" "));

const TERMINAL_STATUS_READINGS: Readonly<Record<string, string>> = {
  timed_out: "Command timed out",
  cancelled: "Command was cancelled",
  spawn_error: "Command failed to start",
};
const OUTPUT_LIMIT_READING = "Command stopped because output exceeded the configured limit";
const CODE_READING_PREFIX = "Command exited with code ";
const SIGNAL_READING_PREFIX = "Command exited due to signal ";

export function isRuntimeReadOnlyBashCommand(
  cmd: string,
  context?: BashReadonlyRuntimeContext,
): boolean {
  const parsed = analyzeBashCommand(cmd);
  if (!isBashCommandPermissionSafe(parsed)) return false;
  if (parsed.commands.length === 0) return false;
  if (analysisContainsGitAndDirectoryChange(parsed.commands)) return false;
  const mentionsGit = analysisContainsGitCommand(parsed.commands);
  if (mentionsGit && isGitRuntimeContextUnsafe(context)) return false;

  let observedReadOnlySegment = false;
  for (const segment of parsed.commands) {
    const verdict = segmentVerdict(segment);
    if (verdict !== "read-only") return false;
    observedReadOnlySegment = true;
  }
  return observedReadOnlySegment;
}

type SegmentVerdict = "read-only" | "mutating";

// 单段裁决：已知写选项优先否决；策略表给出只读/有副作用/不认识三种结果。
function segmentVerdict(segment: BashCommandInvocation): SegmentVerdict {
  if (hasKnownBashWriteOption(segment)) return "mutating";
  const policy = evaluateBashReadonlyPolicy(segment);
  if (policy === true) return "read-only";
  return "mutating";
}

export function isSedInPlaceBashCommand(cmd: string): boolean {
  const parsed = analyzeBashCommand(cmd);
  if (parsed.hasParseErrors) return false;
  return parsed.commands.some(
    (segment) => segment.name === "sed" && segment.argv.some(isSedInPlaceOption),
  );
}

export function isSilentBashCommand(cmd: string): boolean {
  const parsed = analyzeBashCommand(cmd);
  if (parsed.hasParseErrors || parsed.hasUnsupportedSyntax || parsed.hasDynamicWords) return false;
  if (parsed.commands.length === 0) return false;

  let observedOutputlessSegment = false;
  for (const segment of parsed.commands) {
    const word = segment.name;
    if (!word) continue;
    const fallbackNeutral = segment.operatorBefore === "||" && FALLBACK_NEUTRAL_WORDS.has(word);
    if (fallbackNeutral) continue;
    observedOutputlessSegment = true;
    if (!NO_OUTPUT_WORDS.has(word)) return false;
  }
  return observedOutputlessSegment;
}

export function interpretBashReturnCode(
  cmd: string,
  outcome: Pick<ExecutionResult, "error" | "exitCode" | "signal" | "status">,
): string | undefined {
  if (outcome.error?.type === "output_limit") return OUTPUT_LIMIT_READING;
  const terminal = TERMINAL_STATUS_READINGS[outcome.status];
  if (terminal !== undefined) return terminal;
  if (outcome.exitCode !== undefined && outcome.exitCode !== 0) {
    return nonZeroExitReading(cmd, outcome.exitCode);
  }
  if (outcome.signal) return `${SIGNAL_READING_PREFIX}${outcome.signal}`;
  return undefined;
}

export function isBashProviderErrorStatus(statusView: {
  exitCode?: unknown;
  returnCodeInterpretation?: unknown;
  status?: unknown;
}): boolean {
  if (statusView.status !== "failed") return false;
  if (typeof statusView.exitCode !== "number" || statusView.exitCode === 0) return false;
  return !isNormalReading(
    typeof statusView.returnCodeInterpretation === "string"
      ? statusView.returnCodeInterpretation
      : undefined,
  );
}

// 退出码 1：先按末段命令给出语义化读数，再回退到通用的「退出码 N」文案。
function nonZeroExitReading(command: string, exitCode: number): string {
  if (exitCode === 1) {
    const meaning = exitOneMeaning(command);
    if (meaning !== undefined) return meaning;
  }
  return `${CODE_READING_PREFIX}${exitCode}`;
}

function exitOneMeaning(command: string): string | undefined {
  const parsed = analyzeBashCommand(command);
  if (parsed.hasParseErrors || parsed.hasUnsupportedSyntax) return undefined;
  const statusSegment = parsed.commands.at(-1);
  if (statusSegment === undefined) return undefined;
  const word = statusCommandWord(statusSegment.name, statusSegment.argv);
  return meaningForWord(word);
}

// 不能因为命令行前面出现过 rg/grep，就把后续 test/exit 的 1 误判成「无匹配」。
function statusCommandWord(name: string, argv: readonly string[]): string {
  if (name !== "git") return name;
  const subcommand = gitSubcommandWord(argv);
  if (subcommand === "grep") return "grep";
  if (subcommand === "diff") return "diff";
  return name;
}

function gitSubcommandWord(argv: readonly string[]): string | undefined {
  for (let position = 1; position < argv.length; position += 1) {
    const token = argv[position];
    if (token === undefined) continue;
    if (token.startsWith("-")) {
      if (token === "-C" || token === "-c") position += 1;
      continue;
    }
    return token;
  }
  return undefined;
}

function meaningForWord(word: string): string | undefined {
  if (NO_MATCH_WORDS.has(word)) return NO_MATCH_READING;
  for (const [subject, reading] of EXIT_CODE_ONE_READINGS) {
    if (subject === word) return reading;
  }
  return undefined;
}

function isNormalReading(reading: string | undefined): boolean {
  return reading !== undefined && NORMAL_READINGS.has(reading);
}
