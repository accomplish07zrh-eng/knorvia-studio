// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { providerNode, providerPublic as provider } from "./entry.mjs";

const {
  NodeProviderConfigRuntime,
  NodeProviderRegistryRuntime,
  createNodeProviderConfigRuntime,
  createNodeProviderRegistryRuntime,
  decodeProviderConfigFile,
  encodeKnorviaBuiltinRelease,
} = providerNode;
const { ModelConfigRules, ProviderConfigMap, ProviderTemplateMap } = provider;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, label = "condition", timeout = 3000) {
  const deadline = Date.now() + timeout;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await delay(10);
  }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function emptyUpdate() {
  return Object.freeze({
    providers: ProviderConfigMap.empty(),
    models: ModelConfigRules.empty(),
    providerOrder: [],
  });
}

function builtinRelease(revision) {
  return Object.freeze({
    schemaVersion: 1,
    revision,
    config: Object.freeze({
      providers: ProviderConfigMap.empty(),
      providerTemplates: ProviderTemplateMap.empty(),
      modelConfigRules: ModelConfigRules.empty(),
    }),
  });
}

async function writeBuiltinRelease(filePath, revision) {
  await writeFile(
    filePath,
    JSON.stringify(encodeKnorviaBuiltinRelease(builtinRelease(revision)), null, 2),
  );
}

async function withTempDir(run) {
  const directory = await mkdtemp(join(tmpdir(), "pk02-runtime-"));
  try {
    return await run(directory);
  } finally {
    // 端点 source 的后台 lease/监听收尾可能晚于 dispose；清理允许短暂重试。
    for (let attempt = 0; ; attempt++) {
      try {
        await rm(directory, { recursive: true, force: true });
        break;
      } catch (error) {
        if (attempt >= 4) throw error;
        await delay(50);
      }
    }
  }
}

