// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-legacy 合同入口：本包的桥接模块按源码入口加载。
//
// 为什么需要它：合同测试放在 specs/ 下，不在任何声明 @knorvia/bootstrap 依赖的 workspace 包里，
// Node 的包解析走不到它；这里按仓库内路径直接加载源码（与 `apps-cli-packages-01` 的先例一致）。
// 与黑盒用例的区别：B1–B17 走 spawn `app-server --stdio` 的公开协议面；B18 要验证「通道对象的
// 形状与生命周期」，必须在进程内直接建桥，故走本入口。
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

const legacyRoot = resolve(repoRoot, "apps/cli/packages/bootstrap/src/kernel-bridge/legacy");

/** 加载 legacy 包内的一个模块（相对 `legacy/` 的路径，如 `"index"`）。 */
export async function loadLegacy(modulePath) {
  return await import(pathToFileURL(resolve(legacyRoot, `${modulePath}.ts`)).href);
}
