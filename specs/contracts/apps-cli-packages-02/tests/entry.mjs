// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-02 合同入口解析：默认源码入口，KNORVIA_ACP02_ENTRY=dist 时切到构建产物。
//
// 用法（仓库根目录，dist 模式先跑 pnpm build:cli-packages）：
//   node --import tsx --test specs/contracts/apps-cli-packages-02/tests/*.test.mjs
//   KNORVIA_ACP02_ENTRY=dist node --import tsx --test specs/contracts/apps-cli-packages-02/tests/*.test.mjs
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
export const entryLabel = process.env.KNORVIA_ACP02_ENTRY?.trim() === "dist" ? "dist" : "source";

const packageRoots = {
  "dynamic-workflow-runtime": "apps/cli/packages/dynamic-workflow-runtime",
  i18n: "apps/cli/packages/i18n",
  telemetry: "apps/cli/packages/telemetry",
  "shared-types": "apps/cli/packages/shared-types",
  "node-repl-host": "apps/cli/packages/node-repl-host",
};

/**
 * node-repl-host 的 exports 直接指向 src/*.ts，构建只产出 dist/mcp/server.js；
 * 没有逐模块 dist 镜像，因此两种模式都加载同一份源码（known-differences.md §四）。
 */
const sourceOnlyPackages = new Set(["node-repl-host"]);

export function packageDir(pkg) {
  const root = packageRoots[pkg];
  if (!root) throw new Error(`unknown contract package: ${pkg}`);
  return resolve(repoRoot, root);
}

export function packageJson(pkg) {
  return JSON.parse(readFileSync(resolve(packageDir(pkg), "package.json"), "utf8"));
}

/** 载入本包的一个模块（包内相对路径，如 "index"、"locales/en-US"）。 */
export async function load(pkg, modulePath = "index") {
  const root = packageDir(pkg);
  const dist = entryLabel === "dist" && !sourceOnlyPackages.has(pkg);
  const file = resolve(root, dist ? "dist" : "src", `${modulePath}${dist ? ".js" : ".ts"}`);
  return await import(pathToFileURL(file).href);
}

/** 读取入口声明文件文本（类型面只存在于编译期，B2 用它做结构断言）。 */
export function declarationText(pkg) {
  const root = packageDir(pkg);
  return entryLabel === "dist"
    ? readFileSync(resolve(root, "dist/index.d.ts"), "utf8")
    : readFileSync(resolve(root, "src/index.ts"), "utf8");
}

/** dynamic-workflow 的冻结公开面：按 dist 包入口加载，测试不 import 其内部模块。 */
export async function loadDynamicWorkflow() {
  return await import(
    pathToFileURL(resolve(repoRoot, "apps/cli/packages/dynamic-workflow/dist/index.js")).href
  );
}

export const testsDir = fileURLToPath(new URL(".", import.meta.url));

/** 等待子进程/微任务推动的引擎状态；只在测试里用于避免固定长睡眠。 */
export async function waitFor(predicate, { timeoutMs = 10_000, intervalMs = 10 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, intervalMs));
  }
  throw new Error("waitFor timed out");
}
