// SPDX-License-Identifier: Apache-2.0
// 只读判定主链：把「单个命令段」依次送过前置闸门、直接判定、多词前缀、简单命令族四道关。
// 任一道关判有副作用即整体有副作用；只有每段都拿到只读裁决、且至少一段命中时才判只读。
import type { BashCommandInvocation } from "../bash-command-parser.js";
import {
  areEnvAssignmentsAllowed,
  areRedirectsAllowed,
  isUnsafeWindowsUncPath,
  stripSafeCommandWrappers,
} from "../bash-readonly-policy-argv-io.js";
import { isArgvAllowedByPolicy } from "../bash-readonly-policy-argv-flags.js";
import {
  evaluateDirectReadonlyArgv,
  isFindWriteOption,
} from "../bash-readonly-policy-argv-direct.js";
import {
  hasDangerousGitGlobalOption,
  isGitReadOnlyCommand,
} from "../bash-readonly-policy-argv-git.js";
import {
  READONLY_ALLOW_ANY_ARG_COMMANDS,
  READONLY_COMMAND_POLICIES,
  READONLY_MULTIWORD_COMMAND_POLICIES,
} from "../bash-readonly-policy-commands.js";
import { isSedInPlaceOption } from "../bash-readonly-policy-callbacks.js";
import type { BashReadonlyCommandPolicy } from "./policy-shapes.js";

export function evaluateBashReadonlyPolicy(part: BashCommandInvocation): boolean | undefined {
  const argv = stripSafeCommandWrappers(part.argv);
  if (!frontGatesAdmit(part, argv)) return false;
  if (argv[0] === "git") {
    return isGitReadOnlyCommand(argv);
  }

  const direct = evaluateDirectReadonlyArgv(argv);
  if (direct !== undefined) return direct;

  const multiword = matchMultiwordPolicy(argv, part.commandText);
  if (multiword !== undefined) return multiword;

  if (plainObserverAdmitted(argv)) return true;
  // win32 没有原生 xargs：目标命令无从判定，保守交回上层（判有副作用），见 K-ro-4。
  const nativeXargsMissing = process.platform === "win32" && argv[0] === "xargs";
  if (nativeXargsMissing) return undefined;
  return matchSingleCommandPolicy(argv, part.commandText);
}

// 各命令的写选项探测器：按命令名查表，未收录的命令没有已知写选项。
const WRITE_PROBE_BY_SUBJECT: Record<string, (argv: readonly string[]) => boolean> = {
  sed: (argv) => argv.some(isSedInPlaceOption),
  find: (argv) => argv.some(isFindWriteOption),
  tree: treeMentionsOutputFile,
  git: hasDangerousGitGlobalOption,
};

export function hasKnownBashWriteOption(part: BashCommandInvocation): boolean {
  const argv = stripSafeCommandWrappers(part.argv);
  const probe = WRITE_PROBE_BY_SUBJECT[argv[0] ?? ""];
  return probe?.(argv) ?? false;
}

// 前置闸门：env 赋值与重定向的副作用筛查、空段拒绝、UNC 路径拒绝。
function frontGatesAdmit(part: BashCommandInvocation, argv: readonly string[]): boolean {
  if (!areEnvAssignmentsAllowed(part)) return false;
  if (!areRedirectsAllowed(part)) return false;
  if (argv.length === 0) return false;
  return !argv.some(isUnsafeWindowsUncPath);
}

function plainObserverAdmitted(argv: readonly string[]): boolean {
  return READONLY_ALLOW_ANY_ARG_COMMANDS.has(argv[0] ?? "");
}

// 多词前缀策略：前缀越长越具体，按词数降序取第一条命中；命中后仍要过追加复核与旗标画像。
function matchMultiwordPolicy(argv: readonly string[], commandText: string): boolean | undefined {
  for (const [prefix, policy] of longestFirstMultiwordPolicies()) {
    const words = prefix.split(" ");
    if (!words.every((word, index) => argv[index] === word)) continue;
    const trailing = argv.slice(words.length);
    if (trailing.some(unsafeExpansionText)) return false;
    if (policy.additionalCommandIsDangerousCallback?.(prefix, trailing)) return false;
    if (!isArgvAllowedByPolicy(argv, policy, argv[0] ?? "", words.length)) return false;
    return commandTextMatches(policy, commandText);
  }
  return undefined;
}

// 单命令族策略：查画像表 → 多参数 cd 拒绝 → 追加复核 → 旗标画像 → 命令文本复核。
function matchSingleCommandPolicy(
  argv: readonly string[],
  commandText: string,
): boolean | undefined {
  const subject = argv[0] ?? "";
  const policy = READONLY_COMMAND_POLICIES.get(subject);
  if (!policy) return undefined;
  if (subject === "cd" && argv.length > 2) return false;
  if (policy.additionalCommandIsDangerousCallback?.(commandText, argv.slice(1))) return false;
  if (!isArgvAllowedByPolicy(argv, policy, subject)) return false;
  return commandTextMatches(policy, commandText);
}

function commandTextMatches(policy: BashReadonlyCommandPolicy, commandText: string): boolean {
  if (!policy.regex) return true;
  return policy.regex.test(commandText);
}

// 取值里出现 "$" 或带展开语法的花括号，说明参数不是字面量，多词只读裁决不成立。
function unsafeExpansionText(word: string): boolean {
  if (word.includes("$")) return true;
  return word.includes("{") && (word.includes(",") || word.includes(".."));
}

let multiwordPoliciesByLength:
  | ReadonlyArray<readonly [string, BashReadonlyCommandPolicy]>
  | undefined;

function longestFirstMultiwordPolicies(): ReadonlyArray<
  readonly [string, BashReadonlyCommandPolicy]
> {
  multiwordPoliciesByLength ??= [...READONLY_MULTIWORD_COMMAND_POLICIES.entries()].sort(
    (left, right) => right[0].split(" ").length - left[0].split(" ").length,
  );
  return multiwordPoliciesByLength;
}

// tree 的输出重定向：出现 -o/--output 及其等号写法即视为落盘。
function treeMentionsOutputFile(argv: readonly string[]): boolean {
  for (let position = 1; position < argv.length; position += 1) {
    const token = argv[position];
    if (!token) continue;
    if (token === "--") return false;
    if (token === "-o" || token === "--output" || token.startsWith("--output=")) return true;
    if (token.startsWith("-") && !token.startsWith("--") && token.slice(1).includes("o")) {
      return true;
    }
  }
  return false;
}
