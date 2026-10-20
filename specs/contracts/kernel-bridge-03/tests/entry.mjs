// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-03 契约测试的入口解析。
//
// 与 kernel-bridge-02 的 entry.mjs 同一做法：测试只走仓库内公开入口与包内导出，
// 不复制实现细节。本包是接入包、不替换任何旧实现，因此没有「桩门」这一环。

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** 仓库根目录。 */
export const repoRootPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** 公开 CLI 产物路径；端到端冒烟经它 spawn。 */
export const cliEntryPath = join(repoRootPath, "apps/cli/packages/cli/dist/knorvia.cjs");

/** 本包要读的协议事实源（34 条命令的唯一来源）。 */
export const commandSchemaPath = join(repoRootPath, "packages/shared/src/protocol-v4/command.ts");

/** legacy 端口方法表的唯一事实源（12 个方法）。 */
export const legacyMethodTablePath = join(
  repoRootPath,
  "apps/cli/packages/bootstrap/src/kernel-bridge/legacy/method-table.ts",
);

/** 本包夹具：命令归属账本。 */
export const ownershipFixturePath = join(
  repoRootPath,
  "specs/contracts/kernel-bridge-03/fixtures/command-ownership.json",
);

/**
 * 解析本次要驱动的 CLI 入口。
 *
 * @returns 入口的绝对路径。
 */
export function resolveBridgeEntry() {
  return cliEntryPath;
}

/**
 * 校验入口存在；缺失时立刻失败并说清下一步（先构建再跑）。
 *
 * 用具体错误类型而不是裸字符串，便于调用方分辨「没构建」与「构建坏了」。
 *
 * @param entry - 要检查的入口路径。
 * @throws 当构建产物缺失时。
 */
export function assertBridgeEntry(entry) {
  if (existsSync(entry)) return;
  const failure = Object.assign(
    new Error(`CLI entry not found: ${entry} — build the CLI packages first`),
    { name: "MissingCliBuildError", entry },
  );
  throw failure;
}
