// Source-exposed compatibility tokens/API/prose remain; expression review is separate.
import type { GitDiffQuery, GitDiffResult } from "@knorvia/shared";
import { isAbsolute, resolve, sep } from "node:path";
import {
  DEFAULT_GIT_DIFF_BYTES,
  DEFAULT_GIT_DIFF_TIMEOUT_MS,
  getGitNullDevicePath,
} from "../config.js";
import type {
  GitCommandExecutionResult,
  GitCommandProvider,
} from "../providers/gitCommandProvider.js";
import {
  buildUntrackedTextDiffResult,
  fileExists,
  normalizeInputPath,
  toDiffResult,
} from "./gitCliHelpers.js";
import type { GitCliRepo, GitResolvedRepository, GitStatusSnapshot } from "./gitCliTypes.js";

type DiffSelection = { kind: "branch"; baseRef: string } | { kind: "staged" | "worktree" };
type Contents = { beforeContent: string; afterContent: string } | null;
type ContentInput = {
  commandProvider: GitCommandProvider;
  repoRoot: string;
  repoRelativePath: string;
};
interface DiffReadPorts {
  repo: Pick<GitCliRepo, "resolveRepository" | "getStatus">;
  commandProvider: GitCommandProvider;
  branch: (input: ContentInput & { trackingBranchName: string }) => Promise<Contents>;
  staged: (input: ContentInput) => Promise<Contents>;
  worktree: (input: ContentInput & { absolutePath: string }) => Promise<Contents>;
  unavailable: (path: string, summary: string) => GitDiffResult;
  attach: (diff: GitDiffResult, contents: Contents) => GitDiffResult;
}

function assembleDiffArguments(selection: DiffSelection, repoRelativePath: string): string[] {
  const args = ["diff"];
  if (selection.kind === "staged") args.push("--cached");
  args.push("--no-ext-diff", "--no-color", "--binary");
  if (selection.kind === "branch") args.push("--find-renames", `${selection.baseRef}...HEAD`);
  args.push("--", repoRelativePath);
  return args;
}

// 同步计划只选择操作；入口逐个 await，且 thunk 保留接收者先于参数 getter 的读取顺序。
export function* planGitDiffRead(
  params: GitDiffQuery,
  ports: DiffReadPorts,
): Generator<() => unknown, GitDiffResult, unknown> {
  const { repo, commandProvider } = ports;
  const resolution = (yield () =>
    repo.resolveRepository(params.workspacePath)) as GitResolvedRepository;
  const absolutePath = isAbsolute(params.path)
    ? params.path
    : resolve(params.workspacePath, params.path.split("/").join(sep));
  if (!resolution.isGitAvailable)
    return ports.unavailable(
      absolutePath,
      "Git binary is not available in the current environment.",
    );
  if (!resolution.isRepository)
    return ports.unavailable(absolutePath, "Workspace is not inside a Git repository.");
  const repoRelativePath = (yield () => normalizeInputPath(resolution, params.path)) as string;

  let selection: DiffSelection;
  if (params.sourceId === "branch") {
    const status = (yield () => repo.getStatus(params.workspacePath)) as GitStatusSnapshot;
    const baseRef = status.summary.trackingBranchName;
    if (!baseRef)
      return ports.unavailable(absolutePath, "Current branch does not have an upstream branch.");
    selection = { kind: "branch", baseRef };
  } else {
    selection = { kind: (params.staged ?? params.sourceId === "staged") ? "staged" : "worktree" };
  }

  const result = (yield () =>
    commandProvider.run({
      cwd: resolution.repoRoot,
      args: assembleDiffArguments(selection, repoRelativePath),
      timeoutMs: DEFAULT_GIT_DIFF_TIMEOUT_MS,
      maxOutputBytes: DEFAULT_GIT_DIFF_BYTES,
    })) as GitCommandExecutionResult;
  const parsed = toDiffResult(absolutePath, result, {
    emptySummary:
      selection.kind === "branch"
        ? "No branch comparison diff is available for this file."
        : "No Git diff is available for this file.",
  });

  if (
    selection.kind !== "branch" &&
    parsed.availability === "unavailable" &&
    selection.kind === "worktree"
  ) {
    if (!(yield () => fileExists(absolutePath))) return parsed;
    const textPreview = (yield () =>
      buildUntrackedTextDiffResult(
        absolutePath,
        repoRelativePath,
        DEFAULT_GIT_DIFF_BYTES,
      )) as GitDiffResult | null;
    if (textPreview) return textPreview;
    const noIndex = (yield () =>
      commandProvider.run({
        cwd: resolution.repoRoot,
        args: [
          "diff",
          "--no-index",
          "--no-ext-diff",
          "--no-color",
          "--binary",
          getGitNullDevicePath(),
          absolutePath,
        ],
        timeoutMs: DEFAULT_GIT_DIFF_TIMEOUT_MS,
        maxOutputBytes: DEFAULT_GIT_DIFF_BYTES,
      })) as GitCommandExecutionResult;
    return toDiffResult(absolutePath, noIndex, {
      allowedExitCodes: [0, 1],
      emptySummary: "No previewable diff is available for this file.",
    });
  }

  const readContents =
    selection.kind === "branch"
      ? () =>
          ports.branch({
            commandProvider,
            repoRoot: resolution.repoRoot,
            repoRelativePath,
            trackingBranchName: selection.baseRef,
          })
      : selection.kind === "staged"
        ? () => ports.staged({ commandProvider, repoRoot: resolution.repoRoot, repoRelativePath })
        : () =>
            ports.worktree({
              absolutePath,
              commandProvider,
              repoRoot: resolution.repoRoot,
              repoRelativePath,
            });
  return ports.attach(parsed, (yield readContents) as Contents);
}
