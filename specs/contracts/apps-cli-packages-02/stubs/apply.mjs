// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-02 桩替换器：用 stubs/modules/ 覆盖 5 个包的继承源码（--apply），或还原（--restore）。
//
// 用法（仓库根目录）：
//   node specs/contracts/apps-cli-packages-02/stubs/apply.mjs --apply
//   node specs/contracts/apps-cli-packages-02/stubs/apply.mjs --restore
// 备份存于 stubs/.backup/files.json（--restore 后删除）。
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(here, "..");
const repoRoot = resolve(contractDir, "../../..");
const moduleRoot = join(here, "modules");
const backupFile = join(here, ".backup", "files.json");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const mode = process.argv.includes("--restore")
  ? "restore"
  : process.argv.includes("--apply")
    ? "apply"
    : undefined;
if (!mode) {
  process.stderr.write("apply.mjs: 需要 --apply 或 --restore\n");
  process.exit(2);
}

if (mode === "apply") {
  if (existsSync(backupFile)) {
    process.stderr.write("apply.mjs: 已有备份，先 --restore\n");
    process.exit(2);
  }
  const stubs = walk(moduleRoot);
  const backup = {};
  for (const stubPath of stubs) {
    const rel = relative(moduleRoot, stubPath).replace(/\\/gu, "/");
    const target = resolve(repoRoot, "apps/cli/packages", rel);
    backup[`apps/cli/packages/${rel}`] = readFileSync(target, "utf8");
    writeFileSync(target, readFileSync(stubPath, "utf8"), "utf8");
  }
  mkdirSync(dirname(backupFile), { recursive: true });
  writeFileSync(backupFile, JSON.stringify(backup), "utf8");
  process.stdout.write(`apply.mjs: ${stubs.length} 个模块已替换为桩\n`);
} else {
  if (!existsSync(backupFile)) {
    process.stderr.write("apply.mjs: 没有备份可还原\n");
    process.exit(2);
  }
  const backup = JSON.parse(readFileSync(backupFile, "utf8"));
  for (const [rel, content] of Object.entries(backup)) {
    writeFileSync(resolve(repoRoot, rel), content, "utf8");
  }
  rmSync(dirname(backupFile), { recursive: true, force: true });
  process.stdout.write(`apply.mjs: ${Object.keys(backup).length} 个模块已还原\n`);
}
