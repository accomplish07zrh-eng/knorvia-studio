// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-credentials 合同入口：按仓库路径加载源码模块。
//
// 为什么需要它：合同测试在 specs/ 下，不在声明 @knorvia/bootstrap 依赖的 workspace 包里，
// Node 的包解析走不到；这与 kernel-bridge-legacy 的 legacy-entry.mjs 是同一手法。
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

/** 本包插件模块的源码根。 */
const pluginRoot = resolve(repoRoot, "apps/cli/packages/bootstrap/src/kernel-plugin-credentials");

/** 加载本包内的一个模块（相对 `kernel-plugin-credentials/` 的路径）。 */
export async function loadCredentials(modulePath) {
  return await import(pathToFileURL(resolve(pluginRoot, `${modulePath}.ts`)).href);
}

/** 加载 kernel-bridge-legacy 的反向请求通道（本包的上游，已合并）。 */
export async function loadLegacy() {
  return await import(
    pathToFileURL(
      resolve(repoRoot, "apps/cli/packages/bootstrap/src/kernel-bridge/legacy/index.ts"),
    ).href
  );
}

/**
 * 加载共享协议 schema（`@knorvia/shared`）。
 *
 * 走**源码**入口而不是 `packages/shared/dist`：`pnpm build:cli-packages` 不构建 `packages/shared`，
 * 而且本包源码自己 import 的 `@knorvia/shared` 会经 workspace 解析到 `src/index.ts`（tsx 可加载）。
 * 若这里硬写 dist 路径，测试会在「没单独构建 shared」的检出下无故失败——那类失败最容易被
 * 误当成环境问题。
 */
export async function loadSharedProtocol() {
  return await import(
    pathToFileURL(resolve(repoRoot, "packages/shared/src/protocol/index.ts")).href
  );
}
