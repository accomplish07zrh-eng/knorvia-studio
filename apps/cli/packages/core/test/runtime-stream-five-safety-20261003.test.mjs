import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
const core = new URL("../", import.meta.url),
  read = (p) => fs.readFile(new URL(p, core), "utf8"),
  hash = (t) => createHash("sha256").update(t).digest("hex");
const paths = {
  conversation: "helpers/conversation",
  "streaming-tool-ledger": "helpers/streaming-tool-ledger",
  "streaming-tool-coordinator": "methods/streaming-tool-coordinator",
  "model-streaming-event-queue": "methods/model-streaming-event-queue",
  "streaming-recovery": "methods/streaming-recovery",
};
const oraclePins = {
  conversation: "550d92bc1db3b3836ed36e375be18809f692ce21d37f10126b3f49609b3de2cc",
  "streaming-tool-ledger": "c4e5ed649e0cdd42b0f6aeaaf2db99b46cb2a05deeb1d006e001a6d85454d175",
  "streaming-tool-coordinator": "711e00759a4161659d8f776a8217bb76e3632bf05498a1be8bc7d9fef6ca97c0",
  "model-streaming-event-queue": "ca02ca69ce89bd526fa629f3122165eee642278ae668ec278ffc3d8071a3bfae",
  "streaming-recovery": "f6e6431afc28ba1d1567f0a3b493db2ab181ca247840ff57a1c1cc2e3f01c8b1",
};
const old = {},
  data = (s) => "data:text/javascript;base64," + Buffer.from(s).toString("base64");
