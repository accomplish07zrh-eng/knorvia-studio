// SPDX-License-Identifier: Apache-2.0
// git 族旗标画像：按「展示形态预设」与「子命令专属画像」两层组织。
// 预设（颜色/计数/日期/补丁/引用/统计/日志样式）被多个子命令共享，逐一具名导出，
// 取值语义以 git 公开手册为准；专属画像只补充该子命令自己的旗标。
import { flagChart } from "../flag-builder.js";
import type { SafeFlagValue } from "../policy-shapes.js";

// 展示形态预设：字面量保持精确取值语义（none/number/string），供子命令画像展开组合。
const GIT_DISPLAY_PRESETS = {
  color: {
    "--color": "none",
    "--no-color": "none",
  },
  count: {
    "-n": "number",
    "--max-count": "number",
  },
  dateRange: {
    "--after": "string",
    "--before": "string",
    "--since": "string",
    "--until": "string",
  },
  patch: {
    "-p": "none",
    "-s": "none",
    "--no-ext-diff": "none",
    "--no-patch": "none",
    "--patch": "none",
  },
  refs: {
    "--all": "none",
    "--branches": "none",
    "--remotes": "none",
    "--tags": "none",
  },
  stats: {
    "--name-only": "none",
    "--name-status": "none",
    "--numstat": "none",
    "--shortstat": "none",
    "--stat": "none",
  },
  logStyle: flagChart("--date --decorate --graph --no-decorate --oneline --relative-date"),
} as const satisfies Readonly<Record<string, Readonly<Record<string, SafeFlagValue>>>>;

export const COMMON_GIT_COLOR_FLAGS = GIT_DISPLAY_PRESETS.color;
export const COMMON_GIT_COUNT_FLAGS = GIT_DISPLAY_PRESETS.count;
export const COMMON_GIT_DATE_FLAGS = GIT_DISPLAY_PRESETS.dateRange;
export const COMMON_GIT_PATCH_FLAGS = GIT_DISPLAY_PRESETS.patch;
export const COMMON_GIT_REF_FLAGS = GIT_DISPLAY_PRESETS.refs;
export const COMMON_GIT_STAT_FLAGS = GIT_DISPLAY_PRESETS.stats;
export const COMMON_GIT_LOG_STYLE_FLAGS = GIT_DISPLAY_PRESETS.logStyle;

export const GIT_STATUS_SAFE_FLAGS = flagChart(
  "-b -s --ahead-behind --branch --column --ignored --long --no-ahead-behind --no-column " +
    "--no-renames --porcelain --renames --short --verbose -v",
  [
    ["-M", "string"],
    ["-u", "string"],
    ["--find-renames", "string"],
    ["--ignore-submodules", "string"],
    ["--untracked-files", "string"],
  ],
);

export const GIT_DIFF_SAFE_FLAGS = flagChart(
  "-B -C -D -M -R -l -p -s -u --cached --check --color --color-words --dirstat --exit-code " +
    "--find-copies --find-copies-harder --find-renames --full-index --function-context " +
    "--histogram --ignore-all-space --ignore-blank-lines --ignore-space-at-eol " +
    "--ignore-space-change --irreversible-delete --minimal --name-only --name-status " +
    "--no-ext-diff --no-index --no-renames --no-color --numstat --patch-with-stat --patience " +
    "--pickaxe-all --pickaxe-regex --quiet --shortstat --staged --stat --summary --word-diff",
  [
    ["-G", "string"],
    ["-O", "string"],
    ["-S", "string"],
    ["--diff-algorithm", "string"],
    ["--diff-filter", "string"],
    ["--inter-hunk-context", "number"],
    ["--relative", "string"],
    ["--word-diff-regex", "string"],
    ["--ws-error-highlight", "string"],
  ],
);

// log = 阅读历史所需的全部预设 + 提交筛选与输出整形专属旗标。
export const GIT_LOG_SAFE_FLAGS: Readonly<Record<string, SafeFlagValue>> = {
  ...GIT_DISPLAY_PRESETS.logStyle,
  ...GIT_DISPLAY_PRESETS.refs,
  ...GIT_DISPLAY_PRESETS.dateRange,
  ...GIT_DISPLAY_PRESETS.count,
  ...GIT_DISPLAY_PRESETS.stats,
  ...GIT_DISPLAY_PRESETS.color,
  ...GIT_DISPLAY_PRESETS.patch,
  ...flagChart(
    (
      "--abbrev-commit --ancestry-path --author-date-order --boundary --cherry-mark --cherry-pick " +
      "--date-order --dense --first-parent --full-history --left-right --merges --no-max-parents " +
      "--no-merges --no-min-parents --no-walk --pickaxe-all --pickaxe-regex --reverse " +
      "--simplify-merges --source --sparse --topo-order --walk-reflogs"
    )
      .split(" ")
      .join(" "),
    [
      ["-G", "string"],
      ["-S", "string"],
      ["--author", "string"],
      ["--committer", "string"],
      ["--diff-filter", "string"],
      ["--format", "string"],
      ["--grep", "string"],
      ["--max-age", "number"],
      ["--min-age", "number"],
      ["--pretty", "string"],
      ["--skip", "number"],
    ],
  ),
};

// show = 日志样式/统计/颜色/补丁预设 + 单提交展示专属旗标。
export const GIT_SHOW_SAFE_FLAGS: Readonly<Record<string, SafeFlagValue>> = {
  ...GIT_DISPLAY_PRESETS.logStyle,
  ...GIT_DISPLAY_PRESETS.stats,
  ...GIT_DISPLAY_PRESETS.color,
  ...GIT_DISPLAY_PRESETS.patch,
  ...flagChart("-m --abbrev-commit --color-words --first-parent --quiet --raw --word-diff", [
    ["--diff-filter", "string"],
    ["--format", "string"],
    ["--pretty", "string"],
    ["--word-diff-regex", "string"],
  ]),
};

export const GIT_GREP_SAFE_FLAGS = flagChart(
  "-E -F -G -H -L -P -c -h -i -l -n -o -q -v -w --and --basic-regexp --break --cached --color " +
    "--count --extended-regexp --files-with-matches --files-without-match --fixed-strings " +
    "--full-name --heading --ignore-case --invert-match --line-number --no-color --no-index " +
    "--not --only-matching --or --perl-regexp --quiet --recurse-submodules --untracked " +
    "--word-regexp",
  [
    ["-A", "number"],
    ["-B", "number"],
    ["-C", "number"],
    ["-e", "string"],
    ["--after-context", "number"],
    ["--before-context", "number"],
    ["--context", "number"],
    ["--max-depth", "number"],
    ["--threads", "number"],
  ],
);
