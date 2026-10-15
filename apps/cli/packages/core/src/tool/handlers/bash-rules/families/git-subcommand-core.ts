// SPDX-License-Identifier: Apache-2.0
// git 只读子命令画像（查询与内容检视族）：blame/branch/cat-file/config --get/describe/
// diff/for-each-ref/grep/log/ls-files。依据 git 公开手册整理，只收录读取类旗标。
import {
  gitBranchCommandIsDangerous,
  gitRevisionFormatCommandIsDangerous,
} from "../../bash-readonly-policy-callbacks.js";
import { flagChart } from "../flag-builder.js";
import type { BashReadonlyCommandPolicy } from "../policy-shapes.js";
import { compose, queryEntry, type ReadonlyEntry } from "./entry-builder.js";
import {
  COMMON_GIT_COLOR_FLAGS,
  GIT_DIFF_SAFE_FLAGS,
  GIT_GREP_SAFE_FLAGS,
  GIT_LOG_SAFE_FLAGS,
} from "./git-flags.js";

export const GIT_READONLY_SUBCOMMAND_POLICY_ENTRIES_CORE: readonly ReadonlyEntry[] = [
  queryEntry(
    "git blame",
    compose(
      COMMON_GIT_COLOR_FLAGS,
      flagChart(
        "-C -M -e -f -l -n -p -s -t -w --incremental --line-porcelain --porcelain --root " +
          "--score-debug --show-email --show-name --show-number --show-stats",
        [
          ["-L", "string"],
          ["--abbrev", "number"],
          ["--date", "string"],
          ["--ignore-rev", "string"],
          ["--ignore-revs-file", "string"],
        ],
      ),
    ),
  ),
  queryEntry(
    "git branch",
    flagChart(
      "-a -i -l -r -v -vv --all --color --column --ignore-case --list --merged --no-abbrev " +
        "--no-color --no-column --no-merged --remotes --show-current --verbose",
      [
        ["--abbrev", "number"],
        ["--contains", "string"],
        ["--no-contains", "string"],
        ["--points-at", "string"],
        ["--sort", "string"],
      ],
    ),
    gitBranchCommandIsDangerous,
  ),
  queryEntry("git cat-file", flagChart("-e -p -s -t --allow-undetermined-type --batch-check")),
  queryEntry(
    "git config --get",
    flagChart(
      "-z --bool --bool-or-int --expiry-date --global --int --local --name-only --null --path " +
        "--show-origin --show-scope --system --worktree",
      [
        ["--default", "string"],
        ["--type", "string"],
      ],
    ),
  ),
  queryEntry(
    "git describe",
    flagChart("--always --broken --contains --dirty --exact-match --first-match --long --tags", [
      ["--abbrev", "number"],
      ["--candidates", "number"],
      ["--exclude", "string"],
      ["--match", "string"],
    ]),
  ),
  queryEntry("git diff", GIT_DIFF_SAFE_FLAGS),
  queryEntry(
    "git for-each-ref",
    flagChart("", [
      ["--contains", "string"],
      ["--count", "number"],
      ["--format", "string"],
      ["--merged", "string"],
      ["--no-contains", "string"],
      ["--no-merged", "string"],
      ["--points-at", "string"],
      ["--sort", "string"],
    ]),
    gitRevisionFormatCommandIsDangerous,
  ),
  queryEntry("git grep", GIT_GREP_SAFE_FLAGS),
  logEntry(),
  queryEntry(
    "git ls-files",
    flagChart(
      "-c -d -f -i -k -m -o -s -t -u -v -z --cached --debug --deleted --directory --eol " +
        "--error-unmatch --exclude-standard --full-name --ignored --killed --modified " +
        "--no-empty-directory --others --recurse-submodules --stage --unmerged",
      [
        ["-x", "string"],
        ["-X", "string"],
        ["--abbrev", "number"],
        ["--exclude", "string"],
        ["--exclude-from", "string"],
        ["--exclude-per-directory", "string"],
      ],
    ),
  ),
];

// `git log -8` 是历史查询的只读 max-count 缩写，由画像显式声明放行。
function logEntry(): ReadonlyEntry {
  const policy: BashReadonlyCommandPolicy = {
    allowCompactNumericCountFlag: true,
    safeFlags: GIT_LOG_SAFE_FLAGS,
    additionalCommandIsDangerousCallback: gitRevisionFormatCommandIsDangerous,
  };
  return ["git log", policy];
}
