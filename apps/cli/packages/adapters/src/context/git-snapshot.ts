// SPDX-License-Identifier: Apache-2.0
// git 快照：只读探针 + 纯格式化；不写仓库、不加锁（status/log 显式 --no-optional-locks）。
import type { EnvInfo } from "@knorvia/contracts";
import { gitCommandSucceeds, readGitScalar, readGitText } from "./git-runner.js";

const STATUS_CHARACTER_BUDGET = 2_000;
const RECENT_COMMIT_LIMIT = 5;
const MAIN_FALLBACK = "main";
const MAIN_CANDIDATES = ["main", "master"];
const WORKTREE_CHECK = ["rev-parse", "--is-inside-work-tree"];
const BRANCH_PROBE = ["rev-parse", "--abbrev-ref", "HEAD"];
const USER_PROBE = ["config", "user.name"];
const STATUS_PROBE = ["--no-optional-locks", "status", "--short"];
const RECENT_PROBE = ["--no-optional-locks", "log", "--oneline", "-n", String(RECENT_COMMIT_LIMIT)];
const ORIGIN_HEAD_PROBE = ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"];

export async function resolveGitSnapshot(workingDirectory: string): Promise<Partial<EnvInfo>> {
  if ((await readGitScalar({ args: WORKTREE_CHECK, cwd: workingDirectory })) !== "true") {
    return { isGitRepository: false, gitStatus: "not_repo" };
  }

  const snapshot: Partial<EnvInfo> = { isGitRepository: true };
  snapshot.gitBranch =
    (await readGitScalar({ args: BRANCH_PROBE, cwd: workingDirectory })) ?? "HEAD";
  snapshot.gitMainBranch = await detectMainBranch(workingDirectory);
  snapshot.gitUser = await readGitScalar({ args: USER_PROBE, cwd: workingDirectory });
  const statusLines = toStatusLines(
    (await readGitText({ args: STATUS_PROBE, cwd: workingDirectory })).trim(),
  );
  snapshot.gitStatusLines = statusLines;
  snapshot.gitStatus = statusLines.length > 0 ? "dirty" : "clean";
  snapshot.recentCommits = toCommitLines(
    await readGitText({ args: RECENT_PROBE, cwd: workingDirectory }),
  ).slice(0, RECENT_COMMIT_LIMIT);
  return snapshot;
}

async function detectMainBranch(workingDirectory: string): Promise<string> {
  const originHead = await readGitScalar({ args: ORIGIN_HEAD_PROBE, cwd: workingDirectory });
  const candidates = MAIN_CANDIDATES.slice();
  if (originHead?.startsWith("origin/") === true) candidates.unshift(originHead.slice(7));
  for (let index = 0; index < candidates.length; index += 1) {
    const reference = `refs/remotes/origin/${candidates[index]}`;
    if (
      await gitCommandSucceeds({
        args: ["show-ref", "--verify", "--quiet", reference],
        cwd: workingDirectory,
      })
    ) {
      return candidates[index]!;
    }
  }
  return MAIN_FALLBACK;
}

/** provider 可见的 status 只按字符数截断（不按文件条目数），与既有 prompt 形状一致。 */
function toStatusLines(text: string): string[] {
  const lines: string[] = [];
  if (text.length === 0) return lines;
  const bounded =
    text.length > STATUS_CHARACTER_BUDGET
      ? `${text.slice(0, STATUS_CHARACTER_BUDGET)}\n${truncationNotice()}`
      : text;
  for (const raw of bounded.split(/\r?\n/u)) {
    if (raw.length > 0) lines.push(raw);
  }
  return lines;
}

function truncationNotice(): string {
  const tool = process.platform === "win32" ? "PowerShell" : "Bash";
  return `... (truncated because it exceeds 2k characters. If you need more information, run "git status" using ${tool})`;
}

function toCommitLines(text: string): string[] {
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/u)) {
    const trimmed = raw.trimEnd();
    if (trimmed.length > 0) lines.push(trimmed);
  }
  return lines;
}
