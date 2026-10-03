// SPDX-License-Identifier: Apache-2.0
// Contract-authored bounded scheduling; source review and verification pending.
import { WORKSPACE_FILE_TREE_WATCH_REFRESH_CONCURRENCY } from "./constants.js";

export async function withFileTreeDeadline<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Workers share a cursor; a failed worker does not stop other workers or reject the batch. */
export async function refreshFileTreePaths(
  paths: string[], accepts: () => boolean, refresh: (path: string) => Promise<void>,
): Promise<void> {
  const uniquePaths = [...new Set(paths)];
  let cursor = 0;
  const worker = async () => {
    while (cursor < uniquePaths.length && accepts()) {
      const path = uniquePaths[cursor++];
      if (path) await refresh(path);
    }
  };
  const count = Math.min(WORKSPACE_FILE_TREE_WATCH_REFRESH_CONCURRENCY, uniquePaths.length);
  await Promise.allSettled(Array.from({ length: count }, worker));
}
