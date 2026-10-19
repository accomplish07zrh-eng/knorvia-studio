// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readFixture, readFixtureText, providerNode, fixturesDir } from "./entry.mjs";

const {
  KNORVIA_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE_ENV,
  KNORVIA_BUILTIN_PROVIDER_CONFIG_FILE_ENV,
  KNORVIA_PERSONAL_PROVIDER_CONFIG_FILE_ENV,
  PERSONAL_PROVIDER_CONFIG_FILE_NAME,
  UnsupportedProviderConfigVersionError,
  createNodeProviderRuntimePathEnv,
  decodeProviderConfigFile,
  encodeProviderConfigFile,
  resolveNodeProviderRuntimePaths,
  NodePersonalProviderConfigRepository,
} = providerNode;

test("B21 环境变量名、路径 env 生成与解析", () => {
  assert.equal(KNORVIA_BUILTIN_PROVIDER_CONFIG_FILE_ENV, "KNORVIA_BUILTIN_PROVIDER_CONFIG_FILE");
  assert.equal(
    KNORVIA_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE_ENV,
    "KNORVIA_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE",
  );
  assert.equal(KNORVIA_PERSONAL_PROVIDER_CONFIG_FILE_ENV, "KNORVIA_PERSONAL_PROVIDER_CONFIG_FILE");
  assert.equal(PERSONAL_PROVIDER_CONFIG_FILE_NAME, "provider_config.json");

  const env = createNodeProviderRuntimePathEnv({
    knorviaBuiltinFilePath: "/builtin/provider_config.json",
    personalFilePath: "/personal/provider_config.json",
  });
  assert.deepEqual(env, {
    [KNORVIA_BUILTIN_PROVIDER_CONFIG_FILE_ENV]: "/builtin/provider_config.json",
    [KNORVIA_PERSONAL_PROVIDER_CONFIG_FILE_ENV]: "/personal/provider_config.json",
  });
  assert.equal(Object.keys(env).length, 2);

  assert.equal(resolveNodeProviderRuntimePaths({}), null);
  assert.equal(
    resolveNodeProviderRuntimePaths({
      [KNORVIA_BUILTIN_PROVIDER_CONFIG_FILE_ENV]: "  ",
      [KNORVIA_PERSONAL_PROVIDER_CONFIG_FILE_ENV]: "\t",
    }),
    null,
  );
  assert.throws(
    () =>
      resolveNodeProviderRuntimePaths({
        [KNORVIA_BUILTIN_PROVIDER_CONFIG_FILE_ENV]: "/only-builtin",
      }),
    { message: "Knorvia Studio Built-in 与 Personal Provider Config 路径必须同时提供" },
  );
  assert.throws(
    () =>
      resolveNodeProviderRuntimePaths({
        [KNORVIA_PERSONAL_PROVIDER_CONFIG_FILE_ENV]: "/only-personal",
      }),
    { message: "Knorvia Studio Built-in 与 Personal Provider Config 路径必须同时提供" },
  );

  const resolved = resolveNodeProviderRuntimePaths({
    [KNORVIA_BUILTIN_PROVIDER_CONFIG_FILE_ENV]: "  builtin/../provider_config.json  ",
    [KNORVIA_PERSONAL_PROVIDER_CONFIG_FILE_ENV]: " personal/provider_config.json ",
  });
  assert.deepEqual(resolved, {
    knorviaBuiltinFilePath: "builtin/../provider_config.json",
    personalFilePath: "personal/provider_config.json",
  });
  assert.equal(Object.isFrozen(resolved), true, "成功结果冻结；只 trim 不做路径规范化");
});

test("B22 decode 旧夹具得到冻结快照，encode 恢复同一规范文档", () => {
  const fixture = readFixture("provider-config", "old-write.json");
  const decoded = decodeProviderConfigFile(fixture);
  assert.equal(Object.isFrozen(decoded), true);
  assert.deepEqual(decoded.providerOrder, ["personal-openai", "personal-empty"]);
  assert.deepEqual(decoded.providers.toJSON(), fixture.config.providerConfigRules.providerRules);
  assert.deepEqual(decoded.models.toPersonalJSON(), fixture.config.modelConfigRules);
  assert.deepEqual(decoded.defaultModelSelection, fixture.config.defaultModelSelection);

  const encoded = encodeProviderConfigFile(decoded);
  assert.equal(JSON.stringify(encoded), JSON.stringify(fixture));
  assert.equal(
    JSON.stringify(encoded, null, 2),
    readFixtureText("provider-config", "old-write.json"),
    "规范文档无尾随换行，键序稳定",
  );
  const redecoded = decodeProviderConfigFile(JSON.parse(JSON.stringify(encoded)));
  assert.equal(JSON.stringify(encodeProviderConfigFile(redecoded)), JSON.stringify(encoded));
});

