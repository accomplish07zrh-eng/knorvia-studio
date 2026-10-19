// SPDX-License-Identifier: Apache-2.0
// services-01 测试公用件：临时数据目录 + 文件读写。数据根通过公开的 setDataBaseDir 切换，
// 不依赖 HOME 环境变量（仅命令目录/插件目录的测试按需改 HOME）。
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { servicesNode } from "./entry.mjs";

/** 建一个隔离的数据根，并在测试结束后还原覆盖与清理。 */
export async function makeTempRoot(t) {
  const root = await mkdtemp(join(tmpdir(), "svc01-"));
  servicesNode.setDataBaseDir(root);
  t.after(async () => {
    servicesNode.setDataBaseDir(null);
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

/** `KNORVIA_DATA_BASE_DIR` 指向 root 时的 Knorvia 数据目录。 */
export function knorviaDataRoot(root) {
  return join(root, ".knorvia-studio");
}

export async function writeText(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

export async function readText(path) {
  return readFile(path, "utf8");
}

export async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** 在测试期间临时改写一个环境变量，结束后恢复。 */
export function withEnv(t, key, value) {
  const previous = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  });
}

export const encPrefix = "enc:v1:";
