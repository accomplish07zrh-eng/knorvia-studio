import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
const core = new URL("../", import.meta.url),
  hash = (x) => createHash("sha256").update(x).digest("hex"),
  read = (p) => fs.readFile(new URL(p, core), "utf8"),
  names = ["message-persistence", "events", "workspace-checkpoints"],
  baselineDigests = {
    "message-persistence": "db585469e706edef96bd27be70973b893463735c14f60a5b7137bb649aae48a7",
    events: "4b15968d50e872fdc5b60d0d8a7d02cfd8f59eed106d6e6dffa9c773961b9d82",
    "workspace-checkpoints": "955bf4c5064e06b6cb23f9b54760ea947025e301e64d8e537426d674697306d2",
  };
const pinsText = await read("test/runtime-publication-current-20261003.json");
assert.equal(hash(pinsText), "e6a6c58e52e020582da1948531d98ef68a361d7c33711ee9b37ea5f8aa7dafa0");
const pins = JSON.parse(pinsText);
async function select(reader = read) {
  for (const [p, h] of Object.entries(pins.files)) assert.equal(hash(await reader(p)), h, p);
}
await select();
await assert.rejects(select(async (p) => (p.endsWith("events-durable.js") ? "wrong" : read(p))));
await assert.rejects(
  select(async (p) => {
    if (p.endsWith("events-summary.js")) throw Error("Owned missing");
    return read(p);
  }),
);
const data = (s) => "data:text/javascript;base64," + Buffer.from(s).toString("base64"),
  bind = (s) =>
    s.replace(
      /from "([^"]+)"/gu,
      (_, p) =>
        `from ${JSON.stringify(p.startsWith(".") ? new URL("dist/runtime/methods/" + p, core).href : import.meta.resolve(p))}`,
    ),
  old = {},
  now = {};
