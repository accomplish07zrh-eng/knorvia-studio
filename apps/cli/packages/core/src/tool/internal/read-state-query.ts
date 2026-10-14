// SPDX-License-Identifier: Apache-2.0
// 读取状态快照的查询契约（specs/knorvia-read-state-snapshots.md）。
//
// 这一层解决的问题：Agent 读到文件后要把「读到过什么」记下来，后续 Edit/Write 才能判断
// 「这次改动是不是基于我读过的那一版」。记录本身由调用方持有（ReadFileStateMap），这里只做查询。
//
// 语义与不变量：
// 1. 键按**比较用路径**归一：盘符大小写、Git Bash 别名（/c/...）、NFC 组合都会被折叠成同一个键，
//    所以同一文件的不同写法不会产生两条记录。
// 2. 键的第三段用 NUL 分隔：路径里可能出现空格、冒号甚至换行，用 NUL 才不会与内容冲突。
// 3. offset 缺省按 1 处理；limit 缺省写成空串（不是 "undefined"），保证同一窗口只有一个键。
// 4. mtime 只向下取整：文件系统的亚毫秒精度在跨平台与跨工具链上不可靠，向上取整会制造假 stale。
// 5. 同一路径有多条记录时取 readAt 最新的一条；时间相同时取后遍历到的那条，与旧行为一致。
// 6. 范围读取（offset/limit）同样推进水位：不能拿旧的全量快照遮住它，否则会反复误报 stale；
//    是否允许部分编辑由既有 Edit/Write 消费者判定，这里不做额外过滤。
//
// 这些函数不持有状态、不写任何东西，也不做 I/O：全部输入来自参数，输出可预测。

/** 调用方给出的路径原文；是否归一由本模块决定。 */
type FilePathInput = string;
/** 比较用平台；默认取宿主平台。 */
type PathPlatform = NodeJS.Platform;
/** 可缺省的窗口参数（offset / limit）。 */
type OptionalCount = number | undefined;

import { platform } from "node:process";
import { normalizeToolPathForComparison } from "../path-normalization.js";
import type { ReadFileStateEntry, ReadFileStateMap } from "../types.js";

/** 键的三段分隔符。 */
const KEY_SEPARATOR = "\0";
const DEFAULT_OFFSET = 1;

export function createReadFileStateKey(
  filePath: FilePathInput,
  offset: OptionalCount,
  limit: OptionalCount,
  target: PathPlatform = platform,
): string {
  const comparisonPath = normalizeToolPathForComparison(filePath, target);
  const start = offset ?? DEFAULT_OFFSET;
  const end = limit === undefined ? "" : String(limit);
  return [comparisonPath, String(start), end].join(KEY_SEPARATOR);
}

export function normalizeReadFileStateMtimeMs(value: OptionalCount): OptionalCount {
  return value === undefined ? value : Math.floor(value);
}

export function findLatestReadFileState(
  states: ReadFileStateMap | undefined,
  filePath: FilePathInput,
  target: PathPlatform = platform,
): ReadFileStateEntry | undefined {
  if (states === undefined) return undefined;
  const wanted = normalizeToolPathForComparison(filePath, target);
  let latest: ReadFileStateEntry | undefined;
  for (const entry of states.values()) {
    if (normalizeToolPathForComparison(entry.path, target) !== wanted) continue;
    const isNewer = latest === undefined || entry.readAt.getTime() >= latest.readAt.getTime();
    if (isNewer) latest = entry;
  }
  return latest;
}

export function findEditableReadFileState(
  states: ReadFileStateMap | undefined,
  filePath: string,
  target: NodeJS.Platform = platform,
): ReadFileStateEntry | undefined {
  return findLatestReadFileState(states, filePath, target);
}
