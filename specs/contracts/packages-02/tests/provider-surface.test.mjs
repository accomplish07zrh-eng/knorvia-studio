// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { assertExists, entryLabel, modulePath, providerNode, repoRoot } from "./entry.mjs";
import {
  collectDeclaredNames,
  providerNodeInternalNames,
  providerNodeRuntimeExports,
  providerNodeTypeExports,
} from "./surface.mjs";

const providerNodeModules = Object.freeze({
  "builtin-cache-paths": [
    "resolveKnorviaBuiltinClientPlatform",
    "resolveKnorviaBuiltinCachePaths",
    "createKnorviaBuiltinEndpointKey",
    "normalizeKnorviaBuiltinEndpointOrigin",
  ],
  "builtin-download": ["downloadKnorviaBuiltinRelease"],
  "builtin-provider-config-materializer": ["materializeKnorviaBuiltinProviderConfig"],
  "builtin-provider-config-source": [
    "NodeKnorviaBuiltinProviderConfigSource",
    "createNodeKnorviaBuiltinProviderConfigSource",
  ],
  "builtin-release": [
    "KNORVIA_BUILTIN_RELEASE_SCHEMA_VERSION",
    "decodeKnorviaBuiltinRelease",
    "encodeKnorviaBuiltinRelease",
    "serializeKnorviaBuiltinRelease",
  ],
  "builtin-remote-synchronizer": ["KnorviaBuiltinRemoteSynchronizer"],
  "endpoint-scoped-builtin-source": ["EndpointScopedKnorviaBuiltinSource"],
  "model-selection-config-repository": ["NodeModelSelectionConfigRepository"],
  "personal-provider-config-repository": [
    "NodePersonalProviderConfigRepository",
    "createNodePersonalProviderConfigRepository",
  ],
  "provider-config-file-codec": [
    "UnsupportedProviderConfigVersionError",
    "decodeProviderConfigFile",
    "encodeProviderConfigFile",
  ],
  "provider-config-runtime": ["NodeProviderConfigRuntime", "createNodeProviderConfigRuntime"],
  "provider-registry-runtime": ["NodeProviderRegistryRuntime", "createNodeProviderRegistryRuntime"],
  "model-selection-facade": ["createNodeModelSelectionFacade"],
  "runtime-paths": [
    "KNORVIA_BUILTIN_PROVIDER_CONFIG_FILE_ENV",
    "KNORVIA_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE_ENV",
    "KNORVIA_PERSONAL_PROVIDER_CONFIG_FILE_ENV",
    "PERSONAL_PROVIDER_CONFIG_FILE_NAME",
    "createNodeProviderRuntimePathEnv",
    "resolveNodeProviderRuntimePaths",
  ],
});

test("B29 provider-node 运行时导出面恰好是冻结的 31 个值", () => {
  assert.deepEqual(Object.keys(providerNode).sort(), [...providerNodeRuntimeExports].sort());
  for (const name of providerNodeInternalNames) {
    assert.equal(name in providerNode, false, `${name} 不应从一级入口导出`);
  }
});

test("B29 provider-node 入口声明包含 31 个值名与 18 个类型名，且无内部名", () => {
  const entryFile =
    entryLabel === "dist"
      ? join(repoRoot, "packages/provider-node/dist/index.d.ts")
      : join(repoRoot, "packages/provider-node/src/index.ts");
  const declared = collectDeclaredNames(entryFile);
  const expected = new Set([...providerNodeRuntimeExports, ...providerNodeTypeExports]);
  assert.deepEqual(
    [...declared].sort(),
    [...expected].sort(),
    "声明导出的唯一名集合必须与冻结清单一致",
  );
  assert.equal(declared.size, 49);
  for (const name of providerNodeInternalNames) {
    assert.equal(declared.has(name), false, `${name} 不应出现在入口声明中`);
  }
});

test("B29 provider-node 的 14 个 export * 模块路径均可独立加载并保留所属运行时值", async () => {
  for (const [moduleName, expectedNames] of Object.entries(providerNodeModules)) {
    const path = modulePath("provider-node", moduleName);
    assertExists(path, `provider-node 模块 ${moduleName}`);
    const loaded = await import(pathToFileURL(path).href);
    for (const name of expectedNames) {
      assert.equal(
        typeof loaded[name],
        typeof providerNode[name],
        `${moduleName} 必须导出 ${name}`,
      );
    }
  }
  const moduleRuntimeNames = Object.values(providerNodeModules).flat();
  assert.deepEqual([...moduleRuntimeNames].sort(), [...providerNodeRuntimeExports].sort());
});
