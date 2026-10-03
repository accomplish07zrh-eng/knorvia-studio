import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createAccountProviderConfigResolver,
  resolveAccountProviderConfigs,
  type AccountProviderConnectionResult,
} from "../src/account-provider-resolution.js";
import type { AccountProviderResolveInput } from "../src/account-provider-service.js";
import {
  ProviderConfig,
  ProviderConfigMap,
  ZhipuAccountAccessConfig,
} from "../src/config/index.js";

function accountConfig(start = false, hidden = false) {
  return new ProviderConfig({
    access: new ZhipuAccountAccessConfig(start ? { mode: "start-plan" } : {}),
    ...(hidden ? { visibility: "hidden" as const } : {}),
  });
}

test("synthetic snapshots preserve complete account admission, entitlement/models, unknown-state identity and async projection", async () => {
  const account = accountConfig();
  const start = accountConfig(true);
  const configured = new ProviderConfigMap([
    ["ordinary", new ProviderConfig()],
    ["available", account],
    ["pending-start", start],
    ["missing-previous", account],
    ["missing-empty", account],
    ["unavailable", start],
    ["reset", account],
    ["unknown", account],
    ["hidden", accountConfig(false, true)],
    ["start-empty", start],
  ]);
  const carried = new ProviderConfig({
    access: new ZhipuAccountAccessConfig({ entitled: true }),
    builtinModelIds: ["synthetic-old"],
  });
  const previous = new ProviderConfigMap([
    ["unknown", carried],
    ["missing-previous", carried],
    ["reset", carried],
    ["unavailable", carried],
    ["removed", carried],
  ]);
  const connections: readonly AccountProviderConnectionResult[] = [
    { providerId: "unknown", status: "unknown" },
    {
      providerId: "unavailable",
      status: "unavailable",
      unavailableReason: "credential-failed",
      current: false,
    },
    {
      providerId: "pending-start",
      status: "pending",
      models: ["  synthetic-a ", " ", "synthetic-a", "synthetic-b "],
    },
    {
      providerId: "available",
      status: "available",
      get models(): readonly string[] {
        throw new Error("non-start models must remain unread");
      },
    },
    { providerId: "reset", status: "unknown", resetPrevious: true },
    { providerId: "hidden", status: "available", current: true, effectiveAt: 0 },
    { providerId: "start-empty", status: "available", models: [] },
    { providerId: "missing-empty", status: "unknown" },
  ];
  const overlay = resolveAccountProviderConfigs({
    configuredProviders: configured,
    previousProviders: previous,
    connections,
  });
  assert.deepEqual(
    overlay.keys(),
    configured.keys().filter((id) => id !== "ordinary"),
  );
  assert.equal(overlay.get("ordinary"), undefined);
  assert.equal(overlay.get("removed"), undefined);
  assert.equal(overlay.get("unknown"), carried);
  assert.equal(overlay.get("missing-previous"), carried);
  assert.equal(overlay.get("unknown")?.builtinModelIds, carried.builtinModelIds);
  const entitlement = (id: string) => {
    const access = overlay.get(id)?.access;
    return access?.type === "zhipu-account" && access.entitled;
  };
  for (const id of ["reset", "missing-empty", "unavailable", "pending-start"])
    assert.equal(entitlement(id), false);
  for (const id of ["available", "hidden", "start-empty"]) assert.equal(entitlement(id), true);
  assert.deepEqual(overlay.get("pending-start")?.builtinModelIds, [
    "synthetic-a",
    "synthetic-a",
    "synthetic-b",
  ]);
  assert.ok(Object.isFrozen(overlay.get("pending-start")?.builtinModelIds));
  assert.deepEqual(overlay.get("start-empty")?.builtinModelIds, []);
  assert.equal(overlay.get("unavailable")?.builtinModelIds, undefined);
  assert.equal(overlay.get("hidden")?.visibility, undefined);
  const availableAccess = overlay.get("available")?.access;
  assert.equal(availableAccess?.type === "zhipu-account" && availableAccess.mode, undefined);
  assert.equal(configured.get("hidden")?.visibility, "hidden");
  assert.equal(previous.get("reset"), carried);

  const metadata = Object.freeze({ synthetic: true });
  const symbol = Symbol("synthetic extra state");
  const oldState = {
    availability: "unavailable" as const,
    entitled: false,
    unavailableReason: "not-entitled" as const,
    current: true,
    connectionKey: "synthetic-old-identity",
    effectiveAt: 42,
    extra: metadata,
    [symbol]: metadata,
  };
  let callbackInput: unknown;
  const reasons = ["synthetic-reason"];
  const resolve = createAccountProviderConfigResolver(async (value) => {
    callbackInput = value;
    return connections;
  });
  const snapshot = await resolve({
    configRevision: " synthetic-revision ",
    configuredProviders: configured,
    previousProviders: previous,
    previousStates: { unknown: oldState, reset: oldState, unavailable: oldState },
    reasons,
  });
  assert.deepEqual(Object.keys(callbackInput as object), [
    "configRevision",
    "configuredProviders",
    "reasons",
  ]);
  assert.equal((callbackInput as { reasons: unknown }).reasons, reasons);
  assert.equal((callbackInput as { configuredProviders: unknown }).configuredProviders, configured);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.states));
  assert.deepEqual(Object.keys(snapshot), ["providers", "states"]);
  assert.deepEqual(
    Object.keys(snapshot.states),
    connections.map((c) => c.providerId),
  );
  assert.equal(snapshot.states["missing-previous"], undefined);
  const unknown = snapshot.states.unknown!;
  assert.equal(unknown.availability, "unavailable");
  assert.equal(unknown.entitled, true);
  assert.equal(unknown.unavailableReason, "not-entitled");
  assert.equal(unknown.current, true);
  assert.equal(unknown.effectiveAt, 42);
  assert.ok(Object.hasOwn(unknown, "connectionKey"));
  assert.equal(unknown.connectionKey, undefined);
  assert.equal(Reflect.get(unknown, "extra"), metadata);
  assert.equal(Reflect.get(unknown, symbol), metadata);
  assert.ok(Object.isFrozen(unknown));
  assert.notEqual(unknown, oldState);
  assert.ok(!Object.isFrozen(oldState));
  assert.equal(oldState.connectionKey, "synthetic-old-identity");
  assert.equal(snapshot.states.reset?.availability, "unknown");
  assert.equal(snapshot.states.reset?.entitled, false);
  assert.ok(!Object.hasOwn(snapshot.states.reset!, "current"));
  assert.ok(!Object.hasOwn(snapshot.states.reset!, "effectiveAt"));
  assert.equal(snapshot.states.unavailable?.unavailableReason, "credential-failed");
  assert.equal(snapshot.states.unavailable?.current, false);
  assert.equal(snapshot.states.hidden?.effectiveAt, 0);
  assert.equal(snapshot.states.hidden?.current, true);
  assert.ok(!Object.hasOwn(snapshot.states.available!, "unavailableReason"));

  // All connections are admitted before configured enumeration, with native failures intact.
  for (const [inputConnections, message] of [
    [
      [
        { providerId: "available", status: "unknown" },
        { providerId: "available", status: "unavailable" },
      ],
      "重复 Account Provider 连接结果: available",
    ],
    [
      [{ providerId: "not-configured", status: "unknown" }],
      "Account 连接指向未配置 Provider: not-configured",
    ],
    [
      [{ providerId: "ordinary", status: "unknown" }],
      "Account 连接指向非 Account Provider: ordinary",
    ],
  ] as const) {
    assert.throws(
      () =>
        resolveAccountProviderConfigs({
          configuredProviders: configured,
          previousProviders: previous,
          connections: inputConnections,
        }),
      { message },
    );
  }
  const failure = new Error("synthetic native failure");
  const badModel = {
    trim() {
      throw failure;
    },
  } as unknown as string;
  assert.throws(
    () =>
      resolveAccountProviderConfigs({
        configuredProviders: configured,
        previousProviders: previous,
        connections: [{ providerId: "pending-start", status: "available", models: [badModel] }],
      }),
    (error) => error === failure,
  );
  const badConnection: AccountProviderConnectionResult = {
    get providerId(): string {
      throw failure;
    },
    status: "unknown",
  };
  assert.throws(
    () =>
      resolveAccountProviderConfigs({
        configuredProviders: configured,
        previousProviders: previous,
        connections: [badConnection],
      }),
    (error) => error === failure,
  );
  const rejected = createAccountProviderConfigResolver(() => Promise.reject(failure));
  await assert.rejects(
    rejected({
      configRevision: "synthetic",
      configuredProviders: configured,
      previousProviders: previous,
    }),
    (error) => error === failure,
  );
  const throwing = createAccountProviderConfigResolver(() => {
    throw failure;
  });
  await assert.rejects(
    throwing({
      configRevision: "synthetic",
      configuredProviders: configured,
      previousProviders: previous,
    }),
    (error) => error === failure,
  );

  // Async adapter uses the initial callback refs and live projection refs after await.
  let release!: (value: readonly AccountProviderConnectionResult[]) => void;
  const gate = new Promise<readonly AccountProviderConnectionResult[]>((yes) => {
    release = yes;
  });
  const alternate = new ProviderConfigMap([["available", account]]);
  const input: AccountProviderResolveInput = {
    configRevision: "synthetic",
    configuredProviders: configured,
    previousProviders: previous,
  };
  const late = createAccountProviderConfigResolver(async (value) => {
    assert.equal(value.configuredProviders, configured);
    assert.deepEqual(value.reasons, []);
    return gate;
  })(input);
  Object.defineProperty(input, "configuredProviders", { value: alternate });
  release([{ providerId: "available", status: "available" }]);
  const lateSnapshot = await late;
  assert.deepEqual(lateSnapshot.providers.keys(), ["available"]);

  // Ordinary record assignment and prior-field spread are preserved without new policy.
  const special = new ProviderConfigMap([["__proto__", account]]);
  const specialSnapshot = await createAccountProviderConfigResolver(async () => [
    { providerId: "__proto__", status: "available" },
  ])({
    configRevision: "synthetic",
    configuredProviders: special,
    previousProviders: ProviderConfigMap.empty(),
  });
  assert.deepEqual(Object.keys(specialSnapshot.states), []);
  assert.equal(Object.getPrototypeOf(specialSnapshot.states).entitled, true);
  assert.ok(Object.isFrozen(Object.getPrototypeOf(specialSnapshot.states)));
});
