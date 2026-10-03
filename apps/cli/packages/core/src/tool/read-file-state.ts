// Snapshot lookup contract: specs/knorvia-read-state-snapshots.md.
// Existing repository licence remains applicable pending source review.
import { platform } from "node:process";
import { normalizeToolPathForComparison } from "./path-normalization.js";
import type { ReadFileStateEntry, ReadFileStateMap } from "./types.js";

export function createReadFileStateKey(
  filePath: string,
  offset: number | undefined,
  limit: number | undefined,
  target: NodeJS.Platform = platform,
): string {
  const path = normalizeToolPathForComparison(filePath, target);
  return `${path}\0${offset ?? 1}\0${limit === undefined ? "" : limit}`;
}

export function normalizeReadFileStateMtimeMs(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.floor(value);
}

export function findLatestReadFileState(
  states: ReadFileStateMap | undefined,
  filePath: string,
  target: NodeJS.Platform = platform,
): ReadFileStateEntry | undefined {
  if (!states) return undefined;
  const path = normalizeToolPathForComparison(filePath, target);
  let winner: ReadFileStateEntry | undefined;
  for (const candidate of states.values()) {
    const sameFile = normalizeToolPathForComparison(candidate.path, target) === path;
    if (!sameFile) continue;
    const older = candidate.readAt.getTime() < (winner?.readAt.getTime() ?? -Infinity);
    if (!older) winner = candidate;
  }
  return winner;
}

export function findEditableReadFileState(
  states: ReadFileStateMap | undefined,
  filePath: string,
  target: NodeJS.Platform = platform,
): ReadFileStateEntry | undefined {
  // 新的范围读取也推进文件水位；不能用旧全文快照遮住它而反复误报 stale。
  // 是否允许 partial 编辑仍由既有 Edit/Write 消费者判定。
  return findLatestReadFileState(states, filePath, target);
}
