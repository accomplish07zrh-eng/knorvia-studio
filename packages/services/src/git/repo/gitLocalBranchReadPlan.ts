// Source-exposed parser/query compatibility; no whole-file originality grant.
import type { GitLocalBranch, GitLocalBranchListResult } from "@knorvia/shared";
import { DEFAULT_GIT_COMMAND_TIMEOUT_MS, DEFAULT_GIT_OUTPUT_BYTES } from "../config.js";
import type {
  GitCommandExecutionOptions,
  GitCommandExecutionResult,
} from "../providers/gitCommandProvider.js";
import { ensureGitCommandSucceeded } from "./gitCliHelpers.js";
import type { GitStatusSnapshot } from "./gitCliTypes.js";

type LocalBranchOperation =
  | { kind: "status" }
  | { kind: "refs"; command: GitCommandExecutionOptions };

function orderBranches(left: GitLocalBranch, right: GitLocalBranch): number {
  // 保留原排序表达式与运行时 localeCompare，包括重复项和无效时间戳的稳定顺序。
  if (left.isCurrent !== right.isCurrent) return left.isCurrent ? -1 : 1;
  const leftTimestamp = left.commitTimestampMs ?? Number.NEGATIVE_INFINITY;
  const rightTimestamp = right.commitTimestampMs ?? Number.NEGATIVE_INFINITY;
  if (leftTimestamp !== rightTimestamp) return rightTimestamp - leftTimestamp;
  return left.name.localeCompare(right.name);
}

function readBranchRecords(stdout: string, currentBranchName: string | null): GitLocalBranch[] {
  const branches: GitLocalBranch[] = [];
  // 一次有序遍历负责接纳记录；不去重、不修剪或重新解释 Git 字段。
  for (const line of stdout.replace(/\r\n/g, "\n").split("\n")) {
    if (line.length === 0) continue;
    const [name, upstreamName, commitHash, commitTimestamp] = line.split("\0");
    if (!name) continue;
    const timestampSeconds = commitTimestamp ? Number.parseInt(commitTimestamp, 10) : Number.NaN;
    branches.push({
      name,
      isCurrent: name === currentBranchName,
      upstreamName: upstreamName || null,
      commitHash: commitHash || null,
      commitTimestampMs: Number.isNaN(timestampSeconds) ? null : timestampSeconds * 1000,
    });
  }
  return branches.sort(orderBranches);
}

// 同步程序只决定请求/投影；原入口继续拥有 status 和 refs 的两个 await。
export function* planGitLocalBranches(): Generator<
  LocalBranchOperation,
  GitLocalBranchListResult,
  unknown
> {
  const status = (yield { kind: "status" }) as GitStatusSnapshot;
  if (!status.resolution.isGitAvailable || !status.resolution.isRepository) {
    return {
      headRefType: status.summary.headRefType,
      currentBranchName: status.summary.branchName,
      branches: [],
    };
  }
  const result = (yield {
    kind: "refs",
    command: {
      cwd: status.resolution.repoRoot,
      args: [
        "for-each-ref",
        "refs/heads",
        "--format=%(refname:short)%00%(upstream:short)%00%(objectname)%00%(committerdate:unix)",
      ],
      timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
      maxOutputBytes: DEFAULT_GIT_OUTPUT_BYTES,
    },
  }) as GitCommandExecutionResult;
  ensureGitCommandSucceeded("git for-each-ref refs/heads", result);
  return {
    headRefType: status.summary.headRefType,
    currentBranchName: status.summary.branchName,
    branches: readBranchRecords(
      result.stdout,
      status.summary.headRefType === "branch" ? status.summary.branchName : null,
    ),
  };
}
