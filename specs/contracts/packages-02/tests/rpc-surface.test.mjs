// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { entryLabel, examplePath, modulePath, repoRoot, rpc, assertExists } from "./entry.mjs";
import {
  collectDeclaredNames,
  rpcInternalNames,
  rpcRuntimeExports,
  rpcTypeExports,
} from "./surface.mjs";

const rpcModules = [
  "buffer",
  "channelClient",
  "channelServer",
  "channels.shared",
  "channels",
  "delayedChannel",
  "foundation",
  "index",
  "ipc",
  "logging-middleware",
  "network-telemetry-middleware",
  "persistent-protocol",
  "protocol",
  "proxy-channel",
  "remote",
  "serialization",
];

test("B20 rpc 运行时导出面恰好是冻结的 39 个值", () => {
  const actual = Object.keys(rpc).sort();
  assert.deepEqual(actual, [...rpcRuntimeExports].sort());
  for (const name of rpcInternalNames) {
    assert.equal(name in rpc, false, `${name} 不应从一级入口导出`);
  }
});

test("B20 rpc 声明面包含运行时值与 32 个类型名，且无内部名", () => {
  const entryFile =
    entryLabel === "dist"
      ? join(repoRoot, "packages/rpc/dist/index.d.ts")
      : join(repoRoot, "packages/rpc/src/index.ts");
  const declared = collectDeclaredNames(entryFile);
  const expected = new Set([...rpcRuntimeExports, ...rpcTypeExports]);
  assert.deepEqual(
    [...declared].sort(),
    [...expected].sort(),
    "声明导出的唯一名集合必须与冻结清单一致",
  );
  assert.equal(declared.size, 70);
  for (const name of rpcInternalNames) {
    assert.equal(declared.has(name), false, `${name} 不应出现在入口声明中`);
  }
});

test("B20 rpc 的 16 个模块路径均可独立加载", async () => {
  for (const moduleName of rpcModules) {
    const path = modulePath("rpc", moduleName);
    assertExists(path, `rpc 模块 ${moduleName}`);
    const loaded = await import(pathToFileURL(path).href);
    assert.ok(loaded && typeof loaded === "object", `${moduleName} 加载结果必须是对象`);
  }
});

test("B20 rpc 的 4 个示例入口存在", () => {
  for (const name of [
    "01-basic-ipc",
    "02-proxy-channel",
    "03-ipc-server-client",
    "04-remote-connection",
  ]) {
    assertExists(examplePath(name), `示例 ${name}`);
  }
});
