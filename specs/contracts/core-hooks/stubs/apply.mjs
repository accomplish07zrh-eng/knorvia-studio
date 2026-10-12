// SPDX-License-Identifier: Apache-2.0
// 用 stubs/hooks/<file> 覆盖 core/src/hooks/ 下 16 个继承文件，并支持从 git 恢复。
// 用途：验证「桩替换后契约测试全部失败」，以及替换实现时的起始状态。
//
// 用法：
//   node specs/contracts/core-hooks/stubs/apply.mjs --apply    # 覆盖为桩
//   node specs/contracts/core-hooks/stubs/apply.mjs --restore  # git checkout 还原
import { execFileSync } from "node:child_process";
import { copyFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const stubDir = join(here, "hooks");
const targetDir = join(repoRoot, "apps/cli/packages/core/src/hooks");

const mode = process.argv.includes("--apply")
  ? "apply"
  : process.argv.includes("--restore")
    ? "restore"
    : null;
if (!mode) throw new Error("usage: apply.mjs --apply | --restore");

const names = (await readdir(stubDir)).filter((name) => name.endsWith(".ts")).sort();
if (names.length !== 16) throw new Error(`expected 16 stub files, found ${names.length}`);

if (mode === "apply") {
  for (const name of names) await copyFile(join(stubDir, name), join(targetDir, name));
  console.log(`applied ${names.length} stubs to ${targetDir}`);
} else {
  execFileSync(
    "git",
    [
      "-C",
      repoRoot,
      "checkout",
      "--",
      ...names.map((name) => `apps/cli/packages/core/src/hooks/${name}`),
    ],
    {
      stdio: "inherit",
    },
  );
  console.log(`restored ${names.length} files from git`);
}
