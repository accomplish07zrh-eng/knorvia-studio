// SPDX-License-Identifier: Apache-2.0
// 用 stubs/apps/cli/packages/adapters/src/** 覆盖本包 55 个继承文件，并支持从 git 恢复。
//
// 用法（仓库根目录）：
//   node specs/contracts/apps-cli-packages-01/stubs/apply.mjs --apply
//   node specs/contracts/apps-cli-packages-01/stubs/apply.mjs --restore
import { execFileSync } from "node:child_process";
import { copyFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const stubRoot = join(here, "apps/cli/packages/adapters/src");
const sourceRoot = join(repoRoot, "apps/cli/packages/adapters/src");

const mode = process.argv.includes("--apply")
  ? "apply"
  : process.argv.includes("--restore")
    ? "restore"
    : null;
if (!mode) throw new Error("usage: apply.mjs --apply | --restore");

async function stubFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await stubFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const files = (await stubFiles(stubRoot)).sort();
const relativePaths = files.map((file) => relative(stubRoot, file).split("\\").join("/"));
if (relativePaths.length !== 55)
  throw new Error(`expected 55 stub files, found ${relativePaths.length}`);

if (mode === "apply") {
  for (const relativePath of relativePaths) {
    await copyFile(join(stubRoot, relativePath), join(sourceRoot, relativePath));
  }
  console.log(`applied ${relativePaths.length} stubs to ${sourceRoot}`);
} else {
  execFileSync(
    "git",
    [
      "-C",
      repoRoot,
      "checkout",
      "--",
      ...relativePaths.map((path) => `apps/cli/packages/adapters/src/${path}`),
    ],
    { stdio: "inherit" },
  );
  console.log(`restored ${relativePaths.length} files from git`);
}
