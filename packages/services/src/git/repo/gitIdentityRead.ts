// Exposed fixed config keys, argv and identity shape retained; contribution review is separate.
import type { GitIdentity } from "@knorvia/shared";
import { DEFAULT_GIT_COMMAND_TIMEOUT_MS } from "../config.js";
import type {
  GitCommandExecutionResult,
  GitCommandProvider,
} from "../providers/gitCommandProvider.js";
import { parseGitConfigValue } from "./gitCliHelpers.js";
import type { GitResolvedRepository } from "./gitCliTypes.js";

const settings = ["user.name", "user.email"] as const;
const bindings = [
  ["userName", 0, "value"],
  ["userEmail", 1, "value"],
  ["nameSource", 0, "source"],
  ["emailSource", 1, "source"],
] as const;

export function emptyGitIdentity(): GitIdentity {
  return { userName: null, userEmail: null, nameSource: null, emailSource: null, scopeLabel: null };
}

// 构造请求必须同步，不能在两个 run 之间或原 Promise.all 外再添加 await。
export function readGitIdentity(
  commandProvider: GitCommandProvider,
  resolution: GitResolvedRepository,
): Promise<GitCommandExecutionResult>[] {
  const reads: Promise<GitCommandExecutionResult>[] = [];
  for (const key of settings) {
    reads.push(
      commandProvider.run({
        cwd: resolution.repoRoot,
        args: ["config", "--show-scope", "--show-origin", "--get", key],
        timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
      }),
    );
  }
  return reads;
}

export function projectGitIdentity(results: readonly GitCommandExecutionResult[]): GitIdentity {
  const decoded = settings.map((_, index) => parseGitConfigValue(results[index]!));
  const identity = emptyGitIdentity();
  for (const [field, index, source] of bindings) identity[field] = decoded[index]![source];
  identity.scopeLabel = decoded[0]!.scope ?? decoded[1]!.scope ?? null;
  return identity;
}
