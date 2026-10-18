// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-02 合同入口解析：默认源码入口，KNORVIA_DW02_ENTRY=dist 切到构建产物。
// 契约测试只经这两个公开入口（`@knorvia/dynamic-workflow` 根桶与 `.../projections` 桶）做黑盒断言；
// 引擎内部（AskScheduler / 注册表函数 / boundWorldReadInput / validateArtifactSpec 等）不在公开面上，
// 一律经公开行为间接判定，见 README「范围与边界」与 interface.md 的深层模块路径。
//
// 用法（仓库根目录，Node 24）：
//   node --import tsx --test "specs/contracts/dynamic-workflow-02/tests/*.test.mjs"
//   pnpm --dir apps/cli/packages/dynamic-workflow build
//   KNORVIA_DW02_ENTRY=dist node --import tsx --test "specs/contracts/dynamic-workflow-02/tests/*.test.mjs"
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

const mode = (process.env.KNORVIA_DW02_ENTRY ?? "source").trim();
const pkgRoot = resolve(repoRoot, "apps/cli/packages/dynamic-workflow");

/** `@knorvia/dynamic-workflow` 根桶（源码或 dist）。 */
export const dw = await import(
  pathToFileURL(resolve(pkgRoot, mode === "dist" ? "dist/index.js" : "src/index.ts")).href
);

/** `@knorvia/dynamic-workflow/projections` 桶（源码或 dist）：浏览器安全子集。 */
export const projections = await import(
  pathToFileURL(resolve(pkgRoot, mode === "dist" ? "dist/projections.js" : "src/projections.ts"))
    .href
);

/** 本包范围内两个入口桶的文件路径（surface 测试按入口模式取文本做兼容面断言）。 */
export const entryBucketFiles = {
  index: resolve(pkgRoot, mode === "dist" ? "dist/index.js" : "src/index.ts"),
  projections: resolve(pkgRoot, mode === "dist" ? "dist/projections.js" : "src/projections.ts"),
};

/** 入口根目录：surface 测试据此断言 interface.md 列出的每个模块路径在这一侧都存在。 */
export const entryRootDir = resolve(pkgRoot, mode === "dist" ? "dist" : "src");

/**
 * 深层模块路径的动态导入（interface.md「兼容入口面」列出的那批包内 import 方按相对路径引用的模块）。
 * `modulePath` 用**产物**写法（`engine/scheduler.js`），源码侧换成 `.ts`——两侧同一入口，测试不必知道
 * 自己在哪种模式下。
 */
export function importDeep(modulePath) {
  const file = resolve(
    entryRootDir,
    mode === "dist" ? modulePath : modulePath.replace(/\.js$/, ".ts"),
  );
  return import(pathToFileURL(file).href);
}

export const entryLabel = mode;
export const isDist = mode === "dist";

const corpus = await import(new URL("../fixtures/corpus.mjs", import.meta.url));

/** 全部样例（静态 lowering golden 的输入）。 */
export const corpusSamples = corpus.samples;

/** 带 drive 表的样例（engine-run golden 的输入）。 */
export const runSamples = corpus.runSamples;
