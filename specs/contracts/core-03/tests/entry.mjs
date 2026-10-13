// SPDX-License-Identifier: Apache-2.0
// 合同入口解析：默认源码入口（包根），可用 KNORVIA_CORE_03_ENTRY 指向 dist 入口。
// 用法：node --import tsx --test specs/contracts/core-03/tests/*.test.ts
//       KNORVIA_CORE_03_ENTRY=<repo>/apps/cli/packages/core/dist/index.js ...
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

const defaultEntry = resolve(repoRoot, "apps/cli/packages/core/src/index.ts");
const configured = process.env.KNORVIA_CORE_03_ENTRY?.trim();

export const entryPath = configured
  ? configured.startsWith("file:")
    ? fileURLToPath(configured)
    : resolve(configured)
  : defaultEntry;

/** 公开入口模块（源码或 dist，由环境变量决定）。 */
export const core = await import(pathToFileURL(entryPath).href);

/** 供测试打印的入口标识。 */
export const entryLabel = entryPath.includes(`${"dist"}`) ? "dist" : "source";
