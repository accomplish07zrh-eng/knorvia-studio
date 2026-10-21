// SPDX-License-Identifier: Apache-2.0
// services-02 合同入口解析：默认源码入口，KNORVIA_SVC02_ENTRY=dist 切到构建产物。
// 契约测试只经公开入口与 interface.md 登记的深层模块路径取符号；入口切换集中在这里。
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
export const pkgRoot = resolve(repoRoot, "packages/services");
export const mode = (process.env.KNORVIA_SVC02_ENTRY ?? "source").trim();
export const isDist = mode === "dist";
export const entryLabel = mode;

const SR_DIR = "studio-runtime/";

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

/**
 * 按 scope 记录的模块路径动态导入。
 *
 * `row` 来自 scope-files.json；端口在基线时位于 `studio-runtime/app/` 下，
 * 因此这里按 `role` 决定子目录，与合同基线形态一致。
 */
export async function importModule(row) {
  const subdir = row.role === "port" ? "app/" : "";
  const relative = fromSourcePath(`${SR_DIR}${subdir}${row.modulePath}.ts`);
  return import(pathToFileURL(entryFile(relative)).href);
}

/** 模块在编译产物中的文件路径（surface 测试核对存在性）。 */
export function moduleFilePath(row) {
  const subdir = row.role === "port" ? "app/" : "";
  return entryFile(fromSourcePath(`${SR_DIR}${subdir}${row.modulePath}.ts`));
}
