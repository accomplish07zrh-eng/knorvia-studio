// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { entryMode, executeCleanDistInProcess, makeTempDir, runScript } from "./entry.mjs";

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function cleanDist(cwd) {
  if (entryMode === "source") {
    await executeCleanDistInProcess(cwd);
    return { status: 0, stdout: "", stderr: "" };
  }
  return runScript("clean-dist.mjs", [], { cwd });
}

test("B1 cwd/dist 被递归删除，兄弟文件保留", async (t) => {
  const root = await makeTempDir();
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "dist", "nested"), { recursive: true });
  await writeFile(join(root, "dist", "top.txt"), "top");
  await writeFile(join(root, "dist", "nested", "deep.txt"), "deep");
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "keep.ts"), "export {};\n");

  const result = await cleanDist(root);

  assert.equal(result.status, 0);
  assert.equal(await pathExists(join(root, "dist")), false);
  assert.equal(await readFile(join(root, "src", "keep.ts"), "utf8"), "export {};\n");
});

test("B2 dist 不存在时成功且无输出", async (t) => {
  const root = await makeTempDir();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "package.json"), "{}\n");

  const result = await cleanDist(root);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
  assert.equal(await readFile(join(root, "package.json"), "utf8"), "{}\n");
});

test("B3 只处理当前工作目录，不碰父目录或脚本目录的 dist", async (t) => {
  const root = await makeTempDir();
  t.after(() => rm(root, { recursive: true, force: true }));
  const work = join(root, "work");
  await mkdir(join(root, "dist"), { recursive: true });
  await writeFile(join(root, "dist", "parent.txt"), "parent");
  await mkdir(join(work, "dist"), { recursive: true });
  await writeFile(join(work, "dist", "own.txt"), "own");

  const result = await cleanDist(work);

  assert.equal(result.status, 0);
  assert.equal(await pathExists(join(work, "dist")), false);
  assert.equal(await readFile(join(root, "dist", "parent.txt"), "utf8"), "parent");
});
