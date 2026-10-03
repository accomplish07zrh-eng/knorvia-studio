import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AccountProviderService,
  type AccountProviderResolveInput,
  type AccountProviderServiceRefreshErrorEvent,
} from "../src/account-provider-service.js";
import type { AccountProviderStates } from "../src/account-provider-state.js";
import {
  ModelConfigRules,
  ProviderConfig,
  ProviderConfigMap,
  ProviderTemplateMap,
  ZhipuAccountAccessConfig,
} from "../src/config/index.js";
import type { ProviderConfigSnapshot } from "../src/sources.js";
import { deferred, FakeSource, flush } from "./fake-owner-ports-20261003.js";

function config(revision: string): ProviderConfigSnapshot {
  return {
    revision: `overall:${revision}`,
    personalRevision: "synthetic-personal",
    knorviaBuiltinRevision: revision,
    knorviaBuiltinProviders: new ProviderConfigMap([
      {
        providerId: "synthetic-account",
        config: new ProviderConfig({ access: new ZhipuAccountAccessConfig() }),
      },
      { providerId: "synthetic-personal", config: new ProviderConfig() },
    ]),
    knorviaBuiltinProviderTemplates: ProviderTemplateMap.empty(),
    personalProviders: ProviderConfigMap.empty(),
    knorviaBuiltinModelRules: ModelConfigRules.empty(),
    personalModels: ModelConfigRules.empty(),
  };
}
const states: AccountProviderStates = Object.freeze({
  "synthetic-account": Object.freeze({
    availability: "available",
    entitled: true,
    connectionKey: "synthetic-identity",
  }),
});
const providers = new ProviderConfigMap([
  {
    providerId: "synthetic-account",
    config: new ProviderConfig({ access: new ZhipuAccountAccessConfig({ entitled: true }) }),
  },
]);

