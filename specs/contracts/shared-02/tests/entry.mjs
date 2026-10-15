// SPDX-License-Identifier: Apache-2.0
// shared-02 合同入口解析：默认源码入口，KNORVIA_SHARED_02_ENTRY=dist 切到构建产物入口。
// 用法：node --import tsx --test specs/contracts/shared-02/tests/*.test.mjs
//       KNORVIA_SHARED_02_ENTRY=dist node --import tsx --test specs/contracts/shared-02/tests/*.test.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

export const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));

const mode = (process.env.KNORVIA_SHARED_02_ENTRY ?? "source").trim();
const sharedRoot = resolve(repoRoot, "packages/shared");

const entryFile = (relSource, relDist) =>
  mode === "dist" ? resolve(sharedRoot, relDist) : resolve(sharedRoot, relSource);

/** `@knorvia/shared` 根 barrel（源码或 dist）。 */
export const barrel = await import(pathToFileURL(entryFile("src/index.ts", "dist/index.js")).href);

/** `@knorvia/shared/runtime-env`。 */
export const runtimeEnvEntry = await import(
  pathToFileURL(entryFile("src/runtimeEnv.ts", "dist/runtimeEnv.js")).href
);

/** `@knorvia/shared/model-selection`。 */
export const modelSelectionEntry = await import(
  pathToFileURL(entryFile("src/model-selection.ts", "dist/model-selection.js")).href
);

/** `@knorvia/shared/account-provider-state`。 */
export const accountProviderStateEntry = await import(
  pathToFileURL(entryFile("src/account-provider-state.ts", "dist/account-provider-state.js")).href
);

/** `@knorvia/shared/config-schema`。 */
export const configSchemaEntry = await import(
  pathToFileURL(entryFile("src/config-schema.ts", "dist/config-schema.js")).href
);

/**
 * 按模块相对路径加载单个模块（源码或 dist 两侧）。
 * 只用于「模块路径兼容面」（B51）与纯内部导出（integratedTerminalShellSelectionSchema）的断言；
 * 其余行为断言一律走上面的公开入口。
 */
export async function loadModule(relativePath) {
  const rel = relativePath.replace(/\.ts$/u, "");
  return import(pathToFileURL(entryFile(`src/${rel}.ts`, `dist/${rel}.js`)).href);
}

export const entryLabel = mode;
