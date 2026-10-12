// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 合同契约测试的发现与收集：specs/contracts/<包 ID>/tests 里的测试要随 pnpm test:studio 一起跑。
//
// 规则与既有离线测试目录一致：只看目录顶层的 *.test.ts / *.test.mjs；
// 没有合同时返回空集合（test:studio 照常空跑通过），合同目录暂时没有测试时跳过而不是报错。
import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const TEST_FILE_PATTERN = /\.test\.(?:ts|mjs)$/u;

/** 合同测试目录：specs/contracts/<包 ID>/tests，且顶层至少有一个测试文件。 */
export async function discoverContractTestDirectories(repoRoot) {
  const contractsRoot = resolve(repoRoot, "specs/contracts");
  if (!existsSync(contractsRoot)) return [];
  const entries = await readdir(contractsRoot, { withFileTypes: true });
  const directories = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    if (!entry.isDirectory()) continue;
    const directory = `specs/contracts/${entry.name}/tests`;
    const absolute = resolve(repoRoot, directory);
    if (!existsSync(absolute)) continue;
    const names = await readdir(absolute);
    if (names.some((name) => TEST_FILE_PATTERN.test(name))) directories.push(directory);
  }
  return directories;
}

/**
 * 汇总显式列出的测试与各目录顶层测试。
 * 非合同目录为空视为配置错误（保持原有行为）；合同目录为空则跳过。
 */
export async function collectStudioTests({
  repoRoot,
  explicitTests,
  testDirectories,
  contractDirectories,
}) {
  const tests = [...explicitTests];
  const directories = [...testDirectories, ...contractDirectories];
  for (const directory of directories) {
    const names = (await readdir(resolve(repoRoot, directory)))
      .filter((name) => TEST_FILE_PATTERN.test(name))
      .sort();
    if (names.length === 0) {
      if (contractDirectories.includes(directory)) continue;
      throw new Error(`No offline studio tests found in ${directory}`);
    }
    tests.push(...names.map((name) => `${directory}/${name}`));
  }
  return { tests, directories };
}
