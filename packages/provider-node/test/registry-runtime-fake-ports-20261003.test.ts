import assert from "node:assert/strict";
import { test } from "node:test";
import { ProviderConfigMap } from "@knorvia/provider";
import type { AccountProviderConfigSnapshot } from "@knorvia/provider";
import type { NodeProviderRegistryRuntimeOptions } from "../src/provider-registry-runtime.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function flush() {
  for (let turn = 0; turn < 20; turn++) await Promise.resolve();
}

test("synthetic ports preserve registry bootstrap precedence, await capture, concurrent starts and disposal failures", async (t) => {
  const events: string[] = [];
  const configs: FakeConfigRuntime[] = [];
  const registries: FakeRegistry[] = [];
  const mutableSources: FakeMutable[] = [];
  const providers = ProviderConfigMap.empty();
  const account = (revision: string): AccountProviderConfigSnapshot => ({
    revision,
    basedOnKnorviaBuiltinRevision: revision,
    providers,
  });
  const configSnapshot = Object.freeze({ syntheticConfig: true });
  let builderAction: ((value: unknown) => AccountProviderConfigSnapshot) | undefined;
  class FakeMutable {
    snapshot = account("uninitialized");
    readAction: (() => Promise<AccountProviderConfigSnapshot>) | undefined;
    constructor() {
      events.push("account:create");
      mutableSources.push(this);
    }
    read() {
      events.push("account:read");
      return this.readAction?.() ?? Promise.resolve(this.snapshot);
    }
    replace(value: AccountProviderConfigSnapshot, reason: string) {
      events.push("account:replace:" + reason);
      this.snapshot = value;
      return true;
    }
    onDidChange(_listener: (reason: string) => void) {
      return () => {};
    }
  }
  class FakeConfigRuntime {
    readonly configService = {
      read: () => {
        events.push("config:read");
        return this.readAction?.() ?? Promise.resolve(configSnapshot);
      },
    };
    readonly personalRepository = Object.freeze({ syntheticRepository: true });
    readonly unsubscribe = () => {
      events.push("check:unsubscribe");
    };
    listener: unknown;
    startAction: (() => Promise<void>) | undefined;
    readAction: (() => Promise<unknown>) | undefined;
    disposeError: Error | undefined;
    constructor(readonly options: unknown) {
      events.push("config:create");
      configs.push(this);
    }
    start() {
      events.push("config:start");
      return this.startAction?.() ?? Promise.resolve();
    }
    onDidCheckKnorviaBuiltin(listener: unknown) {
      this.listener = listener;
      events.push("config:subscribe");
      return this.unsubscribe;
    }
    dispose() {
      events.push("config:dispose");
      if (this.disposeError) throw this.disposeError;
    }
  }
  class FakeRegistry {
    startAction: (() => Promise<void>) | undefined;
    disposeAction: (() => void) | undefined;
    constructor(readonly options: Record<string, unknown>) {
      events.push("registry:create");
      registries.push(this);
    }
    start() {
      events.push("registry:start");
      return this.startAction?.() ?? Promise.resolve();
    }
    dispose() {
      events.push("registry:dispose");
      this.disposeAction?.();
    }
  }
  t.mock.module("@knorvia/provider", {
    namedExports: {
      ProviderRegistryService: FakeRegistry,
      MutableAccountProviderConfigSource: FakeMutable,
      createFailClosedAccountProviderConfigSnapshot: (value: unknown) => {
        assert.equal(value, configSnapshot);
        events.push("account:build");
        return builderAction?.(value) ?? account("initialized");
      },
    },
  });
  t.mock.module(new URL("../src/provider-config-runtime.ts", import.meta.url).href, {
    namedExports: { NodeProviderConfigRuntime: FakeConfigRuntime },
  });
  const { NodeProviderRegistryRuntime, createNodeProviderRegistryRuntime } =
    await import("../src/provider-registry-runtime.js");
  const options: NodeProviderRegistryRuntimeOptions = {
    knorviaBuiltinFilePath: " synthetic-bundle ",
    personalFilePath: " synthetic-personal ",
  };
  const runtime = createNodeProviderRegistryRuntime(options);
  const config = configs.at(-1)!;
  const registry = registries.at(-1)!;
  const source = mutableSources.at(-1)!;
  assert.deepEqual(events, ["config:create", "account:create", "registry:create"]);
  assert.equal(config.options, options);
  assert.deepEqual(Reflect.ownKeys(runtime), ["configService", "registryService"]);
  assert.deepEqual(
    Object.getOwnPropertyNames(NodeProviderRegistryRuntime.prototype).sort(),
    ["constructor", "start", "personalRepository", "onDidCheckKnorviaBuiltin", "dispose"].sort(),
  );
  assert.equal(runtime.configService, config.configService);
  assert.equal(runtime.registryService, registry);
  assert.deepEqual(Object.keys(registry.options), ["configSource", "accountSource"]);
  assert.equal(registry.options.configSource, config.configService);
  assert.equal(registry.options.accountSource, source);
  const listener = async () => {};
  assert.equal(runtime.personalRepository, config.personalRepository);
  assert.equal(runtime.onDidCheckKnorviaBuiltin(listener), config.unsubscribe);
  assert.equal(config.listener, listener);
  events.length = 0;
  await runtime.start();
  assert.deepEqual(events, [
    "config:start",
    "account:read",
    "config:read",
    "account:build",
    "account:replace:initial-fail-closed",
    "registry:start",
  ]);
  events.length = 0;
  await runtime.start();
  assert.deepEqual(events, ["config:start", "account:read", "registry:start"]);

  // A creator keeps its options receiver and short-circuits the explicit-source getter.
  let explicitReads = 0;
  const creatorOptions: NodeProviderRegistryRuntimeOptions = {
    ...options,
    createAccountSource(value) {
      assert.equal(this, creatorOptions);
      assert.equal(value, configs.at(-1)!.configService);
      return source;
    },
    get accountSource(): FakeMutable {
      explicitReads++;
      throw new Error("must remain unread");
    },
  };
  new NodeProviderRegistryRuntime(creatorOptions);
  assert.equal(explicitReads, 0);
  const external = {
    read: async () => {
      throw new Error("external read must remain unused");
    },
    onDidChange: (_value: unknown) => () => {},
  };
  const externalRuntime = new NodeProviderRegistryRuntime({ ...options, accountSource: external });
  events.length = 0;
  await externalRuntime.start();
  assert.deepEqual(events, ["config:start", "registry:start"]);
  const nullishOptions = {
    ...options,
    createAccountSource: () => undefined,
    accountSource: external,
  } as unknown as NodeProviderRegistryRuntimeOptions;
  new NodeProviderRegistryRuntime(nullishOptions);
  assert.equal(registries.at(-1)!.options.accountSource, external);
  class DerivedMutable extends FakeMutable {}
  const derived = new DerivedMutable();
  const derivedRuntime = new NodeProviderRegistryRuntime({ ...options, accountSource: derived });
  await derivedRuntime.start();
  assert.equal(derived.snapshot.basedOnKnorviaBuiltinRevision, "initialized");

  // Native member-call evaluation captures replace before the config await.
  const capturedSource = new FakeMutable();
  const captureRuntime = new NodeProviderRegistryRuntime({
    ...options,
    accountSource: capturedSource,
  });
  const captureConfig = configs.at(-1)!;
  const readGate = deferred<unknown>();
  captureConfig.readAction = () => readGate.promise;
  let captureCount = 0;
  let calledCaptured = 0;
  Object.defineProperty(capturedSource, "replace", {
    configurable: true,
    get() {
      captureCount++;
      return function (this: FakeMutable, value: AccountProviderConfigSnapshot, reason: string) {
        assert.equal(this, capturedSource);
        assert.equal(reason, "initial-fail-closed");
        calledCaptured++;
        this.snapshot = value;
      };
    },
  });
  const captureStart = captureRuntime.start();
  await flush();
  assert.equal(captureCount, 1);
  Object.defineProperty(capturedSource, "replace", {
    value: () => {
      throw new Error("late replacement must remain unused");
    },
  });
  readGate.resolve(configSnapshot);
  await captureStart;
  assert.equal(calledCaptured, 1);

  // Each call owns a Promise; no added serialization or late-disposal cancellation.
  const concurrentSource = new FakeMutable();
  const concurrentRuntime = new NodeProviderRegistryRuntime({
    ...options,
    accountSource: concurrentSource,
  });
  const concurrentConfig = configs.at(-1)!;
  const concurrentRegistry = registries.at(-1)!;
  const accountGate = deferred<AccountProviderConfigSnapshot>();
  concurrentSource.readAction = () => accountGate.promise;
  const first = concurrentRuntime.start();
  const second = concurrentRuntime.start();
  assert.notEqual(first, second);
  await flush();
  events.length = 0;
  concurrentRuntime.dispose();
  assert.deepEqual(events, ["registry:dispose", "config:dispose"]);
  events.length = 0;
  accountGate.resolve(account("uninitialized"));
  await Promise.all([first, second]);
  assert.equal(events.filter((x) => x === "account:replace:initial-fail-closed").length, 2);
  assert.equal(events.filter((x) => x === "registry:start").length, 2);
  assert.equal(concurrentRuntime.personalRepository, concurrentConfig.personalRepository);
  assert.equal(concurrentRuntime.onDidCheckKnorviaBuiltin(listener), concurrentConfig.unsubscribe);
  const disposedPromise = concurrentRuntime.start();
  assert.ok(disposedPromise instanceof Promise);
  await assert.rejects(disposedPromise, { message: "NodeProviderRegistryRuntime 已 dispose" });
  assert.equal(concurrentRuntime.registryService, concurrentRegistry);

  // Failures abort exactly the remaining steps and retain their object identity.
  const failure = new Error("synthetic failure");
  for (const stage of [
    "config-start",
    "account-read",
    "config-read",
    "build",
    "replace",
    "registry-start",
  ] as const) {
    const failureSource = new FakeMutable();
    const failureRuntime = new NodeProviderRegistryRuntime({
      ...options,
      accountSource: failureSource,
    });
    const failureConfig = configs.at(-1)!;
    const failureRegistry = registries.at(-1)!;
    if (stage === "config-start") failureConfig.startAction = () => Promise.reject(failure);
    if (stage === "account-read") failureSource.readAction = () => Promise.reject(failure);
    if (stage === "config-read") failureConfig.readAction = () => Promise.reject(failure);
    if (stage === "build")
      builderAction = () => {
        throw failure;
      };
    if (stage === "replace")
      Object.defineProperty(failureSource, "replace", {
        value: () => {
          throw failure;
        },
      });
    if (stage === "registry-start") failureRegistry.startAction = () => Promise.reject(failure);
    events.length = 0;
    await assert.rejects(failureRuntime.start(), (error) => error === failure);
    if (stage !== "registry-start") assert.ok(!events.includes("registry:start"));
    builderAction = undefined;
  }
  const live = new NodeProviderRegistryRuntime({ ...options, accountSource: new FakeMutable() });
  const liveRead = () => {
    events.push("live:read");
    return Promise.resolve(configSnapshot);
  };
  Object.defineProperty(live, "configService", { value: { read: liveRead } });
  let liveStarts = 0;
  Object.defineProperty(live, "registryService", {
    value: {
      start() {
        liveStarts++;
        return Promise.resolve();
      },
      dispose() {},
    },
  });
  await live.start();
  assert.ok(events.includes("live:read"));
  assert.equal(liveStarts, 1);

  for (const stage of ["registry", "config"] as const) {
    const failureRuntime = new NodeProviderRegistryRuntime(options);
    const failureConfig = configs.at(-1)!;
    const failureRegistry = registries.at(-1)!;
    if (stage === "registry")
      failureRegistry.disposeAction = () => {
        failureRuntime.dispose();
        throw failure;
      };
    else failureConfig.disposeError = failure;
    events.length = 0;
    assert.throws(
      () => failureRuntime.dispose(),
      (error) => error === failure,
    );
    assert.deepEqual(
      events,
      stage === "registry" ? ["registry:dispose"] : ["registry:dispose", "config:dispose"],
    );
    failureRuntime.dispose();
    assert.deepEqual(
      events,
      stage === "registry" ? ["registry:dispose"] : ["registry:dispose", "config:dispose"],
    );
    await assert.rejects(failureRuntime.start(), {
      message: "NodeProviderRegistryRuntime 已 dispose",
    });
  }
  events.length = 0;
  runtime.dispose();
  runtime.dispose();
  assert.deepEqual(events, ["registry:dispose", "config:dispose"]);
});
