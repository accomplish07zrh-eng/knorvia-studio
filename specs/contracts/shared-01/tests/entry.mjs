// SPDX-License-Identifier: Apache-2.0
// shared-01 合同入口解析：默认源码入口，KNORVIA_SHARED_01_ENTRY=dist 切到构建产物入口。
// 用法：node --import tsx --test specs/contracts/shared-01/tests/*.test.mjs
//       KNORVIA_SHARED_01_ENTRY=dist node --import tsx --test specs/contracts/shared-01/tests/*.test.mjs
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));

const mode = (process.env.KNORVIA_SHARED_01_ENTRY ?? "source").trim();
const explicit = process.env.KNORVIA_SHARED_01_NODE_ENTRY?.trim();
const explicitProtocol = process.env.KNORVIA_SHARED_01_PROTOCOL_ENTRY?.trim();

const sharedRoot = resolve(repoRoot, "packages/shared");
const nodeEntryPath = explicit
  ? resolve(explicit)
  : mode === "dist"
    ? resolve(sharedRoot, "dist/node.js")
    : resolve(sharedRoot, "src/node.ts");
const protocolEntryPath = explicitProtocol
  ? resolve(explicitProtocol)
  : mode === "dist"
    ? resolve(sharedRoot, "dist/protocol-v4/index.js")
    : resolve(sharedRoot, "src/protocol-v4/index.ts");

/** `@knorvia/shared/node` 公开入口（源码或 dist）。 */
export const sharedNode = await import(pathToFileURL(nodeEntryPath).href);

/** `@knorvia/shared/protocol-v4` 公开入口（源码或 dist）。 */
export const protocolV4 = await import(pathToFileURL(protocolEntryPath).href);

export const entryLabel = mode;
