// Source-exposed compatibility expressions remain; this is not a whole-file grant.
import { DEFAULT_GIT_COMMAND_TIMEOUT_MS, DEFAULT_GIT_OUTPUT_BYTES } from "../config.js";
import type {
  GitCommandExecutionOptions,
  GitCommandExecutionResult,
} from "../providers/gitCommandProvider.js";
import { ensureGitCommandSucceeded } from "./gitCliHelpers.js";
import type { GitResolvedRepository } from "./gitCliTypes.js";

interface IgnoredInputPair {
  absolutePath: string;
  repoRelativePath: string;
}

type IgnoredReadOperation =
  | { kind: "resolve" }
  | { kind: "normalize"; resolution: GitResolvedRepository; paths: string[] }
  | { kind: "check"; command: GitCommandExecutionOptions };

// 决策程序不创建 Promise；原入口保留 resolver、并行路径处理和命令的 await 所有权，
// 避免额外异步编排改变现有请求复用、清理与可见完成顺序。
export function* planGitIgnoredPaths(
  paths: string[],
): Generator<IgnoredReadOperation, string[], unknown> {
  if (paths.length === 0) return [];

  const resolution = (yield { kind: "resolve" }) as GitResolvedRepository;
  if (!resolution.isGitAvailable || !resolution.isRepository) return [];

  const inputPairs = (yield {
    kind: "normalize",
    resolution,
    paths,
  }) as Array<IgnoredInputPair | null>;
  const validInputPairs = inputPairs.filter((pair): pair is IgnoredInputPair => Boolean(pair));
  if (validInputPairs.length === 0) return [];

  const ignoredResult = (yield {
    kind: "check",
    command: {
      cwd: resolution.repoRoot,
      args: ["check-ignore", "--", ...validInputPairs.map((pair) => pair.repoRelativePath)],
      timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
      maxOutputBytes: DEFAULT_GIT_OUTPUT_BYTES,
    },
  }) as GitCommandExecutionResult;

  // 保留 exit=1 的原有提前返回优先级，包括同时标记超时/截断的合成响应。
  if (ignoredResult.exitCode === 1) return [];
  ensureGitCommandSucceeded("git check-ignore", ignoredResult);

  const ignoredRepoRelativePaths = new Set(
    ignoredResult.stdout
      // argv 输入维持普通换行协议；不新增 -z/--stdin 或改写 Git 引号语义。
      .split(/\r?\n/)
      .filter(Boolean)
      .map((path) => path.replace(/\\/g, "/")),
  );
  // 成员集合仅用于匹配；显示路径和重复项仍由输入顺序决定。
  const selected: string[] = [];
  for (const pair of validInputPairs) {
    if (ignoredRepoRelativePaths.has(pair.repoRelativePath)) selected.push(pair.absolutePath);
  }
  return selected;
}
