import type {
  GitCommandProvider,
  GitCommandExecutionOptions,
} from "../providers/gitCommandProvider.js";
import type { GitResolvedRepository } from "./gitCliTypes.js";

import { DEFAULT_GIT_COMMAND_TIMEOUT_MS as COMMAND_TIMEOUT } from "../config.js";

export {
  DEFAULT_GIT_COMMAND_TIMEOUT_MS as COMMAND_TIMEOUT,
  DEFAULT_GIT_DIFF_TIMEOUT_MS as DIFF_TIMEOUT,
  DEFAULT_GIT_PUSH_TIMEOUT_MS as PUSH_TIMEOUT,
  DEFAULT_GIT_OUTPUT_BYTES as OUTPUT_BYTES,
  DEFAULT_GIT_DIFF_BYTES as DIFF_BYTES,
  DEFAULT_GIT_PUSH_OUTPUT_BYTES as PUSH_OUTPUT_BYTES,
} from "../config.js";

export interface RepoOwner {
  provider: GitCommandProvider;
  invalidate(workspacePath: string): void;
}

export function runAt(
  owner: RepoOwner,
  resolution: Pick<GitResolvedRepository, "repoRoot">,
  args: string[],
  options: Omit<GitCommandExecutionOptions, "cwd" | "args"> = {},
) {
  return owner.provider.run({
    cwd: resolution.repoRoot,
    args,
    timeoutMs: COMMAND_TIMEOUT,
    ...options,
  });
}

export function inFlight<T>(
  map: Map<string, Promise<T>>,
  key: string,
  start: () => Promise<T>,
): Promise<T> {
  const active = map.get(key);
  if (active) return active;
  const pending = start();
  map.set(key, pending);
  const release = () => {
    if (map.get(key) === pending) map.delete(key);
  };
  void pending.then(release, release);
  return pending;
}
