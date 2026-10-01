// Source-exposed compatibility leaves remain; no whole-file originality grant.
import { DEFAULT_GIT_COMMAND_TIMEOUT_MS, DEFAULT_GIT_OUTPUT_BYTES } from "../config.js";
import type {
  GitCommandExecutionOptions,
  GitCommandExecutionResult,
} from "../providers/gitCommandProvider.js";
import { ensureGitCommandSucceeded, inferKindFromNumstat, parseNumstat } from "./gitCliHelpers.js";
import type {
  GitBranchComparisonChange,
  GitBranchComparisonSnapshot,
  GitStatusSnapshot,
} from "./gitCliTypes.js";

type ComparisonReadOperation =
  | { kind: "status" }
  | { kind: "diff"; command: GitCommandExecutionOptions };

function comparisonRecords(stdout: string): GitBranchComparisonChange[] {
  const changes: GitBranchComparisonChange[] = [];
  // 直接遍历原 numstat Map：保留首次位置/最后值、重命名与原有 kind 推断。
  for (const [path, stat] of parseNumstat(stdout).entries()) {
    changes.push({
      path,
      originalPath: stat.originalPath ?? null,
      kind: inferKindFromNumstat(stat),
      added: stat.added,
      removed: stat.removed,
    });
  }
  return changes;
}

// 同步决策程序不引入编排 Promise；入口继续拥有 status 和 diff 的 await。
export function* planGitBranchComparison(): Generator<
  ComparisonReadOperation,
  GitBranchComparisonSnapshot,
  unknown
> {
  const status = (yield { kind: "status" }) as GitStatusSnapshot;
  if (
    !status.resolution.isGitAvailable ||
    !status.resolution.isRepository ||
    !status.summary.trackingBranchName
  ) {
    return {
      resolution: status.resolution,
      baseRef: status.summary.trackingBranchName,
      headRef: status.summary.branchName ?? "HEAD",
      comparisonLabel: null,
      changes: [],
    };
  }
  const result = (yield {
    kind: "diff",
    command: {
      cwd: status.resolution.repoRoot,
      args: [
        "diff",
        "--numstat",
        "-z",
        "--find-renames",
        `${status.summary.trackingBranchName}...HEAD`,
        "--",
      ],
      timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
      maxOutputBytes: DEFAULT_GIT_OUTPUT_BYTES,
    },
  }) as GitCommandExecutionResult;
  ensureGitCommandSucceeded("git diff --numstat upstream...HEAD", result);
  const changes = comparisonRecords(result.stdout);
  return {
    resolution: status.resolution,
    baseRef: status.summary.trackingBranchName,
    headRef: status.summary.branchName ?? "HEAD",
    comparisonLabel: status.summary.branchName
      ? `${status.summary.branchName} -> ${status.summary.trackingBranchName}`
      : `HEAD -> ${status.summary.trackingBranchName}`,
    changes,
  };
}
