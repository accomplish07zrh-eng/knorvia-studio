// SPDX-License-Identifier: Apache-2.0
// GitHub CLI 查询族的多词前缀画像：issue/pr/release/run/workflow/search 的只读查询。
// 仓库旗标组（-R/--repo 及其 limit/json 扩展）为公共底座；触达 GitHub API 的查询
// 额外挂远端路径复核，防止参数里夹带 owner/repo 去访问别的仓库。
import { ghCommandIsDangerous } from "../../bash-readonly-policy-callbacks.js";
import { flagChart } from "../flag-builder.js";
import type { SafeFlagValue } from "../policy-shapes.js";
import { compose, queryEntry, type ReadonlyEntry } from "./entry-builder.js";
import { GH_JSON_REPO_FLAGS, GH_LIMIT_REPO_FLAGS, GH_REPO_FLAGS } from "./process-flags.js";

interface GhQueryShape {
  prefix: string;
  base: Readonly<Record<string, SafeFlagValue>>;
  switches?: string;
  valued?: ReadonlyArray<readonly [string, SafeFlagValue]>;
  /** 查询会触达 GitHub API 时附加远端路径复核。 */
  guarded?: boolean;
}

const JSON_ONLY_REPO_VIEW = flagChart("", [["--json", "string"]]);

const GH_READ_QUERIES: readonly GhQueryShape[] = [
  {
    prefix: "gh issue list",
    base: GH_LIMIT_REPO_FLAGS,
    valued: stringOptions("-s --app --assignee --author --label --milestone --search --state"),
    guarded: true,
  },
  { prefix: "gh issue status", base: GH_JSON_REPO_FLAGS, guarded: true },
  {
    prefix: "gh issue view",
    base: GH_JSON_REPO_FLAGS,
    switches: "--comments",
    guarded: true,
  },
  {
    prefix: "gh label list",
    base: GH_LIMIT_REPO_FLAGS,
    valued: stringOptions("-S --order --search --sort"),
    guarded: true,
  },
  {
    prefix: "gh pr checks",
    base: GH_JSON_REPO_FLAGS,
    switches: "--fail-fast --required --watch",
    valued: [["--interval", "number"]],
    guarded: true,
  },
  {
    prefix: "gh pr diff",
    base: GH_REPO_FLAGS,
    switches: "--name-only --patch",
    valued: [["--color", "string"]],
    guarded: true,
  },
  {
    prefix: "gh pr list",
    base: GH_LIMIT_REPO_FLAGS,
    switches: "--draft",
    valued: stringOptions("-L -s --app --assignee --author --base --head --label --search --state"),
    guarded: true,
  },
  {
    prefix: "gh pr status",
    base: GH_JSON_REPO_FLAGS,
    switches: "-c --conflict-status",
    guarded: true,
  },
  { prefix: "gh pr view", base: GH_JSON_REPO_FLAGS, switches: "--comments", guarded: true },
  {
    prefix: "gh release list",
    base: GH_LIMIT_REPO_FLAGS,
    switches: "--exclude-drafts --exclude-pre-releases",
    valued: stringOptions("-O --order"),
    guarded: true,
  },
  { prefix: "gh release view", base: GH_JSON_REPO_FLAGS, guarded: true },
  { prefix: "gh repo view", base: JSON_ONLY_REPO_VIEW, guarded: true },
  {
    prefix: "gh run list",
    base: GH_LIMIT_REPO_FLAGS,
    valued: stringOptions(
      "-b -c -e -s -u -w --branch --commit --created --event --status --user --workflow",
    ),
    guarded: true,
  },
  {
    prefix: "gh run view",
    base: GH_JSON_REPO_FLAGS,
    switches: "-v --exit-status --log --log-failed --verbose",
    valued: [
      ["-a", "number"],
      ["-j", "string"],
      ["--attempt", "number"],
      ["--job", "string"],
    ],
    guarded: true,
  },
  {
    prefix: "gh search code",
    base: GH_LIMIT_REPO_FLAGS,
    valued: stringOptions("--extension --filename --language --match --owner --size"),
  },
  {
    prefix: "gh search commits",
    base: GH_LIMIT_REPO_FLAGS,
    switches: "--merge",
    valued: stringOptions(
      "--author --author-date --author-email --author-name --committer --committer-date " +
        "--committer-email --committer-name --hash --order --owner --parent --sort --tree " +
        "--visibility",
    ),
  },
  {
    prefix: "gh search issues",
    base: GH_LIMIT_REPO_FLAGS,
    switches: "--include-prs --locked --no-assignee --no-label --no-milestone --no-project",
    valued: stringOptions(
      "-R --app --assignee --author --closed --commenter --comments --created --interactions " +
        "--involves --label --language --match --mentions --milestone --order --owner --project " +
        "--reactions --sort --state --team-mentions --updated --visibility",
    ),
  },
  {
    prefix: "gh search prs",
    base: GH_LIMIT_REPO_FLAGS,
    switches: "--draft --locked --merged",
    valued: stringOptions(
      "-B -H -R --app --assignee --author --base --checks --closed --commenter --comments " +
        "--created --head --interactions --involves --label --language --match --mentions " +
        "--merged-at --milestone --order --owner --project --reactions --review " +
        "--review-requested --reviewed-by --sort --state --team-mentions --updated --visibility",
    ),
  },
  {
    prefix: "gh search repos",
    base: GH_LIMIT_REPO_FLAGS,
    switches: "--archived",
    valued: stringOptions(
      "--created --followers --forks --good-first-issues --help-wanted-issues --include-forks " +
        "--language --license --match --number-topics --order --owner --size --sort --stars " +
        "--topic --updated --visibility",
    ),
  },
  {
    prefix: "gh workflow list",
    base: GH_LIMIT_REPO_FLAGS,
    switches: "-a --all",
    guarded: true,
  },
  {
    prefix: "gh workflow view",
    base: GH_REPO_FLAGS,
    switches: "-y --yaml",
    valued: stringOptions("-r --ref"),
    guarded: true,
  },
];

export const READONLY_MULTIWORD_POLICY_ENTRIES_GH: readonly ReadonlyEntry[] = GH_READ_QUERIES.map(
  (shape) =>
    queryEntry(
      shape.prefix,
      compose(shape.base, flagChart(shape.switches ?? "", shape.valued ?? [])),
      shape.guarded ? ghCommandIsDangerous : undefined,
    ),
);

function stringOptions(list: string): ReadonlyArray<readonly [string, "string"]> {
  return list
    .split(" ")
    .filter(Boolean)
    .map((flag) => [flag, "string"] as const);
}