for (const n of names) {
  const text = await read("test/runtime-" + n + "-baseline-20261003.json");
  assert.equal(hash(text), baselineDigests[n]);
  const f = JSON.parse(text).files[n];
  for (const k of ["source", "compiled", "declaration"]) assert.equal(hash(f[k]), f[k + "Sha256"]);
  old[n] = await import(data(bind(f.compiled)));
  now[n] = await import(new URL("dist/runtime/methods/" + n + ".js", core));
}
async function observe(o) {
  const trace = { traceId: "owned-trace" },
    calls = [],
    input = { canonical: true },
    signal = new AbortController().signal,
    clock = Date.now;
  Date.now = () => 11;
  try {
    const port = {
        async promoteSessionInput(x) {
          assert.equal(this, port);
          calls.push("promote");
          assert.equal(x.parts.length, 1);
          assert.equal(x.message.metadata.inputIntent, intent);
        },
        async saveMessage() {
          calls.push("unexpected-message");
        },
        async savePart() {
          calls.push("unexpected-part");
        },
      },
      intent = { kind: "sendText", text: "Owned", sourceCommandId: "command" };
    const runtime = {
      sessionStore: port,
      sessionId: "owned",
      config: {},
      getTools: () => [],
      getSessionModelSelection: () => undefined,
      createEvent(type, payload, t) {
        assert.equal(t, trace);
        return { type, payload };
      },
      async appendEvent(event, t) {
        assert.equal(t, trace);
        calls.push("promoted-event");
        assert.equal(event.payload.sourceCommandId, "command");
      },
      async persistMessage() {
        calls.push("unexpected-message");
      },
      async persistPart() {
        calls.push("unexpected-part");
      },
    };
    await o["message-persistence"].persistUserPrompt.call(
      runtime,
      "owned-message",
      "Owned",
      undefined,
      trace,
      { sessionInputId: "owned-input", intent },
    );
    assert.deepEqual(calls, ["promote", "promoted-event"]);
    const saved = {
        id: "stored",
        sessionId: "owned",
        type: "turn.steerQueued",
        timestamp: new Date(12),
        sequenceNumber: 4,
        payload: { pendingInputId: "owned-input", input: "Owned" },
      },
      ledgerFailure = Error("Owned ledger failure"),
      events = [];
    // Enum values are supplied by the unchanged contract dependency, not guessed.
    const deps = await import(new URL("dist/runtime/deps.js", core));
    saved.type = deps.SessionEventType.TurnSteerQueued;
    const eventRuntime = {
      sessionId: "owned",
      eventStore: {
        async append(e) {
          events.push("store");
          return saved;
        },
      },
      sessionStore: {
        async saveSessionInput(x) {
          assert.equal(x.id, "owned-input");
          events.push("ledger");
          throw ledgerFailure;
        },
      },
      logger: {
        debug() {},
        warn(label, fields) {
          assert.equal(fields.errorMessage, ledgerFailure.message);
          events.push("warn");
        },
      },
      async notifyEventSinks(e, t) {
        assert.equal(e, saved);
        assert.equal(t, trace);
        events.push("sink");
      },
    };
    await o.events.appendEvent.call(eventRuntime, { type: "owned", payload: input }, trace);
    assert.deepEqual(events, ["store", "ledger", "warn", "sink"]);
    const copyCalls = [],
      copyFailure = Error("Owned part failure"),
      message = {
        info: { id: "parent", sessionID: "owned", role: "user", time: { created: 1 } },
        parts: [
          { id: "part", sessionID: "owned", messageID: "parent", type: "text", text: "Owned" },
        ],
      },
      copyRuntime = {
        sessionStore: {},
        async persistMessage(m, t, source) {
          assert.equal(t, trace);
          assert.deepEqual(source, { sessionID: "owned", id: "parent" });
          assert.notEqual(m.id, "parent");
          copyCalls.push("message");
        },
        async persistPart(p, t, source) {
          assert.equal(t, trace);
          assert.deepEqual(source, { sessionID: "owned", id: "part" });
          copyCalls.push("part");
          throw copyFailure;
        },
      };
    await assert.rejects(
      o["workspace-checkpoints"].copySessionMessagesForFork.call(copyRuntime, {
        forkedSessionId: "child",
        messages: [message, message],
        traceContext: trace,
      }),
      (e) => e === copyFailure,
    );
    assert.deepEqual(copyCalls, ["message", "part"]);
    return { calls, events, copyCalls };
  } finally {
    Date.now = clock;
  }
}
async function regressionFacts(o) {
  const intent = { kind: "sendText", text: "Owned", clientId: "before" },
    trace = { traceId: "caller" },
    captured = [],
    runtime = {
      sessionStore: {
        async promoteSessionInput(bundle) {
          captured.push(bundle.message.metadata.inputClientId);
        },
      },
      sessionId: "owned",
      config: {},
      getTools: () => [],
      getSessionModelSelection() {
        intent.clientId = "after-selection";
        return undefined;
      },
      createEvent(type, payload) {
        return { type, payload };
      },
      async appendEvent() {},
    };
  await o["message-persistence"].persistUserPrompt.call(runtime, "msg", "Owned", undefined, trace, {
    sessionInputId: "input",
    intent,
  });
  const deps = await import(new URL("dist/runtime/deps.js", core)),
    stored = {
      id: "stored",
      sessionId: "owned",
      type: deps.SessionEventType.UserInputAutoResolutionUpdated,
      payload: {
        interactionId: "owned",
        toolCallId: "owned-tool",
        autoResolution: { startedAt: 1 },
      },
      timestamp: new Date(2),
      sequenceNumber: 7,
      traceId: "stored-trace",
      turnId: "stored-turn",
    },
    entries = [];
  await o.events.appendEvent.call(
    {
      eventStore: {
        async append() {
          return stored;
        },
      },
      sessionStore: {
        async saveSessionEntry(e) {
          entries.push(e);
        },
      },
      async notifyEventSinks(e) {
        assert.equal(e, stored);
      },
    },
    stored,
    trace,
  );
  return {
    clientId: captured[0],
    traceId: entries[0].data.traceId,
    turnId: entries[0].data.turnId,
  };
}
assert.deepEqual(await observe(now), await observe(old));
assert.deepEqual(await regressionFacts(now), await regressionFacts(old));
console.log(
  JSON.stringify({
    mode: "strict current actual compiler emitted",
    pairedPersistenceGroups: 3,
    appendedRegressionObservations: 2,
    limits:
      "Synthetic writes only; current owners/private helpers exact pinned. Transitive workspace dependencies via tsx. Other branches statically reviewed, ordinary suites/build/native unrun.",
  }),
);
