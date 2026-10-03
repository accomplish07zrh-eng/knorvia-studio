// SPDX-License-Identifier: Apache-2.0
// Knorvia Studio contributors, 2026-09-30; provenance review pending.

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { maybeThrowStorageFsFault } from "../storage/fs-fault-injection.js";
import { formatLocalLogDate } from "./retention.js";

export function appendLogRecord(directory: string, json: string): void {
  try {
    if (!existsSync(directory)) {
      maybeThrowStorageFsFault({ operation: "mkdir", path: directory });
      mkdirSync(directory, { recursive: true });
    }
    const destination = join(directory, `knorvia-${formatLocalLogDate(new Date())}.jsonl`);
    maybeThrowStorageFsFault({ operation: "appendFile", path: destination });
    appendFileSync(destination, json + "\n", "utf8");
  } catch {
    // Logger 的 void 合同要求文件失败不阻断执行；JSON/脱敏与 console 错误在调用层传播。
  }
}
