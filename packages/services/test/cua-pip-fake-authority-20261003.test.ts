import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { mock, test } from "node:test";
import type { CuaPipSessionService } from "../src/cua-permission-broker/cuaPipSession.js";
import type { ServiceLogger } from "../src/logger/serviceLogger.js";

type LifecycleEvent = Parameters<CuaPipSessionService["publishLifecycle"]>[0];
type FocusEvent = Parameters<CuaPipSessionService["publishFocus"]>[0];
type AnyEvent = LifecycleEvent | FocusEvent;
interface ClientOptions {
  socketPath?: string;
  onDiagnostic?: (event: { code: string; message?: string }) => void;
}
interface Log {
  level: string;
  args: unknown[];
}
const logs: Log[] = [];
const defaults: string[] = [];
const logger: ServiceLogger = {
  debug: (...args) => logs.push({ level: "debug", args }),
  info: (...args) => logs.push({ level: "info", args }),
  warn: (...args) => logs.push({ level: "warn", args }),
  error: (...args) => logs.push({ level: "error", args }),
};
const portUrl = "data:text/javascript,export%20const%20createPipSessionClient%20%3D%20undefined%3B";
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@knorvia/cua/pip-session/node") return { url: portUrl, shortCircuit: true };
    return next(specifier, context);
  },
});
mock.module(portUrl, {
  namedExports: {
    createPipSessionClient: () => {
      defaults.push("client");
      throw new Error("default native client authority forbidden");
    },
  },
});
mock.module(new URL("../src/logger/serviceLogger.ts", import.meta.url).href, {
  namedExports: {
    createServiceLogger: (scope: string) => {
      assert.equal(scope, "cua-pip-session");
      defaults.push("logger");
      return logger;
    },
  },
});
const { createCuaPipSessionService } =
  await import("../src/cua-permission-broker/cuaPipSessionService.js");
const drain = async () => {
  for (let i = 0; i < 16; i++) await Promise.resolve();
};
const start = (turnId = "synthetic-turn") =>
  ({
    kind: "turn-started",
    sessionId: "synthetic-session",
    turnId,
    eventId: `synthetic-start-${turnId}`,
    sequenceNumber: 1,
  }) as LifecycleEvent;
const focus = () =>
  ({
    kind: "focus-changed",
    sessionId: "synthetic-session",
    revision: 3,
    sourceWindowId: "synthetic-window",
  }) as FocusEvent;
const end = (turnId = "synthetic-turn") =>
  ({
    kind: "turn-ended",
    sessionId: "synthetic-session",
    turnId,
    outcome: "completed",
    eventId: "synthetic-ended",
    sequenceNumber: 2,
  }) as LifecycleEvent;
class FakeClient {
  enabled = true;
  connected = 0;
  closed = 0;
  events: AnyEvent[] = [];
  connectFailure?: unknown;
  closeFailure?: Error;
  sendFailure?: unknown;
  constructor(readonly options: ClientOptions) {}
  async connect() {
    this.connected++;
    if (this.connectFailure !== undefined) throw this.connectFailure;
  }
  async send(event: AnyEvent) {
    this.events.push(event);
    if (this.sendFailure !== undefined) throw this.sendFailure;
    return { applied: false, reason: "synthetic-ack" };
  }
  close() {
    this.closed++;
    if (this.closeFailure) throw this.closeFailure;
  }
}

