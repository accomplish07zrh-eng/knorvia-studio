// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-01 合同入口解析：默认源码入口，KNORVIA_ADAPTERS_ENTRY=dist 时切到构建产物。
//
// 用法（仓库根目录）：
//   node --import tsx --test specs/contracts/apps-cli-packages-01/tests/*.test.ts
//   KNORVIA_ADAPTERS_ENTRY=dist node --import tsx --test specs/contracts/apps-cli-packages-01/tests/*.test.ts
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
export const entryLabel = process.env.KNORVIA_ADAPTERS_ENTRY?.trim() === "dist" ? "dist" : "source";
export const adaptersRoot = resolve(
  repoRoot,
  `apps/cli/packages/adapters/${entryLabel === "dist" ? "dist" : "src"}`,
);

const extension = entryLabel === "dist" ? ".js" : ".ts";

/** 载入本包的一个模块路径（相对 adapters 的 src/dist 根，如 "config/schema"）。 */
export async function load(modulePath) {
  return await import(pathToFileURL(resolve(adaptersRoot, `${modulePath}${extension}`)).href);
}

/**
 * 载入 `@knorvia/contracts` 的同一份构建产物。
 *
 * 测试文件在 specs/ 下，不在任何声明 `@knorvia/contracts` 依赖的 workspace 包里，Node 的包解析
 * 走不到它；而本包源码/产物自己 import 的就是 `apps/cli/packages/contracts/dist/index.js`，
 * 这里直接按同一路径载入，保证类（如 `PdfDocumentPortError`）的实例身份一致。
 * 前置：先跑 `pnpm build:cli-packages`（旧门的两种入口都需要）。
 */
export async function loadContracts() {
  return await import(
    pathToFileURL(resolve(repoRoot, "apps/cli/packages/contracts/dist/index.js")).href
  );
}

/** 载入某个模块的绝对路径形式（用于断言“同名不同来源”的同一性）。 */
export async function loadAbsolute(absolutePath) {
  return await import(pathToFileURL(absolutePath).href);
}
