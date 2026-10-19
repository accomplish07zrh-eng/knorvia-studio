// SPDX-License-Identifier: Apache-2.0
// 合同测试统一入口：KNORVIA_PACKAGES_02_ENTRY=dist 时改走构建产物，否则走源码。
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testsDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(testsDir, "../../../..");
export const fixturesDir = join(testsDir, "..", "fixtures");
export const entryLabel = process.env.KNORVIA_PACKAGES_02_ENTRY === "dist" ? "dist" : "src";

function entryPath(packageName) {
  return join(
    repoRoot,
    "packages",
    packageName,
    entryLabel === "dist" ? "dist/index.js" : "src/index.ts",
  );
}

export const rpcEntryPath = entryPath("rpc");
export const providerNodeEntryPath = entryPath("provider-node");

export const rpc = await import(pathToFileURL(rpcEntryPath).href);
export const providerNode = await import(pathToFileURL(providerNodeEntryPath).href);
// 夹具构造只用 @knorvia/provider 的公开入口；它不在本包重写范围。
export const providerPublicPath = join(repoRoot, "packages/provider/src/index.ts");
export const providerPublic = await import(pathToFileURL(providerPublicPath).href);

export function readFixture(...segments) {
  return JSON.parse(readFileSync(join(fixturesDir, ...segments), "utf8"));
}

export function readFixtureText(...segments) {
  return readFileSync(join(fixturesDir, ...segments), "utf8");
}

export function modulePath(packageName, moduleName) {
  return join(
    repoRoot,
    "packages",
    packageName,
    entryLabel === "dist" ? `dist/${moduleName}.js` : `src/${moduleName}.ts`,
  );
}

export function examplePath(name) {
  return join(repoRoot, "packages/rpc/examples", `${name}.ts`);
}

export function assertExists(path, label) {
  if (!existsSync(path)) throw new Error(`缺少 ${label}: ${path}`);
}
