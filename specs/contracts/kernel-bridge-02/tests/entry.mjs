// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-02 契约测试的入口解析。
//
// 测试只走公开产物：`apps/cli/packages/cli/dist/knorvia.cjs`（CI 先跑 build:cli-packages）。
// 本包是接入包、不替换任何旧实现，因此没有「桩门」这一环，也就不需要入口覆盖开关。
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** 仓库根目录。 */
export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** 公开 CLI 产物路径；契约测试全部经它 spawn `app-server --stdio`。 */
export const cliEntry = join(repoRoot, "apps/cli/packages/cli/dist/knorvia.cjs");

/**
 * 解析本次要驱动的 CLI 入口。
 *
 * @returns 入口的绝对路径。
 */
export function resolveBridgeEntry() {
  return cliEntry;
}

/**
 * 校验入口存在；缺失时立刻失败并说清下一步（先构建再跑）。
 * 用具体错误类型而不是裸字符串，便于调用方分辨「没构建」与「构建坏了」。
 *
 * @param entry - 要检查的入口路径。
 * @throws MissingCliBuildError 当构建产物缺失时。
 */
export function assertBridgeEntry(entry) {
  if (existsSync(entry)) return;
  const failure = Object.assign(
    new Error(`CLI entry not found: ${entry} — build the CLI packages first`),
    { name: "MissingCliBuildError", entry },
  );
  throw failure;
}
