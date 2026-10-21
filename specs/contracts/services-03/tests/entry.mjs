// SPDX-License-Identifier: Apache-2.0
// services-03 合同入口解析：默认源码入口，KNORVIA_SVC03_ENTRY=dist 切到构建产物。
// 契约测试只经公开入口与 interface.md 登记的深层模块路径取符号；入口切换集中在这里。
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
export const pkgRoot = resolve(repoRoot, "packages/services");
export const mode = (process.env.KNORVIA_SVC03_ENTRY ?? "source").trim();
export const isDist = mode === "dist";
export const entryLabel = mode;

const DOMAIN_DIR = "studio-runtime/domain/";

function fromSourcePath(relative) {
  return isDist ? relative.replace(/\.ts$/u, ".js") : relative;
}

function entryFile(relative) {
  return resolve(
    pkgRoot,
    isDist ? "dist" : "src",
    isDist ? relative : relative.replace(/\.js$/u, ".ts"),
  );
}

/** 按 scope 记录的模块路径动态导入（`row.modulePath` 形如 `domain/kernelPolicy`）。 */
export async function importModule(row) {
  const name = row.modulePath.replace(/^domain\//u, "");
  return import(pathToFileURL(entryFile(fromSourcePath(`${DOMAIN_DIR}${name}.ts`))).href);
}

/** 模块在编译产物中的文件路径（surface 测试核对存在性）。 */
export function moduleFilePath(row) {
  const name = row.modulePath.replace(/^domain\//u, "");
  return entryFile(fromSourcePath(`${DOMAIN_DIR}${name}.ts`));
}
