// SPDX-License-Identifier: Apache-2.0
// shared-01 合同夹具装载（录制帧与旧写样例，全部由旧实现录制）。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fixturesRoot = fileURLToPath(new URL("../fixtures/", import.meta.url));

function loadJson(relativePath) {
  return JSON.parse(readFileSync(resolve(fixturesRoot, relativePath), "utf8"));
}

function loadText(relativePath) {
  return readFileSync(resolve(fixturesRoot, relativePath), "utf8");
}

export const fixtures = {
  root: fixturesRoot,
  encodeCases: loadJson("frames/encode-cases.json"),
  measureCases: loadJson("frames/measure-cases.json"),
  stateInput: loadText("old-write/subagent-state.input.json"),
  // 逐字节金样存在 JSON 字符串容器里（仓库格式化会强制 JSON 文件末尾换行，
  // 直接存正文会被多加一个字节）；容器保证 bytes 与旧实现写回的字节逐字节一致。
  stateMigrated: loadJson("old-write/subagent-state.migrated.json").bytes,
  stateMigratedTwice: loadJson("old-write/subagent-state.migrated-twice.json").bytes,
  lockOwnerBytes: loadText("old-write/lock-owner.json"),
  pluginCacheLayout: loadJson("old-write/plugin-cache-layout.json"),
};

/** 与录制时相同的物理帧计量口径：utf8 JSON 字节数 + 1（NDJSON 换行）。 */
export function measureUtf8JsonPlusOne(wire) {
  return new TextEncoder().encode(JSON.stringify(wire)).byteLength + 1;
}