function options(directory, overrides = {}) {
  return {
    knorviaBuiltinFilePath: join(directory, "builtin.json"),
    personalFilePath: join(directory, "personal.json"),
    personalPollingIntervalMs: false,
    watch: false,
    ...overrides,
  };
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function matchingAccountSource(configService, revision) {
  return {
    async read() {
      const config = await configService.read();
      return Object.freeze({
        revision,
        basedOnKnorviaBuiltinRevision: config.knorviaBuiltinRevision,
        providers: ProviderConfigMap.empty(),
      });
    },
    onDidChange() {
      return () => {};
    },
  };
}

test("B27 start 复用同一 promise，Node source 无远端时 refresh 为 skipped，dispose 幂等", async () => {
  await withTempDir(async (directory) => {
    await writeBuiltinRelease(join(directory, "builtin.json"), 1);
    const runtime = createNodeProviderConfigRuntime(options(directory));
    assert.ok(runtime instanceof NodeProviderConfigRuntime);
    const first = runtime.start();
    assert.equal(first, runtime.start());
    await first;

    const snapshot = await runtime.configService.read();
    assert.ok(snapshot.knorviaBuiltinRevision.startsWith("builtin:1:"));
    assert.deepEqual(snapshot.knorviaBuiltinProviders.keys(), []);
    assert.deepEqual(snapshot.personalProviders.keys(), []);
    assert.equal(
      await runtime.resolveKnorviaBuiltinActiveFilePath(),
      join(directory, "builtin.json"),
    );
    assert.equal(await runtime.refreshKnorviaBuiltin(), "skipped");

    runtime.dispose();
    runtime.dispose();
    assert.equal(await runtime.refreshKnorviaBuiltin(), "disposed");
    assert.throws(() => runtime.start(), /NodeProviderConfigRuntime 已 dispose/);
  });
});

test("B27 start 失败清空缓存，修复 Built-in 文件后可重试", async () => {
  await withTempDir(async (directory) => {
    const runtime = createNodeProviderConfigRuntime(options(directory));
    await assert.rejects(runtime.start(), (error) => error instanceof AggregateError);
    await writeBuiltinRelease(join(directory, "builtin.json"), 3);
    await runtime.start();
    const snapshot = await runtime.configService.read();
    assert.ok(snapshot.knorviaBuiltinRevision.startsWith("builtin:3:"));
    runtime.dispose();
  });
});

test("B27 显式 Active 路径与 importLegacy 先读取 Built-in 快照", async () => {
  await withTempDir(async (directory) => {
    const bundled = join(directory, "bundled.json");
    const active = join(directory, "active.json");
    const personal = join(directory, "personal.json");
    await writeBuiltinRelease(bundled, 2);
    const imported = [];
    const runtime = createNodeProviderConfigRuntime(
      options(directory, {
        knorviaBuiltinFilePath: bundled,
        personalFilePath: personal,
        knorviaBuiltinActiveFilePath: active,
        importLegacy: async (snapshot) => {
          imported.push(snapshot.revision);
          return emptyUpdate();
        },
      }),
    );

    assert.equal(await runtime.resolveKnorviaBuiltinActiveFilePath(), active);
    await runtime.start();
    assert.equal(imported.length, 1);
    assert.ok(imported[0].startsWith("builtin:2:"));

    const written = decodeProviderConfigFile(JSON.parse(await readFile(personal, "utf8")));
    assert.deepEqual(written.providerOrder, []);
    await runtime.configService.read();
    assert.equal(imported.length, 1);
    runtime.dispose();
  });
});

test("B27 Node source 的远端同步器在启动检查中应用 Release", async () => {
  await withTempDir(async (directory) => {
    await writeBuiltinRelease(join(directory, "builtin.json"), 1);
    let fetched = 0;
    const runtime = createNodeProviderConfigRuntime(
      options(directory, {
        knorviaBuiltinRemote: {
          controlFilePath: join(directory, "control.json"),
          resolveEndpointKey: () => "https://endpoint.example.com",
          fetchRelease: async () => {
            fetched++;
            return builtinRelease(5);
          },
        },
      }),
    );

    await runtime.start();
    await waitFor(
      async () =>
        (await runtime.configService.read()).knorviaBuiltinRevision.startsWith("builtin:5:"),
      "远端 Release 落盘",
    );
    assert.ok(fetched >= 1);
    assert.equal(await runtime.refreshKnorviaBuiltin({ force: true }), "unchanged");
    runtime.dispose();
    await delay(50);
  });
});

test("B27 远端刷新失败通过 onKnorviaBuiltinRefreshError 上报", async () => {
  await withTempDir(async (directory) => {
    await writeBuiltinRelease(join(directory, "builtin.json"), 1);
    const failure = new Error("remote refresh failed");
    const errors = [];
    const runtime = createNodeProviderConfigRuntime(
      options(directory, {
        onKnorviaBuiltinRefreshError: (error) => errors.push(error),
        knorviaBuiltinRemote: {
          controlFilePath: join(directory, "control.json"),
          resolveEndpointKey: () => "https://endpoint.example.com",
          fetchRelease: async () => {
            throw failure;
          },
        },
      }),
    );

    await runtime.start();
    await waitFor(() => errors.length === 1, "刷新错误回调");
    assert.equal(errors[0], failure);
    runtime.dispose();
  });
});

test("B27 60s 定时检查、取消监听与 dispose 停止", async (t) => {
  await withTempDir(async (directory) => {
    t.mock.timers.enable({ apis: ["setInterval"] });
    await writeBuiltinRelease(join(directory, "builtin.json"), 1);
    const calls = [];
    const runtime = createNodeProviderConfigRuntime(options(directory));
    const unsubscribe = runtime.onDidCheckKnorviaBuiltin(async () => {
      calls.push("check");
    });

    await runtime.start();
    await waitFor(() => calls.length === 1, "首次检查");
    await delay(20);
    t.mock.timers.tick(60_000);
    await waitFor(() => calls.length === 2, "定时检查");
    assert.equal(unsubscribe(), true);

    t.mock.timers.tick(60_000);
    await delay(20);
    assert.equal(calls.length, 2);
    runtime.dispose();
    t.mock.timers.tick(60_000);
    await delay(20);
    assert.equal(calls.length, 2);
  });
});

test("B27 检查监听器失败交给错误回调，dispose 后不再回调", async () => {
  await withTempDir(async (directory) => {
    await writeBuiltinRelease(join(directory, "builtin.json"), 1);
    const failure = new Error("listener failed");
    const errors = [];
    const runtime = createNodeProviderConfigRuntime(
      options(directory, { onKnorviaBuiltinRefreshError: (error) => errors.push(error) }),
    );
    runtime.onDidCheckKnorviaBuiltin(async () => {
      throw failure;
    });
    await runtime.start();
    await waitFor(() => errors.length === 1, "监听器错误回调");
    assert.equal(errors[0], failure);
    runtime.dispose();

    const late = [];
    const gate = deferred();
    let invoked = false;
    const lateRuntime = createNodeProviderConfigRuntime(
      options(directory, { onKnorviaBuiltinRefreshError: (error) => late.push(error) }),
    );
    lateRuntime.onDidCheckKnorviaBuiltin(() => {
      invoked = true;
      return gate.promise;
    });
    await lateRuntime.start();
    await waitFor(() => invoked, "慢检查开始");
    lateRuntime.dispose();
    gate.reject(new Error("late failure"));
    await delay(20);
    assert.deepEqual(late, []);
  });
});

test("B27 端点环境改用 EndpointScoped source 的 refresh 与 Active 路径", async () => {
  await withTempDir(async (directory) => {
    const bundled = join(directory, "bundled.json");
    await writeBuiltinRelease(bundled, 4);
    let checks = 0;
    const runtime = createNodeProviderConfigRuntime({
      knorviaBuiltinFilePath: bundled,
      personalFilePath: join(directory, "personal.json"),
      personalPollingIntervalMs: false,
      watch: false,
      knorviaBuiltinEnvironment: {
        environmentConfigRoot: directory,
        platform: "linux",
        appVersion: "9.9.9",
        resolveEndpointOrigin: () => "https://api.example.com/",
        fetchRelease: async () => null,
        watch: false,
      },
    });
    runtime.onDidCheckKnorviaBuiltin(async () => {
      checks++;
    });

    await runtime.start();
    await waitFor(() => checks === 1, "端点环境首次检查");
    const active = await runtime.resolveKnorviaBuiltinActiveFilePath();
    assert.ok(active.startsWith(directory));
    assert.notEqual(active, bundled);
    assert.equal(await exists(active), true);
    assert.equal(await runtime.refreshKnorviaBuiltin({ force: true }), "missing");
    runtime.dispose();
    await delay(50);
  });
});

test("B28 默认 Mutable account source 在 start 前完成 fail-closed 替换并透传生命周期", async () => {
  await withTempDir(async (directory) => {
    await writeBuiltinRelease(join(directory, "builtin.json"), 1);
    const runtime = createNodeProviderRegistryRuntime(options(directory));
    assert.ok(runtime instanceof NodeProviderRegistryRuntime);
    assert.equal(runtime.registryService.getSnapshot(), null);
    const checks = [];
    const unsubscribe = runtime.onDidCheckKnorviaBuiltin(async () => {
      checks.push("check");
    });

    await runtime.start();
    const snapshot = runtime.registryService.getSnapshot();
    assert.ok(snapshot);
    assert.equal(
      snapshot.account.basedOnKnorviaBuiltinRevision,
      snapshot.config.knorviaBuiltinRevision,
    );
    assert.ok(snapshot.account.revision.startsWith("account:"));
    assert.deepEqual(snapshot.registry.providers, []);
    await waitFor(() => checks.length === 1, "Registry runtime 检查透传");
    assert.equal(unsubscribe(), true);
    const personal = await runtime.personalRepository.read();
    assert.equal(typeof personal.revision, "string");

    runtime.dispose();
    runtime.dispose();
    await assert.rejects(runtime.start(), /NodeProviderRegistryRuntime 已 dispose/);
  });
});

test("B28 createAccountSource 优先于 accountSource，且在 config start 之后读取", async () => {
  await withTempDir(async (directory) => {
    await writeBuiltinRelease(join(directory, "builtin.json"), 1);
    const events = [];
    const gate = deferred();
    let received;
    let runtime;
    const fallback = {
      async read() {
        events.push("fallback:read");
        return matchingAccountSource(runtime.configService, "fallback:1").read();
      },
      onDidChange() {
        return () => {};
      },
    };
    runtime = createNodeProviderRegistryRuntime(
      options(directory, {
        accountSource: fallback,
        createAccountSource: (configService) => {
          received = configService;
          events.push("create");
          return {
            async read() {
              events.push("created:read");
              const config = await configService.read();
              return Object.freeze({
                revision: "created:1",
                basedOnKnorviaBuiltinRevision: config.knorviaBuiltinRevision,
                providers: ProviderConfigMap.empty(),
              });
            },
            onDidChange() {
              return () => {};
            },
          };
        },
        importLegacy: async () => {
          events.push("legacy:start");
          await gate.promise;
          events.push("legacy:end");
          return emptyUpdate();
        },
      }),
    );

    const starting = runtime.start();
    await waitFor(() => events.includes("legacy:start"), "config 读取进入 importLegacy");
    assert.ok(!events.includes("created:read"));
    gate.resolve();
    await starting;

    assert.equal(received, runtime.configService);
    assert.ok(events.indexOf("legacy:end") < events.indexOf("created:read"));
    assert.ok(!events.includes("fallback:read"));
    assert.equal(runtime.registryService.getSnapshot().account.revision, "created:1");
    runtime.dispose();
  });
});

test("B28 accountSource 回退可用且自定义 source 不被 fail-closed 替换", async () => {
  await withTempDir(async (directory) => {
    await writeBuiltinRelease(join(directory, "builtin.json"), 1);
    let runtime;
    let reads = 0;
    const custom = {
      async read() {
        reads++;
        const config = await runtime.configService.read();
        return Object.freeze({
          revision: "custom-account:1",
          basedOnKnorviaBuiltinRevision: config.knorviaBuiltinRevision,
          providers: ProviderConfigMap.empty(),
        });
      },
      onDidChange() {
        return () => {};
      },
    };
    runtime = createNodeProviderRegistryRuntime(options(directory, { accountSource: custom }));
    await runtime.start();
    const snapshot = runtime.registryService.getSnapshot();
    assert.equal(snapshot.account.revision, "custom-account:1");
    assert.equal(
      snapshot.account.basedOnKnorviaBuiltinRevision,
      snapshot.config.knorviaBuiltinRevision,
    );
    assert.ok(reads >= 1);
    runtime.dispose();
  });
});

test("B28 config start 失败原样透传，修复后可重试", async () => {
  await withTempDir(async (directory) => {
    const runtime = createNodeProviderRegistryRuntime(options(directory));
    await assert.rejects(runtime.start(), (error) => error instanceof AggregateError);
    assert.equal(runtime.registryService.getSnapshot(), null);
    await writeBuiltinRelease(join(directory, "builtin.json"), 6);
    await runtime.start();
    const snapshot = runtime.registryService.getSnapshot();
    assert.ok(snapshot);
    assert.ok(snapshot.config.knorviaBuiltinRevision.startsWith("builtin:6:"));
    runtime.dispose();
  });
});
