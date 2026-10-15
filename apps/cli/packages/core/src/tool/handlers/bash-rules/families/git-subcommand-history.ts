// SPDX-License-Identifier: Apache-2.0
// git 只读子命令画像（历史与远端信息族）：ls-remote/merge-base/reflog/remote/rev-list/
// rev-parse/shortlog/show/stash/status/tag/worktree。依据 git 公开手册整理；
// 连远端、修剪引用一类的越界用法由各自的危险性复核拦截。
import {
  gitLsRemoteCommandIsDangerous,
  gitReflogCommandIsDangerous,
  gitRemoteShowCommandIsDangerous,
  gitRevisionFormatCommandIsDangerous,
  gitTagCommandIsDangerous,
} from "../../bash-readonly-policy-callbacks.js";
import { flagChart } from "../flag-builder.js";
import type { BashReadonlyCommandPolicy } from "../policy-shapes.js";
import { compose, queryEntry, type ReadonlyEntry } from "./entry-builder.js";
import {
  COMMON_GIT_COLOR_FLAGS,
  COMMON_GIT_COUNT_FLAGS,
  COMMON_GIT_DATE_FLAGS,
  COMMON_GIT_LOG_STYLE_FLAGS,
  COMMON_GIT_PATCH_FLAGS,
  COMMON_GIT_REF_FLAGS,
  COMMON_GIT_STAT_FLAGS,
  GIT_SHOW_SAFE_FLAGS,
  GIT_STATUS_SAFE_FLAGS,
} from "./git-flags.js";

export const GIT_READONLY_SUBCOMMAND_POLICY_ENTRIES_HISTORY: readonly ReadonlyEntry[] = [
  queryEntry(
    "git ls-remote",
    flagChart(
      "-b -h -q -t --branches --exit-code --get-url --heads --quiet --refs --symref --tags",
      [["--sort", "string"]],
    ),
    gitLsRemoteCommandIsDangerous,
  ),
  queryEntry(
    "git merge-base",
    flagChart("--all --fork-point --independent --is-ancestor --octopus"),
  ),
  queryEntry(
    "git reflog",
    compose(
      COMMON_GIT_LOG_STYLE_FLAGS,
      COMMON_GIT_REF_FLAGS,
      COMMON_GIT_DATE_FLAGS,
      COMMON_GIT_COUNT_FLAGS,
      COMMON_GIT_STAT_FLAGS,
      flagChart("", [["--grep", "string"]]),
    ),
    gitReflogCommandIsDangerous,
  ),
  queryEntry("git remote show", flagChart("-n"), gitRemoteShowCommandIsDangerous),
  remoteListingEntry(),
  queryEntry(
    "git rev-list",
    compose(
      COMMON_GIT_REF_FLAGS,
      COMMON_GIT_DATE_FLAGS,
      COMMON_GIT_COUNT_FLAGS,
      flagChart(
        "--abbrev-commit --ancestry-path --count --dense --first-parent --full-history --graph " +
          "--merges --no-max-parents --no-merges --no-min-parents --oneline --reverse --source " +
          "--sparse --walk-reflogs",
        [
          ["--abbrev", "number"],
          ["--format", "string"],
          ["--grep", "string"],
          ["--max-age", "number"],
          ["--max-parents", "number"],
          ["--min-age", "number"],
          ["--min-parents", "number"],
          ["--pretty", "string"],
          ["--skip", "number"],
        ],
      ),
    ),
    gitRevisionFormatCommandIsDangerous,
  ),
  queryEntry(
    "git rev-parse",
    flagChart(
      "--abbrev-ref --absolute-git-dir --git-common-dir --git-dir --is-bare-repository " +
        "--is-inside-git-dir --is-inside-work-tree --is-shallow-repository --is-shallow-update " +
        "--path-prefix --show-cdup --show-prefix --show-superproject-working-tree --show-toplevel " +
        "--symbolic --symbolic-full-name --verify",
      [["--short", "string"]],
    ),
  ),
  queryEntry(
    "git shortlog",
    compose(
      COMMON_GIT_REF_FLAGS,
      COMMON_GIT_DATE_FLAGS,
      flagChart("-c -e -n -s --committer --email --no-merges --numbered --summary", [
        ["--author", "string"],
        ["--format", "string"],
        ["--group", "string"],
      ]),
    ),
    gitRevisionFormatCommandIsDangerous,
  ),
  queryEntry("git show", GIT_SHOW_SAFE_FLAGS, gitRevisionFormatCommandIsDangerous),
  queryEntry(
    "git stash list",
    compose(COMMON_GIT_LOG_STYLE_FLAGS, COMMON_GIT_REF_FLAGS, COMMON_GIT_COUNT_FLAGS),
  ),
  queryEntry(
    "git stash show",
    compose(
      COMMON_GIT_STAT_FLAGS,
      COMMON_GIT_COLOR_FLAGS,
      COMMON_GIT_PATCH_FLAGS,
      flagChart("--word-diff", [
        ["--abbrev", "number"],
        ["--diff-filter", "string"],
        ["--word-diff-regex", "string"],
      ]),
    ),
  ),
  queryEntry("git status", GIT_STATUS_SAFE_FLAGS),
  queryEntry(
    "git tag",
    flagChart("-i -l --column --ignore-case --list --no-column", [
      ["-n", "number"],
      ["--contains", "string"],
      ["--format", "string"],
      ["--merged", "string"],
      ["--no-contains", "string"],
      ["--no-merged", "string"],
      ["--points-at", "string"],
      ["--sort", "string"],
    ]),
    gitTagCommandIsDangerous,
  ),
  queryEntry("git worktree list", flagChart("-v --porcelain --verbose", [["--expire", "string"]])),
];

// remote 的其余子命令（add/remove/rename/set-url）都会改配置，只放行纯展示用法。
function remoteListingEntry(): ReadonlyEntry {
  const policy: BashReadonlyCommandPolicy = {
    safeFlags: flagChart("-v --verbose"),
    additionalCommandIsDangerousCallback: (_subject, rest) =>
      rest.some((token) => token !== "-v" && token !== "--verbose"),
  };
  return ["git remote", policy];
}
