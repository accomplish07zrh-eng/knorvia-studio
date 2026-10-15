// SPDX-License-Identifier: Apache-2.0
// 策略表装配：把分族声明的条目合成两张只读策略表——git 子命令族与多词前缀族。
// 分族数据各自独立成模块（按 git / GitHub CLI / docker 等公开文档组织），
// 此处只负责合并顺序：同名条目以靠后的族为准。
import type { BashReadonlyCommandPolicy } from "./bash-readonly-policy-types.js";
import { GIT_READONLY_SUBCOMMAND_POLICY_ENTRIES_CORE } from "./bash-readonly-policy-git-subcommands-core.js";
import { GIT_READONLY_SUBCOMMAND_POLICY_ENTRIES_HISTORY } from "./bash-readonly-policy-git-subcommands-history.js";
import { READONLY_MULTIWORD_POLICY_ENTRIES_CORE } from "./bash-readonly-policy-multiword-core.js";
import { READONLY_MULTIWORD_POLICY_ENTRIES_GH } from "./bash-readonly-policy-multiword-gh.js";

export {
  GIT_GLOBAL_DANGEROUS_FLAGS,
  GIT_GLOBAL_NO_VALUE_FLAGS,
  GIT_GLOBAL_VALUE_FLAGS,
  READONLY_ALLOW_ANY_ARG_COMMAND_PREFIXES,
  READONLY_ALLOW_ANY_ARG_COMMANDS,
  READONLY_COMMAND_POLICIES,
} from "./bash-readonly-policy-simple-commands.js";

type PolicyEntry = readonly [string, BashReadonlyCommandPolicy];

function composePolicyMap(
  ...sources: readonly (readonly PolicyEntry[])[]
): Map<string, BashReadonlyCommandPolicy> {
  const merged = new Map<string, BashReadonlyCommandPolicy>();
  for (const source of sources) {
    for (const [prefix, policy] of source) merged.set(prefix, policy);
  }
  return merged;
}

export const GIT_READONLY_SUBCOMMAND_POLICIES = composePolicyMap(
  GIT_READONLY_SUBCOMMAND_POLICY_ENTRIES_CORE,
  GIT_READONLY_SUBCOMMAND_POLICY_ENTRIES_HISTORY,
);

export const READONLY_MULTIWORD_COMMAND_POLICIES = composePolicyMap(
  READONLY_MULTIWORD_POLICY_ENTRIES_CORE,
  READONLY_MULTIWORD_POLICY_ENTRIES_GH,
);
