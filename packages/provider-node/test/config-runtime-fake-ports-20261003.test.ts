import assert from "node:assert/strict";
import { test } from "node:test";
import { ModelConfigRules, ProviderConfigMap } from "@knorvia/provider";
import type { ProviderConfigLayerSnapshot } from "@knorvia/provider";
import type { NodeProviderConfigRuntimeOptions } from "../src/provider-config-runtime.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function flush(): Promise<void> {
  for (let turn = 0; turn < 30; turn++) await Promise.resolve();
}

test("synthetic constructor ports and fake clock preserve config runtime paths, startup/check identities and native teardown", async (t) => {
  const layer: ProviderConfigLayerSnapshot = {
    revision: "synthetic-layer",
    providers: ProviderConfigMap.empty(),
    models: ModelConfigRules.empty(),
  };
  const events: string[] = [];
  const bundled: FakeBundled[] = [];
  const endpoints: FakeEndpoint[] = [];
  const repositories: FakeRepository[] = [];
  const remotes: FakeRemote[] = [];
  const services: FakeService[] = [];
  class FakeBundled {
    readonly activeFilePath = "/synthetic/resolved-active";
    constructor(readonly options: Record<string, unknown>) {
      events.push("bundled:create");
      bundled.push(this);
    }
    async read() {
      events.push("bundled:read");
      return layer;
    }
    dispose() {
      events.push("bundled:dispose");
    }
  }
  class FakeEndpoint {
    readonly pathPromise = Promise.resolve("/synthetic/endpoint-active");
    readonly refreshPromise = Promise.resolve("updated");
    refreshOptions: unknown;
    constructor(readonly options: Record<string, unknown>) {
      events.push("endpoint:create");
      endpoints.push(this);
    }
    async read() {
      return layer;
    }
    resolveActiveFilePath() {
      return this.pathPromise;
    }
    refresh(options: unknown) {
      this.refreshOptions = options;
      return this.refreshPromise;
    }
    dispose() {
      events.push("endpoint:dispose");
    }
  }
  class FakeRepository {
    disposeError: Error | undefined;
    constructor(readonly options: Record<string, unknown>) {
      events.push("repo:create");
      repositories.push(this);
    }
    dispose() {
      events.push("repo:dispose");
      if (this.disposeError) throw this.disposeError;
    }
  }
  class FakeRemote {
    readonly refreshPromise = Promise.resolve("unchanged");
    refreshOptions: unknown;
    action: (() => Promise<string>) | undefined;
    constructor(readonly options: Record<string, unknown>) {
      events.push("remote:create");
      remotes.push(this);
    }
    refresh(options: unknown) {
      this.refreshOptions = options;
      events.push("remote:refresh");
      return this.action?.() ?? this.refreshPromise;
    }
    dispose() {
      events.push("remote:dispose");
    }
  }
  class FakeService {
    readCount = 0;
    action: (() => Promise<unknown>) | undefined;
    constructor(readonly options: Record<string, unknown>) {
      events.push("config:create");
      services.push(this);
    }
    read() {
      this.readCount++;
      events.push("config:read");
      return this.action?.() ?? Promise.resolve(layer);
    }
    dispose() {
      events.push("config:dispose");
    }
  }
  t.mock.module("@knorvia/provider", { namedExports: { ProviderConfigService: FakeService } });
  t.mock.module(new URL("../src/builtin-provider-config-source.ts", import.meta.url).href, {
    namedExports: { NodeKnorviaBuiltinProviderConfigSource: FakeBundled },
  });
  t.mock.module(new URL("../src/endpoint-scoped-builtin-source.ts", import.meta.url).href, {
    namedExports: { EndpointScopedKnorviaBuiltinSource: FakeEndpoint },
  });
  t.mock.module(new URL("../src/builtin-remote-synchronizer.ts", import.meta.url).href, {
    namedExports: { KnorviaBuiltinRemoteSynchronizer: FakeRemote },
  });
  t.mock.module(new URL("../src/personal-provider-config-repository.ts", import.meta.url).href, {
    namedExports: { NodePersonalProviderConfigRepository: FakeRepository },
  });
  const timers: { callback: () => void; delay: number; unrefs: number; cleared: boolean }[] = [];
  const setFake = ((callback: () => void, delay: number) => {
    const handle = {
      callback,
      delay,
      unrefs: 0,
      cleared: false,
      unref() {
        this.unrefs++;
      },
    };
    timers.push(handle);
    return handle;
  }) as unknown as typeof setInterval;
  t.mock.method(globalThis, "setInterval", setFake);
  t.mock.method(globalThis, "clearInterval", ((handle: (typeof timers)[number]) => {
    handle.cleared = true;
    events.push("timer:clear");
  }) as unknown as typeof clearInterval);
  const { NodeProviderConfigRuntime, createNodeProviderConfigRuntime } =
    await import("../src/provider-config-runtime.js");
  const options: NodeProviderConfigRuntimeOptions = {
    knorviaBuiltinFilePath: " synthetic-bundle ",
    knorviaBuiltinActiveFilePath: " synthetic-active ",
    personalFilePath: " synthetic-personal ",
    personalPollingIntervalMs: false,
    watch: false,
    importLegacy: async function (value) {
      assert.equal(this, options);
      assert.equal(value, layer);
      return null;
    },
  };
  const runtime = createNodeProviderConfigRuntime(options);
  const fakeSource = bundled.at(-1)!;
  const fakeRepo = repositories.at(-1)!;
  const fakeService = services.at(-1)!;
  assert.deepEqual(events, ["bundled:create", "repo:create", "config:create"]);
  assert.deepEqual(Reflect.ownKeys(runtime), ["configService"]);
  assert.deepEqual(
    Object.getOwnPropertyNames(NodeProviderConfigRuntime.prototype).sort(),
    [
      "constructor",
      "resolveKnorviaBuiltinActiveFilePath",
      "personalRepository",
      "onDidCheckKnorviaBuiltin",
      "start",
      "refreshKnorviaBuiltin",
      "dispose",
    ].sort(),
  );
  assert.equal(runtime.configService, fakeService);
  assert.equal(runtime.personalRepository, fakeRepo);
  assert.deepEqual(fakeSource.options, {
    bundledFilePath: " synthetic-bundle ",
    activeFilePath: " synthetic-active ",
    watch: false,
  });
  assert.deepEqual(Object.keys(fakeRepo.options), [
    "filePath",
    "onRecovery",
    "onPollingError",
    "pollingIntervalMs",
    "importLegacy",
  ]);
  assert.equal(fakeRepo.options.filePath, options.personalFilePath);
  assert.equal(fakeRepo.options.pollingIntervalMs, false);
  const legacy = fakeRepo.options.importLegacy;
  assert.equal(typeof legacy, "function");
  assert.equal(await (legacy as () => Promise<unknown>)(), null);
  assert.equal(await runtime.resolveKnorviaBuiltinActiveFilePath(), fakeSource.activeFilePath);
  const read = deferred<unknown>();
  fakeService.action = () => read.promise;
  const started = runtime.start();
  assert.equal(runtime.start(), started);
  assert.equal(fakeService.readCount, 1);
  read.resolve(layer);
  await started;
  await flush();
  assert.equal(runtime.start(), started);
  assert.equal(timers.length, 0);
  assert.equal(await runtime.refreshKnorviaBuiltin(), "skipped");
  const remove = runtime.onDidCheckKnorviaBuiltin(async () => {});
  assert.equal(remove(), true);
  assert.equal(remove(), false);
  runtime.onDidCheckKnorviaBuiltin(async () => {});
  assert.equal(runtime.start(), started);
  assert.equal(timers.length, 0);
  events.length = 0;
  runtime.dispose();
  runtime.dispose();
  assert.deepEqual(events, ["config:dispose", "repo:dispose", "bundled:dispose"]);
  assert.throws(() => runtime.start(), /NodeProviderConfigRuntime 已 dispose/);
  assert.equal(await runtime.refreshKnorviaBuiltin(), "disposed");
  assert.equal(await runtime.resolveKnorviaBuiltinActiveFilePath(), fakeSource.activeFilePath);
  assert.equal(runtime.personalRepository, fakeRepo);
  runtime.onDidCheckKnorviaBuiltin(async () => {})();

  const error = new Error("synthetic initial read failure");
  const retry = new NodeProviderConfigRuntime({ ...options, importLegacy: undefined });
  const retryService = services.at(-1)!;
  assert.equal("importLegacy" in repositories.at(-1)!.options, false);
  retryService.action = () => Promise.reject(error);
  const failed = retry.start();
  await assert.rejects(failed, (value: unknown) => value === error);
  await flush();
  retryService.action = undefined;
  const retried = retry.start();
  assert.notEqual(retried, failed);
  await retried;
  await flush();
  retry.dispose();

  const failures: unknown[] = [];
  const receivers: unknown[] = [];
  const remoteOptions = {
    controlFilePath: " synthetic-control ",
    resolveEndpointKey: () => "synthetic-origin",
    fetchRelease: async () => null,
  };
  const checking = new NodeProviderConfigRuntime({
    ...options,
    knorviaBuiltinRemote: remoteOptions,
    onKnorviaBuiltinRefreshError: function (value) {
      failures.push(value);
      receivers.push(this);
    },
  });
  const remote = remotes.at(-1)!;
  assert.equal(remote.options.source, bundled.at(-1));
  assert.equal(remote.options.controlFilePath, remoteOptions.controlFilePath);
  const force = { force: true };
  assert.equal(checking.refreshKnorviaBuiltin(force), remote.refreshPromise);
  assert.equal(remote.refreshOptions, force);
  const remoteGate = deferred<string>();
  remote.action = () => remoteGate.promise;
  const listenerGate = deferred<void>();
  let checks = 0;
  let removedCalls = 0;
  let lateCalls = 0;
  let removeCaptured = () => {};
  checking.onDidCheckKnorviaBuiltin(async () => {
    checks++;
    removeCaptured();
    checking.onDidCheckKnorviaBuiltin(async () => {
      lateCalls++;
    });
    return listenerGate.promise;
  });
  removeCaptured = checking.onDidCheckKnorviaBuiltin(async () => {
    removedCalls++;
    throw error;
  });
  await checking.start();
  await flush();
  const timer = timers.at(-1)!;
  assert.equal(timer.delay, 60_000);
  assert.equal(timer.unrefs, 1);
  assert.equal(checks, 1);
  assert.equal(removedCalls, 1);
  assert.equal(lateCalls, 0);
  timer.callback();
  timer.callback();
  await flush();
  assert.equal(checks, 1);
  const remoteFailure = new Error("synthetic refresh failure");
  remoteGate.reject(remoteFailure);
  listenerGate.resolve();
  await flush();
  assert.deepEqual(failures, [remoteFailure, error]);
  assert.deepEqual(receivers, [checking, checking]);
  remote.action = undefined;
  timer.callback();
  await flush();
  assert.equal(checks, 2);
  assert.equal(removedCalls, 1);
  assert.equal(lateCalls, 1);
  events.length = 0;
  checking.dispose();
  assert.equal(timer.cleared, true);
  assert.deepEqual(events, [
    "timer:clear",
    "remote:dispose",
    "config:dispose",
    "repo:dispose",
    "bundled:dispose",
  ]);

  const environment = {
    environmentConfigRoot: " synthetic-root ",
    platform: "synthetic-platform",
    appVersion: "synthetic-version",
    resolveEndpointOrigin: () => "synthetic-endpoint",
    fetchRelease: async () => null,
  };
  const remoteCount = remotes.length;
  const endpointRuntime = new NodeProviderConfigRuntime({
    ...options,
    knorviaBuiltinEnvironment: environment,
    knorviaBuiltinRemote: remoteOptions,
  });
  const endpoint = endpoints.at(-1)!;
  assert.equal(remotes.length, remoteCount);
  assert.deepEqual(endpoint.options, {
    bundledFilePath: options.knorviaBuiltinFilePath,
    ...environment,
  });
  assert.equal(endpointRuntime.resolveKnorviaBuiltinActiveFilePath(), endpoint.pathPromise);
  assert.equal(endpointRuntime.refreshKnorviaBuiltin(force), endpoint.refreshPromise);
  assert.equal(endpoint.refreshOptions, force);
  await endpointRuntime.start();
  await flush();
  endpointRuntime.dispose();

  const late = new NodeProviderConfigRuntime(options);
  const pending = deferred<unknown>();
  services.at(-1)!.action = () => pending.promise;
  const timerCount = timers.length;
  const lateStart = late.start();
  late.dispose();
  pending.resolve(layer);
  await lateStart;
  await flush();
  assert.equal(timers.length, timerCount);
  const native = new NodeProviderConfigRuntime(options);
  const nativeFailure = new Error("synthetic teardown failure");
  repositories.at(-1)!.disposeError = nativeFailure;
  events.length = 0;
  assert.throws(
    () => native.dispose(),
    (value: unknown) => value === nativeFailure,
  );
  native.dispose();
  assert.deepEqual(events, ["config:dispose", "repo:dispose"]);
});