test("synthetic PiP ports preserve session identity, serial delivery, replay quarantine, disposal and log failure authority", async () => {
  mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1000 });
  const clients: FakeClient[] = [];
  const makeClient = (options: ClientOptions) => {
    const client = new FakeClient(options);
    clients.push(client);
    return client;
  };
  try {
    let credentialCalls = 0;
    const disabled = createCuaPipSessionService({
      enabled: false,
      resolveCredentials: async () => {
        credentialCalls++;
        throw new Error("disabled must not resolve authority");
      },
      logger,
    });
    assert.equal(disabled.publishFocus, disabled.publishLifecycle);
    await disabled.publishFocus(focus());
    assert.equal(credentialCalls, 0);
    disabled.dispose();
    assert.deepEqual(logs.at(-1)!.args[2], {
      kind: "focus-changed",
      revision: 3,
      sessionId: "synthetic-session",
      sourceWindowId: "synthetic-window",
      skipReason: "service-disabled",
    });

    let credentials: { socketPath: string } | undefined;
    const pending = createCuaPipSessionService({
      enabled: true,
      resolveCredentials: async () => {
        credentialCalls++;
        return credentials;
      },
      createClient: makeClient,
      logger,
    });
    const opening = start();
    await pending.publishLifecycle(opening);
    const beforeTimer = credentialCalls;
    mock.timers.tick(249);
    await drain();
    assert.equal(credentialCalls, beforeTimer);
    credentials = { socketPath: "/synthetic/cua-a" };
    mock.timers.tick(1);
    await drain();
    assert.equal(clients[0]!.connected, 1);
    assert.equal(clients[0]!.events[0], opening);
    const focused = focus();
    await pending.publishFocus(focused);
    assert.deepEqual(clients[0]!.events, [opening, focused]);
    assert.deepEqual(Object.keys(clients[0]!.options), ["socketPath", "onDiagnostic"]);
    clients[0]!.options.onDiagnostic!({ code: "version_mismatch", message: "synthetic" });
    assert.equal(logs.at(-1)!.level, "warn");
    clients[0]!.options.onDiagnostic!({ code: "synthetic-note" });
    assert.equal(logs.at(-1)!.level, "debug");
    assert.equal(logs.at(-1)!.args[1], "[cua-pip-session] synthetic-note: undefined");
    await pending.publishLifecycle(end());
    assert.deepEqual(Object.keys(logs.at(-1)!.args[2] as object), [
      "eventId",
      "kind",
      "sequenceNumber",
      "sessionId",
      "turnId",
      "outcome",
      "applied",
      "reason",
    ]);
    pending.dispose();
    assert.equal(clients[0]!.closed, 1);
    const afterDispose = credentialCalls;
    await pending.publishLifecycle(start("ignored"));
    assert.equal(credentialCalls, afterDispose);

    credentials = undefined;
    const cancellation = createCuaPipSessionService({
      enabled: true,
      resolveCredentials: async () => {
        credentialCalls++;
        return credentials;
      },
      createClient: makeClient,
      logger,
    });
    await cancellation.publishLifecycle(start("old"));
    await cancellation.publishLifecycle(start("new"));
    await cancellation.publishLifecycle(end("old"));
    credentials = { socketPath: "/synthetic/cua-b" };
    await cancellation.publishFocus(focused);
    assert.equal((clients[1]!.events[0] as { turnId: string }).turnId, "new");
    credentials = undefined;
    await cancellation.publishLifecycle(start("cancel"));
    await cancellation.publishLifecycle(end("cancel"));
    const beforeCancelTick = credentialCalls;
    mock.timers.tick(250);
    await drain();
    assert.equal(credentialCalls, beforeCancelTick);
    await cancellation.publishLifecycle(start("property-presence"));
    await cancellation.publishLifecycle({
      kind: "session-closed",
      sessionId: "synthetic-session",
      turnId: undefined,
    } as LifecycleEvent);
    credentials = { socketPath: "/synthetic/cua-b" };
    await cancellation.publishFocus(focused);
    assert.equal((clients[1]!.events.at(-2) as { turnId: string }).turnId, "property-presence");
    credentials = undefined;
    await cancellation.publishLifecycle(start("closed"));
    await cancellation.publishLifecycle({
      kind: "session-closed",
      sessionId: "synthetic-session",
    } as LifecycleEvent);
    const beforeClosedTick = credentialCalls;
    mock.timers.tick(250);
    await drain();
    assert.equal(credentialCalls, beforeClosedTick);
    cancellation.dispose();

    let socket = "/synthetic/quarantined";
    const mismatch = Object.assign(new Error("synthetic incompatible version"), {
      code: "version_mismatch",
    });
    const quarantinedClients: FakeClient[] = [];
    const quarantine = createCuaPipSessionService({
      enabled: true,
      resolveCredentials: async () => ({ socketPath: socket }),
      createClient: (options) => {
        const client = new FakeClient(options);
        if (socket === "/synthetic/quarantined") client.connectFailure = mismatch;
        quarantinedClients.push(client);
        return client;
      },
      logger,
    });
    await quarantine.publishFocus(focused);
    assert.equal(quarantinedClients[0]!.closed, 1);
    await quarantine.publishLifecycle(opening);
    assert.equal(quarantinedClients.length, 1);
    assert.equal((logs.at(-1)!.args[2] as { skipReason: string }).skipReason, "transport-disabled");
    socket = "/synthetic/compatible";
    await quarantine.publishFocus(focused);
    assert.deepEqual(quarantinedClients[1]!.events, [opening, focused]);
    socket = "/synthetic/quarantined";
    await quarantine.publishFocus(focused);
    assert.equal(quarantinedClients.length, 2);
    assert.equal(quarantinedClients[1]!.closed, 0);
    const closeError = new Error("synthetic client close");
    quarantinedClients[1]!.closeFailure = closeError;
    assert.throws(
      () => quarantine.dispose(),
      (error) => error === closeError,
    );
    quarantinedClients[1]!.closeFailure = undefined;
    quarantine.dispose();
    assert.equal(quarantinedClients[1]!.closed, 2);

    let resolveCredentials!: (value: { socketPath: string }) => void;
    const raceClients: FakeClient[] = [];
    const options = {
      enabled: true,
      resolveCredentials: function () {
        assert.equal(this, options);
        return new Promise<{ socketPath: string }>((resolve) => {
          resolveCredentials = resolve;
        });
      },
      createClient: (clientOptions: ClientOptions) => {
        const client = new FakeClient(clientOptions);
        raceClients.push(client);
        return client;
      },
      logger,
    };
    const inFlight = createCuaPipSessionService(options);
    const before = inFlight.publishFocus(focused);
    const queued = inFlight.publishLifecycle(opening);
    await drain();
    inFlight.dispose();
    resolveCredentials({ socketPath: "/synthetic/in-flight" });
    await before;
    await queued;
    assert.equal(raceClients[0]!.events[0], focused);
    assert.equal(raceClients[0]!.events.length, 1);
    assert.equal((logs.at(-1)!.args[2] as { skipReason: string }).skipReason, "service-disposed");
    inFlight.dispose();
    assert.equal(raceClients[0]!.closed, 1);

    const expire = createCuaPipSessionService({
      enabled: true,
      resolveCredentials: async () => undefined,
      createClient: makeClient,
      logger,
    });
    await expire.publishLifecycle(start("expires"));
    for (let i = 0; i < 120; i++) {
      mock.timers.tick(250);
      await drain();
    }
    assert.equal(
      logs.at(-1)!.args[1],
      "[cua-pip-session] deferred turn-started expired before transport",
    );
    const logCount = logs.length;
    mock.timers.tick(250);
    await drain();
    assert.equal(logs.length, logCount);
    expire.dispose();

    const loggerFailure = new Error("synthetic logger failure");
    let poisonedCredentials = 0;
    const poisoned = createCuaPipSessionService({
      enabled: true,
      resolveCredentials: async () => {
        poisonedCredentials++;
        throw new Error("synthetic resolver");
      },
      createClient: makeClient,
      logger: {
        ...logger,
        warn: () => {
          throw loggerFailure;
        },
      },
    });
    await assert.rejects(poisoned.publishFocus(focused), (error) => error === loggerFailure);
    await assert.rejects(poisoned.publishFocus(focused), (error) => error === loggerFailure);
    assert.equal(poisonedCredentials, 1);
    poisoned.dispose();
    assert.deepEqual(defaults, []);
  } finally {
    mock.timers.reset();
    hooks.deregister();
  }
});