test("fake account/config ports preserve lazy startup, stale-success suppression, generations, identity and native lifecycle", async () => {
  const source = new FakeSource(config("builtin:1"));
  const gate = deferred<{ providers: ProviderConfigMap; states: AccountProviderStates }>();
  const entered = deferred<void>();
  const calls: AccountProviderResolveInput[] = [];
  let first = true;
  const service = new AccountProviderService({
    configSource: source,
    resolve: async (value) => {
      calls.push(value);
      if (first) {
        first = false;
        entered.resolve();
        return gate.promise;
      }
      return { providers, states };
    },
  });
  assert.deepEqual(Reflect.ownKeys(service), []);
  assert.deepEqual(
    Object.getOwnPropertyNames(AccountProviderService.prototype).sort(),
    ["constructor", "read", "refresh", "onDidChange", "onDidRefreshError", "dispose"].sort(),
  );
  const remover = service.onDidChange(() => {});
  assert.equal(remover(), true);
  assert.equal(remover(), false);
  assert.equal(source.subscribeCount, 0);
  assert.equal(source.readCount, 0);
  const changes: string[] = [];
  service.onDidChange((reason) => changes.push(reason));
  const reading = service.read();
  const concurrent = service.read();
  await entered.promise;
  assert.equal(source.subscribeCount, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.reasons, ["start"]);
  assert.ok(Object.isFrozen(calls[0]?.reasons));
  assert.equal(calls[0]?.configuredProviders, source.snapshot.knorviaBuiltinProviders);
  const updating = service.refresh("synthetic-write");
  source.snapshot = config("builtin:2");
  source.emit("");
  gate.resolve({ providers, states });
  const [initial, coRead, updated] = await Promise.all([reading, concurrent, updating]);
  assert.equal(initial, coRead);
  assert.equal(initial, updated);
  assert.equal(initial.basedOnKnorviaBuiltinRevision, "builtin:2");
  assert.equal(initial.providers, providers);
  assert.equal(initial.states, states);
  assert.deepEqual(changes, []);
  assert.deepEqual(calls[1]?.reasons, [
    "synthetic-write",
    "config:changed",
    "superseded-resolution",
  ]);
  assert.equal(calls[1]?.previousStates, undefined);
  assert.equal(await service.refresh(), initial);
  assert.equal(calls[2]?.previousStates, states);
  assert.equal(calls[2]?.previousProviders, providers);
  assert.deepEqual(changes, []);

  source.snapshot = { ...source.snapshot, personalRevision: "personal:2", revision: "overall:2" };
  assert.equal(await service.refresh("personal-only"), initial);
  source.snapshot = config("builtin:3");
  const observed: string[] = [];
  let removeLater = () => {};
  service.onDidChange((reason) => {
    observed.push(reason);
    removeLater();
    service.onDidChange(() => observed.push("new"));
  });
  removeLater = service.onDidChange(() => observed.push("removed"));
  const changed = await service.refresh("builtin-write");
  assert.notEqual(changed, initial);
  assert.equal(changed.basedOnKnorviaBuiltinRevision, "builtin:3");
  assert.deepEqual(observed, ["builtin-write", "new"]);
  assert.deepEqual(changes, ["builtin-write"]);
  service.dispose();
  service.dispose();
  assert.equal(source.disposeCount, 1);
  await assert.rejects(service.read(), /AccountProviderService 已 dispose/);
  assert.throws(() => service.refresh(), /AccountProviderService 已 dispose/);
  service.onDidChange(() => {})();

  const order: string[] = [];
  const orderedSource = new FakeSource(config("getter-order"));
  orderedSource.readAction = async () => {
    order.push("read");
    return orderedSource.snapshot;
  };
  const ordered = new AccountProviderService({
    configSource: orderedSource,
    resolve: async () => ({
      get providers() {
        order.push("providers");
        return providers;
      },
      get states() {
        order.push("states");
        return states;
      },
    }),
  });
  await ordered.read();
  assert.deepEqual(order, ["read", "providers", "states", "read"]);
  ordered.dispose();

  const badSource = new FakeSource(config("bad"));
  const readFailure = new Error("synthetic source failure");
  badSource.readAction = () => Promise.reject(readFailure);
  const noConfig = new AccountProviderService({
    configSource: badSource,
    resolve: async () => ({ providers, states }),
  });
  await assert.rejects(noConfig.read(), (error: unknown) => error === readFailure);
  noConfig.dispose();

  const fallbackSource = new FakeSource(config("anonymous"));
  const authFailure = new Error("synthetic resolver failure");
  let failing = true;
  const events: AccountProviderServiceRefreshErrorEvent[] = [];
  const fallback = new AccountProviderService({
    configSource: fallbackSource,
    resolve: async () => {
      if (failing) throw authFailure;
      return { providers, states };
    },
  });
  const fallbackChanges: string[] = [];
  fallback.onDidChange((reason) => fallbackChanges.push(reason));
  fallback.onDidRefreshError((event) => events.push(event));
  const anonymous = await fallback.read();
  const anonymousAccess = anonymous.providers.get("synthetic-account")?.access;
  assert.equal(anonymousAccess?.type, "zhipu-account");
  assert.equal(anonymousAccess instanceof ZhipuAccountAccessConfig, true);
  assert.equal(
    anonymousAccess instanceof ZhipuAccountAccessConfig ? anonymousAccess.entitled : undefined,
    false,
  );
  assert.equal(anonymous.providers.has("synthetic-personal"), false);
  assert.equal(anonymous.states, undefined);
  assert.equal(events[0]?.error, authFailure);
  assert.ok(Object.isFrozen(events[0]));
  assert.ok(Object.isFrozen(events[0]?.reasons));
  assert.deepEqual(fallbackChanges, []);
  await assert.rejects(
    fallback.refresh("later-failure"),
    (error: unknown) => error === authFailure,
  );
  assert.equal(await fallback.read(), anonymous);
  failing = false;
  const recovered = await fallback.refresh("recovered");
  assert.equal(recovered.states, states);
  assert.deepEqual(fallbackChanges, ["recovered"]);
  fallback.dispose();

  const restartSource = new FakeSource(config("restart"));
  const delayed = deferred<{ providers: ProviderConfigMap; states: AccountProviderStates }>();
  const resolverEntered = deferred<void>();
  let delay = false;
  const restartCalls: AccountProviderResolveInput[] = [];
  const restart = new AccountProviderService({
    configSource: restartSource,
    resolve: async (value) => {
      restartCalls.push(value);
      if (delay) {
        delay = false;
        resolverEntered.resolve();
        return delayed.promise;
      }
      return { providers, states };
    },
  });
  const lastGood = await restart.read();
  delay = true;
  const failed = restart.refresh("old-generation");
  const failedCheck = assert.rejects(failed, (error: unknown) => error === authFailure);
  await resolverEntered.promise;
  const next = restart.refresh("new-generation");
  delayed.reject(authFailure);
  await failedCheck;
  assert.equal(await next, lastGood);
  assert.deepEqual(restartCalls.at(-1)?.reasons, ["new-generation"]);
  restart.dispose();

  const disposeSource = new FakeSource(config("dispose"));
  const pendingRead = deferred<ProviderConfigSnapshot>();
  disposeSource.readAction = () => pendingRead.promise;
  const disposing = new AccountProviderService({
    configSource: disposeSource,
    resolve: async () => ({ providers, states }),
  });
  const a = disposing.refresh("a").catch((error: unknown) => error);
  const b = disposing.refresh("b").catch((error: unknown) => error);
  disposing.dispose();
  const [aError, bError] = await Promise.all([a, b]);
  assert.equal(aError, bError);
  assert.match(String(aError), /AccountProviderService 已 dispose/);
  pendingRead.resolve(disposeSource.snapshot);
  await flush();

  const throwingSource = new FakeSource(config("native-disposer"));
  const nativeError = new Error("synthetic disposer failure");
  const throwing = new AccountProviderService({
    configSource: throwingSource,
    resolve: async () => ({ providers, states }),
  });
  await throwing.read();
  throwingSource.disposeFailure = nativeError;
  assert.throws(
    () => throwing.dispose(),
    (error: unknown) => error === nativeError,
  );
  throwing.dispose();
  assert.equal(throwingSource.disposeCount, 1);
});
