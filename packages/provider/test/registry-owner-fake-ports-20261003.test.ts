import assert from "node:assert/strict";
import { test } from "node:test";
import { ProviderRegistryService } from "../src/registry-service.js";
import type {
  ProviderConfigResolver,
  ProviderConfigResolution,
  ProviderConfigResolverInput,
} from "../src/resolver.js";
import type { AccountProviderConfigSnapshot, ProviderConfigSnapshot } from "../src/sources.js";
import { ModelConfigRules, ProviderConfigMap, ProviderTemplateMap } from "../src/config/index.js";
import { deferred, FakeSource, flush } from "./fake-owner-ports-20261003.js";

function config(revision: string, builtinRevision = "synthetic-builtin:1"): ProviderConfigSnapshot {
  return {
    revision,
    knorviaBuiltinRevision: builtinRevision,
    personalRevision: "synthetic-personal:1",
    knorviaBuiltinProviders: ProviderConfigMap.empty(),
    knorviaBuiltinProviderTemplates: ProviderTemplateMap.empty(),
    personalProviders: ProviderConfigMap.empty(),
    knorviaBuiltinModelRules: ModelConfigRules.empty(),
    personalModels: ModelConfigRules.empty(),
    personalProviderOrder: [],
  };
}
function account(
  revision: string,
  builtinRevision = "synthetic-builtin:1",
): AccountProviderConfigSnapshot {
  return {
    revision,
    basedOnKnorviaBuiltinRevision: builtinRevision,
    providers: ProviderConfigMap.empty(),
    states: {},
  };
}

