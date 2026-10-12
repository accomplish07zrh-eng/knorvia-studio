// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// contracts-02 替换阶段的旧门入口：契约测试已移入包内 test/（随 `pnpm test:studio` 一起跑，
// 目录被 scripts/test-studio.mjs 扫描），合同桩随之退役。这里保留一个不依赖桩的入口，
// 让 lead/verify-replace.mjs 能自动跑两种入口。
//
// 用法：
//   node specs/contracts/contracts-02/tests/run-old-gate.mjs            # source 入口
//   node specs/contracts/contracts-02/tests/run-old-gate.mjs --entry dist  # dist 入口（需先构建本包）
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const entryIndex = argv.indexOf("--entry");
const entry = entryIndex >= 0 ? argv[entryIndex + 1] : "source";
if (entry !== "source" && entry !== "dist") {
  console.error(`run-old-gate：未知入口 ${entry}（只支持 source / dist）`);
  process.exit(2);
}

// 本文件在 specs/contracts/contracts-02/tests/，向上四级是仓库根。
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const packageRoot = resolve(repoRoot, "apps/cli/packages/contracts");
const tests = [
  "apps/cli/packages/contracts/test/contracts-02-api-surface.test.mjs",
  "apps/cli/packages/contracts/test/contracts-02-behavior.test.mjs",
];

if (entry === "dist" && !existsSync(resolve(packageRoot, "dist", "index.js"))) {
  console.error(
    "run-old-gate：dist 入口还不存在，先跑 pnpm --dir apps/cli/packages/contracts build",
  );
  process.exit(2);
}

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...tests], {
  cwd: repoRoot,
  env: { ...process.env, KNORVIA_CONTRACTS_ENTRY: entry === "dist" ? "dist" : "" },
  encoding: "utf8",
});
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
process.exit(result.status ?? 1);
