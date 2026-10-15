// SPDX-License-Identifier: Apache-2.0
// git 专段：先剥掉全局旗标（-c/-C/--git-dir 一类会整体改变 git 行为的选项一概判有副作用），
// 再把剩下的「子命令 + 参数」交给子命令族策略表按最长前缀匹配。
import { isArgvAllowedByPolicy } from "../bash-readonly-policy-argv-flags.js";
import {
  GIT_GLOBAL_DANGEROUS_FLAGS,
  GIT_GLOBAL_NO_VALUE_FLAGS,
  GIT_GLOBAL_VALUE_FLAGS,
  GIT_READONLY_SUBCOMMAND_POLICIES,
} from "../bash-readonly-policy-commands.js";
import type { BashReadonlyCommandPolicy } from "./policy-shapes.js";

// 与取值粘连的短旗标：-C<目录> 改变工作树，-c<键=值> 注入配置，都属危险全局项。
const ATTACHED_SHORT_GLOBALS = ["-C", "-c"];

export function isGitReadOnlyCommand(argv: readonly string[]): boolean {
  const plain = dropGitGlobalFlags(argv);
  if (plain === undefined) return false;
  const matched = matchSubcommandPolicy(plain);
  if (!matched) return false;
  const { policy, prefixWords } = matched;
  const trailing = plain.slice(prefixWords);
  if (policy.additionalCommandIsDangerousCallback?.(matched.prefix, trailing)) return false;
  return isArgvAllowedByPolicy(plain, policy, "git", prefixWords);
}

/** hasDangerousGitGlobalOption: 任意一个词形如危险全局项即为真（含 =值 与粘连短旗标写法）。 */
export function hasDangerousGitGlobalOption(argv: readonly string[]): boolean {
  return argv.some(wordIsDangerousGlobal);
}

// 全局旗标消毒：把 git 的全局段吃干净，只剩「子命令 + 它的参数」。
// 无值旗标直接跳过；带值旗标连同取值一起吞掉；未知旗标或危险项出现即放弃（整条判有副作用）。
function dropGitGlobalFlags(argv: readonly string[]): readonly string[] | undefined {
  const globalSection = argv.slice(1);
  const plain: string[] = ["git"];
  let cursor = 0;
  while (cursor < globalSection.length) {
    const word = globalSection[cursor] ?? "";
    cursor += 1;
    if (word === "") continue;
    if (GIT_GLOBAL_NO_VALUE_FLAGS.has(word)) continue;
    if (wordIsDangerousGlobal(word)) return undefined;
    if (GIT_GLOBAL_VALUE_FLAGS.has(word)) {
      // 带值旗标必须携带取值；缺值视为无法安全解析。
      if (globalSection[cursor] === undefined || globalSection[cursor] === "") return undefined;
      cursor += 1;
      continue;
    }
    if (word.startsWith("-")) return undefined;
    plain.push(word, ...globalSection.slice(cursor));
    return plain;
  }
  return undefined;
}

function wordIsDangerousGlobal(word: string): boolean {
  if (ATTACHED_SHORT_GLOBALS.some((flag) => isAttachedShort(flag, word))) return true;
  for (const flag of GIT_GLOBAL_DANGEROUS_FLAGS) {
    if (word === flag) return true;
    // 等号写法（--git-dir=…）与完整旗标同等对待。
    if (word.startsWith(`${flag}=`)) return true;
  }
  return false;
}

function isAttachedShort(flag: string, word: string): boolean {
  if (word.length <= flag.length || !word.startsWith(flag)) return false;
  // -C<路径> 任意后续字符都算粘连；-c 只有非 "-" 后继才算（把 -c-… 留给未知旗标分支处理）。
  return flag === "-C" || word[flag.length] !== "-";
}

// 前缀越长越具体：按词数降序预排一次，匹配时取第一条命中的策略。
const POLICIES_BY_LONGEST_PREFIX: ReadonlyArray<readonly [string, BashReadonlyCommandPolicy]> = [
  ...GIT_READONLY_SUBCOMMAND_POLICIES.entries(),
].sort((left, right) => right[0].split(" ").length - left[0].split(" ").length);

interface SubcommandMatch {
  policy: BashReadonlyCommandPolicy;
  prefix: string;
  prefixWords: number;
}

function matchSubcommandPolicy(plain: readonly string[]): SubcommandMatch | undefined {
  for (const [prefix, policy] of POLICIES_BY_LONGEST_PREFIX) {
    const words = prefix.split(" ");
    if (!words.every((word, index) => plain[index] === word)) continue;
    return { policy, prefix, prefixWords: words.length };
  }
  return undefined;
}