async function historical(name) {
  if (old[name]) return old[name];
  const t = await read("test/runtime-" + name + "-baseline-20261003.json");
  assert.equal(hash(t), oraclePins[name]);
  const f = JSON.parse(t).files[name];
  for (const k of ["source", "compiled", "declaration"]) assert.equal(hash(f[k]), f[k + "Sha256"]);
  let js = f.compiled;
  // Bind the selected historical ledger/recovery dependencies, retaining oracle bytes above.
  if (name === "streaming-recovery" || name === "streaming-tool-coordinator") {
    const ledgerURL = await historical("streaming-tool-ledger");
    js = js.replace(/import \{([^}]+)\} from "\.\.\/helpers\/index\.js";/u, (all, names) => {
      const a = names
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean),
        selected = a.filter((n) =>
          [
            "emitStreamingToolLedgerUpdate",
            "createStreamRecoveryAnchorId",
            "createStreamingToolAttemptId",
          ].includes(n),
        ),
        rest = a.filter((n) => !selected.includes(n));
      return (
        (selected.length
          ? "import { " + selected.join(", ") + " } from " + JSON.stringify(ledgerURL) + ";\n"
          : "") +
        (rest.length ? "import { " + rest.join(", ") + ' } from "../helpers/index.js";' : "")
      );
    });
    if (name === "streaming-tool-coordinator")
      js = js.replace(
        'from "./streaming-recovery.js"',
        "from " + JSON.stringify(await historical("streaming-recovery")),
      );
  }
  js = js.replace(
    /from "([^"]+)"/gu,
    (_, p) =>
      "from " +
      JSON.stringify(
        p.startsWith(".")
          ? new URL("dist/runtime/" + paths[name] + ".js", core).href.replace(/[^/]+$/u, "") + p
          : p.startsWith("data:")
            ? p
            : import.meta.resolve(p),
      ),
  );
  old[name] = data(js);
  return old[name];
}
const defer = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
async function observations(o) {
  const trace = { traceId: "owned-trace" },
    facts = {};
  // Ledger mutation is durable only after the append accepts the exact event.
  {
    const gate = defer(),
      events = [],
      input = { owned: "input" },
      startedAt = new Date(42),
      calls = [],
      registryEntry = {
        metadata: {
          readOnly: true,
          concurrentSafe: true,
          destructive: false,
          sideEffectScope: "none",
        },
      },
      runtime = {
        registry: {
          get(n) {
            calls.push(["registry", n]);
            return registryEntry;
          },
        },
        createEvent(type, payload, tr) {
          assert.equal(this, runtime);
          assert.equal(tr, trace);
          calls.push(["create", type, Object.keys(payload)]);
          return { type, payload };
        },
        appendEvent(e, tr) {
          assert.equal(this, runtime);
          assert.equal(tr, trace);
          calls.push(["append", e.type]);
          return gate.promise;
        },
      };
    const result = o["streaming-tool-ledger"].emitStreamingToolLedgerUpdate(
      runtime,
      events,
      trace,
      {
        assistantMessageId: "owned-message",
        toolCall: { id: "owned-call", name: "OwnedTool", input },
        status: "tool_started",
        input,
        startedAt,
      },
    );
    assert.equal(events.length, 0);
    gate.resolve();
    const event = await result;
    assert.equal(events[0], event);
    assert.equal(event.payload.input, input);
    assert.equal(event.payload.startedAt, startedAt);
    assert.equal(event.payload.readOnly, true);
    assert.equal(event.payload.executionTiming, "end_of_stream");
    const error = Error("Owned rejected anchor");
    runtime.appendEvent = async () => {
      throw error;
    };
    await assert.rejects(
      o["streaming-tool-ledger"].emitStreamRecoveryAnchor(runtime, events, trace, {
        assistantMessageId: "owned-message",
        toolCallId: "owned-call",
        toolName: "OwnedTool",
        success: false,
        committedAt: startedAt,
      }),
      (e) => e === error,
    );
    assert.equal(events.length, 1);
    facts.ledger = calls;
  }
  // Streaming fragments retain mutation visibility, write order and terminal failure identity.
  {
    const gate = defer(),
      payload = { text: "before" },
      writes = [],
      events = [],
      params = {
        events,
        traceContext: trace,
        highWaterMark: 1,
        runtime: {
          emitModelStreamingEvent(p, tr, es) {
            assert.equal(this, params.runtime);
            assert.equal(tr, trace);
            assert.equal(es, events);
            writes.push(p.text);
            return writes.length === 1 ? gate.promise : Promise.resolve();
          },
        },
      };
    const queue = o["model-streaming-event-queue"].createModelStreamingEventQueue(params);
    queue.enqueue(payload);
    queue.enqueue({ text: "second" });
    payload.text = "after";
    const pressure = queue.maybeApplyBackpressure();
    assert.equal(writes.length, 0);
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(writes, ["after"]);
    gate.resolve();
    await pressure;
    await queue.drain();
    assert.deepEqual(writes, ["after", "second"]);
    const error = Error("Owned queue write"),
      failedWrites = [],
      bad = o["model-streaming-event-queue"].createModelStreamingEventQueue({
        ...params,
        runtime: {
          emitModelStreamingEvent(p) {
            failedWrites.push(p.text);
            throw error;
          },
        },
      });
    bad.enqueue({ text: "failure" });
    bad.enqueue({ text: "skipped" });
    await assert.rejects(bad.drain(), (e) => e === error);
    assert.deepEqual(failedWrites, ["failure"]);
    assert.throws(
      () => bad.enqueue({ text: "late" }),
      (e) => e === error,
    );
    facts.queue = { writes, failedWrites };
  }
  // The coordinator publishes tracked last-value declarations, never provider-owned tools.
  {
    const registryReads = [],
      listenerCalls = [],
      signal = {
        aborted: false,
        addEventListener(type, fn, opts) {
          listenerCalls.push(["add", type, opts.once]);
          this.fn = fn;
        },
        removeEventListener(type, fn) {
          assert.equal(fn, this.fn);
          listenerCalls.push(["remove", type]);
        },
      },
      events = [],
      created = [],
      state = { turnAbortSignal: signal, events },
      runtime = {
        config: { modelStreaming: "off" },
        registry: {
          get(name) {
            registryReads.push(name);
            return undefined;
          },
        },
        createEvent(type, payload) {
          created.push({ type, payload });
          return { type, payload };
        },
        appendEvent: async () => {},
      },
      coordinator = o["streaming-tool-coordinator"].createStreamingToolCoordinator(runtime, state, {
        assistantMessageId: "owned-message",
        model: {},
        traceContext: trace,
      });
    coordinator.accept({ id: "same", name: "First", input: { v: 1 } });
    const input = { v: 2 };
    coordinator.accept({ id: "same", name: "Last", input });
    coordinator.accept({ id: "ignored", name: "Provider", input: {}, providerExecuted: true });
    coordinator.accept({ id: "empty", name: "", input: {} });
    coordinator.recordTextDelta("owned");
    coordinator.recordReasoningDelta("思");
    assert.deepEqual(registryReads, []);
    await coordinator.abandon("model_failed");
    assert.deepEqual(registryReads, ["Last", ""]);
    assert.equal(events.length, 2);
    assert.deepEqual(
      events.map((e) => e.payload.toolName),
      ["Last", ""],
    );
    assert.equal(events[0].payload.input, undefined);
    assert.equal(events[0].payload.status, "tool_abandoned");
    assert.deepEqual(listenerCalls, [
      ["add", "abort", true],
      ["remove", "abort"],
    ]);
    facts.coordinator = { listenerCalls, payloads: events.map((e) => e.payload) };
  }
  // Recovery creates its full cohort before writes and retains accepted partial publication.
  {
    const events = [],
      pending = { owned: "previous" },
      state = { events, pendingStreamRecoveryRequest: pending },
      calls = [],
      error = Error("Owned second recovery append"),
      toolIds = ["owned-call"],
      options = {
        assistantMessageId: "owned-message",
        traceContext: trace,
        failedRequestId: "owned-request",
      },
      runtime = {
        createEvent(type, payload, tr) {
          assert.equal(tr, trace);
          calls.push(["create", type, Object.keys(payload)]);
          return { type, payload };
        },
        async appendEvent(event, tr) {
          assert.equal(tr, trace);
          calls.push(["append", event.type]);
          if (calls.filter((x) => x[0] === "append").length === 2) throw error;
        },
      };
    await assert.rejects(
      o["streaming-recovery"].emitStreamRecoveryRetryEvents(runtime, state, options, {
        maxRetries: 10,
        retryNumber: 1,
        discardedTextBytes: 5,
        discardedReasoningBytes: 3,
        reason: "latest_committed_tool_result",
        toolCallIds: toolIds,
      }),
      (e) => e === error,
    );
    assert.equal(events.length, 1);
    assert.equal(events[0].payload.committedToolCallIds, toolIds);
    assert.equal(state.pendingStreamRecoveryRequest, pending);
    assert.deepEqual(
      calls.map((x) => x[0]),
      ["create", "create", "create", "append", "append"],
    );
    facts.recovery = calls;
  }
  return facts;
}
async function correctedBoundaries(o) {
  const out = {};
  {
    const m = o["conversation"],
      context = { tabCount: 1 },
      meta = {
        storageKind: "inline",
        recoverability: "provider_ready",
        preview: { text: "owned-file" },
      },
      attachment = {
        contentBlock: { type: "text", text: "owned-file" },
        mime: "text/plain",
        filename: "owned.txt",
        source: { text: { value: "owned.txt" } },
        get metadata() {
          context.tabCount = 2;
          return meta;
        },
      };
    const e = m.buildRuntimeUserEntriesFromTurn("owned request", [attachment], {
      browserAmbientContext: context,
    });
    out.browserTwoTabs = e[0].message.content.includes("2 tabs");
  }
  {
    const m = o["streaming-tool-ledger"];
    let reads = 0;
    const metadata = {
        get readOnly() {
          reads++;
          return true;
        },
        sideEffectScope: "none",
      },
      runtime = {
        registry: {
          get() {
            return { metadata };
          },
        },
        createEvent(type, payload) {
          return { type, payload };
        },
        appendEvent: async () => {},
      };
    await m.emitStreamingToolLedgerUpdate(
      runtime,
      [],
      {},
      {
        assistantMessageId: "owned-message",
        toolCall: { id: "owned-call", name: "OwnedTool", input: {} },
        status: "tool_queued",
      },
    );
    out.readOnlyReads = reads;
  }
  {
    const m = o["streaming-recovery"],
      options = { assistantMessageId: "owned-0", traceContext: {} },
      events = [],
      runtime = {
        createEvent(type, payload) {
          const event = { type, payload };
          options.assistantMessageId = "owned-" + (events.length + 1);
          events.push(event);
          return event;
        },
        appendEvent: async () => {},
      },
      state = { events: [] };
    await m.emitStreamRecoveryRetryEvents(runtime, state, options, {
      toolCallIds: [],
      reason: "no_tool_committed",
      retryNumber: 1,
      maxRetries: 10,
      discardedTextBytes: 1,
      discardedReasoningBytes: 0,
    });
    out.attempts = [
      ...events.map((e) => e.payload.attemptId),
      state.pendingStreamRecoveryRequest.attemptId,
    ];
  }
  out.undefinedCauseOwn = Object.hasOwn(
    o["streaming-recovery"].createStartPlanBusyAutoRetryExhaustedError("owned non-error"),
    "cause",
  );
  return out;
}
const historicalModules = {};
for (const name of Object.keys(paths))
  historicalModules[name] = await import(await historical(name));