test("B22 providerOrder 与 defaultModelSelection 仅在定义时出现", () => {
  const decoded = decodeProviderConfigFile(readFixture("provider-config", "old-write.json"));
  const withoutOptional = Object.freeze({
    providers: decoded.providers,
    models: decoded.models,
    providerOrder: decoded.providerOrder,
  });
  const encoded = encodeProviderConfigFile(withoutOptional);
  assert.equal("defaultModelSelection" in encoded.config, false);
  assert.deepEqual(Object.keys(encoded), ["schemaVersion", "config"]);

  const noOrder = Object.freeze({
    providers: decoded.providers,
    models: decoded.models,
    providerOrder: undefined,
  });
  const encodedNoOrder = encodeProviderConfigFile(noOrder);
  assert.equal("providerOrder" in encodedNoOrder.config, false);
});

test("B22 严格文档：顶层与 config 未知键都被拒绝", () => {
  const fixture = readFixture("provider-config", "old-write.json");
  assert.throws(() => decodeProviderConfigFile({ ...fixture, extra: true }));
  assert.throws(() =>
    decodeProviderConfigFile({
      ...fixture,
      config: { ...fixture.config, extra: true },
    }),
  );
  assert.throws(() => decodeProviderConfigFile(null));
  assert.throws(() => decodeProviderConfigFile([]));
});

test("B22 版本错误逐字冻结", () => {
  const table = readFixture("provider-config", "invalid-version.json");
  for (const entry of table.cases) {
    assert.throws(
      () => decodeProviderConfigFile(entry.input),
      (error) => {
        assert.equal(error.name, entry.expected.name, entry.name);
        assert.equal(error.message, entry.expected.message, entry.name);
        assert.equal(error.version, entry.expected.version, entry.name);
        assert.equal(
          error instanceof UnsupportedProviderConfigVersionError,
          entry.expected.isUnsupportedVersion,
          entry.name,
        );
        return true;
      },
    );
  }
});

test("B22/B30 旧 manual 配置经 extractManualModelConfig 归一后编码", () => {
  const input = readFixture("provider-config", "legacy-manual-input.json");
  const expected = readFixtureText("provider-config", "legacy-manual-expected.json");
  const decoded = decodeProviderConfigFile(input);
  const encoded = encodeProviderConfigFile(decoded);
  assert.equal(JSON.stringify(encoded, null, 2) + "\n", expected);
  assert.equal(
    "requiresMfjsToolSchema" in
      encoded.config.modelConfigRules.manualProviderModelRules[0].config.properties,
    false,
  );
  const again = decodeProviderConfigFile(JSON.parse(expected));
  assert.equal(JSON.stringify(encodeProviderConfigFile(again), null, 2) + "\n", expected);
});

test("B30 仓储把旧写文件原地规范化为同一字节并计算 revision", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pk02-codec-"));
  try {
    const filePath = join(directory, "provider_config.json");
    await copyFile(join(fixturesDir, "provider-config", "old-write.json"), filePath);
    const repository = new NodePersonalProviderConfigRepository({
      filePath,
      pollingIntervalMs: false,
    });
    const snapshot = await repository.read();
    const bytes = await readFile(filePath, "utf8");
    const expectedBytes = readFixtureText("provider-config", "old-write.json");
    assert.equal(bytes, expectedBytes, "规范文件重写后字节不变");
    const expectedRevision = createHash("sha256")
      .update(JSON.stringify(JSON.parse(bytes)))
      .digest("hex");
    assert.equal(snapshot.revision, expectedRevision);
    assert.deepEqual(snapshot.providerOrder, ["personal-openai", "personal-empty"]);
    const again = await repository.read();
    assert.equal(again.revision, snapshot.revision, "再次读取 revision 稳定");
    repository.dispose();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
