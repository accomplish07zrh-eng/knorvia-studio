// SPDX-License-Identifier: Apache-2.0
// Knorvia Studio contributors, 2026-09-30; provenance review pending.

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { maybeThrowStorageFsFault } from "../storage/fs-fault-injection.js";
import { formatLocalLogDate } from "./retention.js";

const RECORD_EXTENSION = ".jsonl";
const FILE_PREFIX = "knorvia-";

/** 目录缺失时按需创建；故障注入只影响真实 IO。 */
function ensureDirectory(logDirectory: string): void {
  if (existsSync(logDirectory)) return;
  maybeThrowStorageFsFault({ operation: "mkdir", path: logDirectory });
  mkdirSync(logDirectory, { recursive: true });
}

/** 当天日志文件：`knorvia-<本地日期>.jsonl`。 */
function recordPath(logDirectory: string, at: Date): string {
  const stamp = formatLocalLogDate(at);
  return join(logDirectory, FILE_PREFIX + stamp + RECORD_EXTENSION);
}

export function appendLogRecord(logDirectory: string, payload: string): void {
  try {
    ensureDirectory(logDirectory);
    const target = recordPath(logDirectory, new Date());
    maybeThrowStorageFsFault({ operation: "appendFile", path: target });
    appendFileSync(target, payload + "\n", "utf8");
  } catch {
    // 写入失败按 void 合同吞掉：调用层仍会收到 JSON/脱敏与 console 的错误。
  }
}
