// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-01 合同入口解析：默认源码入口，KNORVIA_DW01_ENTRY=dist 切到构建产物。
// 用法：node --import tsx --test specs/contracts/dynamic-workflow-01/tests/*.test.mjs
//       KNORVIA_DW01_ENTRY=dist node --import tsx --test specs/contracts/dynamic-workflow-01/tests/*.test.mjs
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

const mode = (process.env.KNORVIA_DW01_ENTRY ?? "source").trim();
const pkgRoot = resolve(repoRoot, "apps/cli/packages/dynamic-workflow");

/** `@knorvia/dynamic-workflow` 根入口（源码或 dist）。 */
export const dw = await import(
  pathToFileURL(resolve(pkgRoot, mode === "dist" ? "dist/index.js" : "src/index.ts")).href
);

/** `@knorvia/dynamic-workflow/projections` 入口（源码或 dist）。 */
export const projections = await import(
  pathToFileURL(resolve(pkgRoot, mode === "dist" ? "dist/projections.js" : "src/projections.ts"))
    .href
);

export const entryLabel = mode;

export const { samples: corpusSamples } = await import(
  new URL("../fixtures/corpus.mjs", import.meta.url)
);
