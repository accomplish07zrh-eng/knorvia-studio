// SPDX-License-Identifier: Apache-2.0
// services-01 合同入口解析：默认源码入口，KNORVIA_SVC01_ENTRY=dist 切到构建产物。
// 契约测试只经公开入口与 interface.md 登记的深层模块路径取符号；入口切换集中在这里。
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
export const pkgRoot = resolve(repoRoot, "packages/services");
export const mode = (process.env.KNORVIA_SVC01_ENTRY ?? "source").trim();
export const isDist = mode === "dist";
export const entryRootDir = resolve(pkgRoot, isDist ? "dist" : "src");
export const entryLabel = mode;

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

/** `@knorvia/services` 根桶（浏览器安全公开面）。 */
export const services = await import(pathToFileURL(entryFile("index.js")).href);

/** `@knorvia/services/node` Node 组合入口。 */
export const servicesNode = await import(pathToFileURL(entryFile("node.js")).href);

/** `@knorvia/services/cua-permission-broker` 子路径子桶。 */
export const cuaBroker = await import(
  pathToFileURL(entryFile("cua-permission-broker/index.js")).href
);

/**
 * 深层模块动态导入；`modulePath` 用范围清单的源码写法（`agent/agentErrors.ts`），
 * dist 侧换成 `.js`，源码侧原样。`.md` 文档没有导入面，调用方应跳过。
 */
export function importDeep(modulePath) {
  return import(pathToFileURL(entryFile(fromSourcePath(modulePath))).href);
}

/** 当前入口侧模块文件路径（surface 测试核对 interface.md 的模块路径存在性）。 */
export function moduleFilePath(modulePath) {
  return entryFile(fromSourcePath(modulePath));
}
