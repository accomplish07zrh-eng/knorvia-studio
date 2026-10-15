// SPDX-License-Identifier: Apache-2.0
// core-runtime-methods-02 合同入口解析：默认源码入口（tsx 加载 src/runtime/methods/*.ts），
// KNORVIA_CORE_RUNTIME_METHODS_02_ENTRY=dist 切到构建产物（dist/runtime/methods/*.js）。
// 用法：node --import tsx --test specs/contracts/core-runtime-methods-02/tests/*.test.ts
//       KNORVIA_CORE_RUNTIME_METHODS_02_ENTRY=dist node --import tsx --test specs/contracts/core-runtime-methods-02/tests/*.test.ts
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

const mode = (process.env.KNORVIA_CORE_RUNTIME_METHODS_02_ENTRY ?? "source").trim();
export const entryLabel = mode === "dist" ? "dist" : "source";

const coreRoot = resolve(repoRoot, "apps/cli/packages/core");
const explicitDir = process.env.KNORVIA_CORE_RUNTIME_METHODS_01_DIR?.trim();
export const methodsDir = explicitDir
  ? resolve(explicitDir)
  : entryLabel === "dist"
    ? resolve(coreRoot, "dist/runtime/methods")
    : resolve(coreRoot, "src/runtime/methods");

/** 合同目录（读 interface.md / fixtures 用）。 */
export const contractDir = resolve(repoRoot, "specs/contracts/core-runtime-methods-02");

const modules = new Map();

/**
 * 按 methods 相对路径加载一个公开模块（源码或 dist）。
 * `relative` 不带扩展名，例如 `"model"`、`"streaming-recovery"`。
 */
export async function methods(relative) {
  const key = `${entryLabel}:${relative}`;
  const cached = modules.get(key);
  if (cached) return cached;
  const base = resolve(methodsDir, relative);
  const candidates =
    entryLabel === "dist"
      ? [`${base}.js`]
      : [`${base}.ts`, `${base}.js`, resolve(base, "index.ts")];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      `core-runtime-methods-02 入口缺失（entry=${entryLabel}）：${relative}（尝试 ${candidates.join(", ")}）`,
    );
  }
  const namespace = await import(pathToFileURL(found).href);
  modules.set(key, namespace);
  return namespace;
}

/**
 * 加载 core 包内**非本包**的模块（测试夹具用：枚举面、类型构造器、依赖注入面）。
 * 路径相对 `apps/cli/packages/core` 的 src 或 dist 根，不带扩展名。
 */
export async function coreModule(relative) {
  const key = `${entryLabel}:core:${relative}`;
  const cached = modules.get(key);
  if (cached) return cached;
  const root = entryLabel === "dist" ? resolve(coreRoot, "dist") : resolve(coreRoot, "src");
  const base = resolve(root, relative);
  const candidates =
    entryLabel === "dist"
      ? [`${base}.js`]
      : [`${base}.ts`, `${base}.js`, resolve(base, "index.ts")];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`core 模块缺失（entry=${entryLabel}）：${relative}`);
  }
  const namespace = await import(pathToFileURL(found).href);
  modules.set(key, namespace);
  return namespace;
}

/**
 * `@knorvia/contracts` 的运行时面。规格目录不在 workspace 解析范围内，这里按 contracts 包自己的
 * `exports["."]` 解析入口，与被测代码加载的是同一个模块实例（`FileSystemPortError` 之类的
 * `instanceof` 判定依赖这一点）。
 */
export async function contractsBundle() {
  const cached = modules.get(`${entryLabel}:__contracts__`);
  if (cached) return cached;
  const manifestPath = resolve(repoRoot, "apps/cli/packages/contracts/package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const entry = resolve(dirname(manifestPath), manifest.exports["."].import);
  const namespace = await import(pathToFileURL(entry).href);
  modules.set(`${entryLabel}:__contracts__`, namespace);
  return namespace;
}

/** core 包的运行时依赖面（枚举与错误工厂），源码/ dist 与被测入口同步切换。 */
export async function coreDeps() {
  const cached = modules.get(`${entryLabel}:__deps__`);
  if (cached) return cached;
  const base = resolve(
    coreRoot,
    entryLabel === "dist" ? "dist/runtime/deps.js" : "src/runtime/deps.ts",
  );
  const namespace = await import(pathToFileURL(base).href);
  modules.set(`${entryLabel}:__deps__`, namespace);
  return namespace;
}
