// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 合同测试入口解析：默认只用构建产物（CI 先跑 pnpm build:cli-packages）。
// KNORVIA_BRIDGE_ENTRY 只由 run-gate.mjs 的桩门使用，指向只复述 transport 签名的桩。
import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

const defaultEntry = resolve(repoRoot, "apps/cli/packages/cli/dist/knorvia.cjs");

export function resolveBridgeEntry() {
  const override = process.env.KNORVIA_BRIDGE_ENTRY?.trim();
  if (!override) return defaultEntry;
  return isAbsolute(override) ? override : resolve(repoRoot, override);
}

export function assertBridgeEntry(entry) {
  if (existsSync(entry)) return;
  throw new Error(
    `CLI entry not found: ${entry}. Run "pnpm build:cli-packages" before the contract tests.`,
  );
}

/** 本次运行的引擎：只由产品开关推导，测试不引入新变量。 */
export function activeEngine() {
  return process.env.KNORVIA_KERNEL_ENGINE?.trim() === "dsh" ? "dsh" : "legacy";
}