test("synthetic registry ports preserve consistency gating, source/snapshot identity, coalescing, native failure and cancellation lifetime", async () => {
  const marker = Object.freeze({ synthetic: true });
  const source = new FakeSource<ProviderConfigSnapshot>(
    Object.assign(config("synthetic-config:1"), { marker }),
  );
  const accounts = new FakeSource<AccountProviderConfigSnapshot>(
    Object.assign(account("synthetic-account:0", "synthetic-old"), { discarded: marker }),
  );
  const inputs: ProviderConfigResolverInput[] = [];
  const resolution: ProviderConfigResolution = {
    effectiveBuiltinProviders: ProviderConfigMap.empty(),
    effectiveProviders: ProviderConfigMap.empty(),
    resolvedProviders: [],
    registryProviders: [],
    issues: [],
  };
  let resolverFailure: Error | undefined;
  const resolver: ProviderConfigResolver = {
    resolve(input) {
      inputs.push(input);
      if (resolverFailure) throw resolverFailure;
      return resolution;
    },
  };
  const owner = new ProviderRegistryService({
    configSource: source,
    accountSource: accounts,
    resolver,
  });
  assert.deepEqual(Reflect.ownKeys(owner), []);
  assert.deepEqual(
    Object.getOwnPropertyNames(ProviderRegistryService.prototype).sort(),
    [
      "constructor",
      "start",
      "refresh",
      "getSnapshot",
      "getView",
      "listProviders",
      "getProvider",
      "getModel",
      "validateSelection",
      "onDidChange",
      "onDidRefreshError",
      "dispose",
    ].sort(),
  );
  assert.equal(owner.getSnapshot(), null);
  assert.equal(owner.getView().revision, 0);
  assert.equal(source.subscribeCount, 0);
  assert.throws(() => owner.refresh(), /必须先 start/);
  const changed: Array<{ reasons: readonly string[]; snapshot: unknown }> = [];
  const errors: Array<{ error: unknown; reasons: readonly string[] }> = [];
  owner.onDidChange((event) => {
    assert.ok(Object.isFrozen(event));
    assert.ok(Object.isFrozen(event.reasons));
    assert.equal(owner.getSnapshot(), event.snapshot);
    changed.push(event);
  });
  owner.onDidRefreshError((event) => {
    assert.ok(Object.isFrozen(event));
    assert.ok(Object.isFrozen(event.reasons));
    errors.push(event);
  });
  let started = false;
  const starting = owner.start().then(() => {
    started = true;
  });
  await flush();
  assert.equal(started, false);
  assert.equal(owner.getSnapshot(), null);
  assert.equal(inputs.length, 0);
  accounts.snapshot = Object.assign(account("synthetic-account:1"), { discarded: marker });
  accounts.emit("");
  await starting;
  const first = owner.getSnapshot()!;
  assert.equal(source.subscribeCount, 1);
  assert.equal(accounts.subscribeCount, 1);
  assert.equal(inputs.length, 1);
  assert.deepEqual(changed[0]?.reasons, ["account:changed"]);
  assert.equal(first.resolution, resolution);
  assert.notEqual(first.config, source.snapshot);
  assert.equal(first.config.knorviaBuiltinProviders, source.snapshot.knorviaBuiltinProviders);
  assert.equal("marker" in first.config && first.config.marker, marker);
  assert.equal("discarded" in first.account, false);
  assert.equal(first.account.states, accounts.snapshot.states);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.config));
  assert.ok(Object.isFrozen(first.account));
  assert.ok(Object.isFrozen(first.sourceRevisions));
  const readCount = source.readCount;
  await owner.start();
  assert.equal(source.readCount, readCount);
  assert.equal(await owner.refresh(), first);
  assert.equal(inputs.length, 1);
  accounts.snapshot = account("synthetic-account:mismatch", "synthetic-other");
  assert.equal(await owner.refresh("mismatch"), first);
  assert.equal(owner.getSnapshot(), first);
  assert.equal(changed.length, 1);

  accounts.snapshot = account("synthetic-account:2");
  source.snapshot = config("synthetic-config:2");
  const staleRead = deferred<ProviderConfigSnapshot>();
  const readEntered = deferred<void>();
  let useDeferred = true;
  source.readAction = () => {
    if (useDeferred) {
      useDeferred = false;
      readEntered.resolve(undefined);
      return staleRead.promise;
    }
    return Promise.resolve(source.snapshot);
  };
  const requestOne = owner.refresh("one");
  await readEntered.promise;
  const requestTwo = owner.refresh("two");
  const requestDuplicate = owner.refresh("one");
  assert.notEqual(requestOne, requestTwo);
  staleRead.resolve(config("synthetic-stale"));
  const fresh = await requestOne;
  assert.equal(await requestTwo, fresh);
  assert.equal(await requestDuplicate, fresh);
  assert.equal(fresh.sourceRevisions.config, "synthetic-config:2");
  assert.deepEqual(changed.at(-1)?.reasons, ["one", "two"]);
  assert.equal(inputs.length, 2);
  source.readAction = undefined;

  const sourceError = new Error("synthetic source failure");
  source.readAction = () => Promise.reject(sourceError);
  await assert.rejects(owner.refresh("failed-read"), (error: unknown) => error === sourceError);
  assert.equal(errors.at(-1)?.error, sourceError);
  assert.equal(owner.getSnapshot(), fresh);
  source.readAction = undefined;
  source.snapshot = config("synthetic-config:3");
  resolverFailure = new Error("synthetic resolver failure");
  await assert.rejects(
    owner.refresh("failed-resolution"),
    (error: unknown) => error === resolverFailure,
  );
  assert.equal(errors.at(-1)?.error, resolverFailure);
  assert.equal(owner.getSnapshot(), fresh);
  resolverFailure = undefined;
  const listenerFailure = new Error("synthetic observer failure");
  const removeThrower = owner.onDidChange(() => {
    throw listenerFailure;
  });
  const published = await owner.refresh("observer-failure");
  assert.notEqual(published, fresh);
  assert.equal(owner.getSnapshot(), published);
  assert.equal(errors.at(-1)?.error, listenerFailure);
  removeThrower();
  assert.deepEqual(owner.listProviders(), []);
  assert.equal(owner.getProvider("synthetic-absent"), undefined);
  assert.equal(owner.getModel("synthetic-absent", "synthetic-model"), undefined);
  assert.deepEqual(
    owner.validateSelection({ providerId: "synthetic-absent", modelId: "synthetic-model" }),
    {
      ok: false,
      code: "provider-not-found",
      providerId: "synthetic-absent",
    },
  );

  source.snapshot = config("synthetic-config:4");
  const disposalRead = deferred<ProviderConfigSnapshot>();
  source.readAction = () => disposalRead.promise;
  const pendingOne = owner.refresh("pending-one");
  const pendingTwo = owner.refresh("pending-two");
  const firstRejection = pendingOne.catch((error: unknown) => error);
  const secondRejection = pendingTwo.catch((error: unknown) => error);
  owner.dispose();
  owner.dispose();
  const disposalError = await firstRejection;
  assert.ok(disposalError instanceof Error);
  assert.equal(disposalError.message, "ProviderRegistryService 已 dispose");
  assert.equal(await secondRejection, disposalError);
  const eventCount = changed.length;
  disposalRead.resolve(source.snapshot);
  await flush();
  assert.equal(owner.getSnapshot(), published);
  assert.equal(changed.length, eventCount);
  assert.equal(source.disposeCount, 1);
  assert.equal(accounts.disposeCount, 1);
  assert.throws(() => owner.refresh(), /已 dispose/);
  await assert.rejects(owner.start(), /已 dispose/);
  owner.onDidChange(() => {})();
  owner.onDidRefreshError(() => {})();
});
