// SPDX-License-Identifier: Apache-2.0
// 合同入口解析：默认源码入口，可用 KNORVIA_CORE_HOOKS_ENTRY 指向 dist 入口。
// 用法：node --import tsx --test specs/contracts/core-hooks/tests/*.test.ts
//       KNORVIA_CORE_HOOKS_ENTRY=<repo>/apps/cli/packages/core/dist/hooks/index.js ...
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

const defaultEntry = resolve(repoRoot, "apps/cli/packages/core/src/hooks/index.ts");
const configured = process.env.KNORVIA_CORE_HOOKS_ENTRY?.trim();

export const entryPath = configured
  ? configured.startsWith("file:")
    ? fileURLToPath(configured)
    : resolve(configured)
  : defaultEntry;

/** 公开入口模块（源码或 dist，由环境变量决定）。 */
export const hooks = await import(pathToFileURL(entryPath).href);

/** 供测试打印的入口标识。 */
export const entryLabel = entryPath.includes(`${"dist"}`) ? "dist" : "source";