const baseline = await observations(historicalModules);
if (process.argv.includes("--baseline"))
  console.log(
    JSON.stringify({
      mode: "immutable historical actual compiler emitted",
      syntheticWriteLifecycleGroups: 4,
      observations: baseline,
      limits:
        "Synthetic ports only; no ordinary suites/builds/native; unchanged transitive deps via tsx.",
    }),
  );
else {
  const t = await read("test/runtime-stream-five-current-20261003.json");
  assert.equal(hash(t), "4d88af5282a218999245472016f43adefe77a6dab1d940825485e2b520a7606a");
  const pins = JSON.parse(t).files;
  const verify = async (reader) => {
    for (const [p, h] of Object.entries(pins)) assert.equal(hash(await reader(p)), h, p);
  };
  await verify(read);
  await assert.rejects(
    verify(async (p) =>
      p === "dist/runtime/helpers/streaming-tool-ledger.js" ? "wrong" : read(p),
    ),
  );
  await assert.rejects(
    verify(async (p) => {
      if (p === "dist/runtime/methods/streaming-recovery.d.ts") throw Error("missing");
      return read(p);
    }),
  );
  const current = {};
  for (const [n, p] of Object.entries(paths))
    current[n] = await import(new URL("dist/runtime/" + p + ".js", core));
  const actual = await observations(current);
  assert.deepEqual(actual, baseline);
  const corrected = await correctedBoundaries(current),
    oldBoundaries = await correctedBoundaries(historicalModules);
  assert.deepEqual(corrected, oldBoundaries);
  console.log(
    JSON.stringify({
      mode: "strict current actual compiler emitted",
      syntheticWriteLifecycleGroups: 4,
      observations: actual,
      originalRedBoundaries: 3,
      appendedErrorOwnFieldObservation: 1,
      correctedBoundaries: corrected,
      limits:
        "Synthetic write/lifecycle only; conversation only concrete red observation, not general behavior replay;ordinary suites/builds/native deferred. Transitive deps via tsx,not all-emitted.",
    }),
  );
}
