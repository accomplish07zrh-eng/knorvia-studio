import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const core = new URL("../", import.meta.url),
  hash = (x) => createHash("sha256").update(x).digest("hex");
const read = (p) => readFile(new URL(p, core), "utf8");
const baselineText = await read("test/runtime-turn-persistence-baseline-20261003.json");
const pinsText = await read("test/runtime-turn-persistence-current-20261003.json");
assert.equal(
  hash(baselineText),
  "86d8388577c088944fa1f0658fc9c418bf3cc35f35d7fe858d92d786f726a8c6",
);
assert.equal(hash(pinsText), "b0909c35ca30410afbc0d27712ce6736f1bb1480ef7dd32cdfabd0fed7370efb");
const baseline = JSON.parse(baselineText),
  pins = JSON.parse(pinsText);
async function select(reader = read) {
  for (const [p, h] of Object.entries(pins.files)) assert.equal(hash(await reader(p)), h, p);
}
await select();
await assert.rejects(
  select(async (p) => (p.endsWith("timeline-persistence.js") ? "wrong" : read(p))),
);
await assert.rejects(
  select(async (p) => {
    if (p.endsWith("timeline-persistence.js")) throw Error("Owned missing");
    return read(p);
  }),
);
const data = (s) => "data:text/javascript;base64," + Buffer.from(s).toString("base64");
const bind = (s) =>
  s.replace(
    /from "([^"]+)"/gu,
    (_, p) =>
      `from ${JSON.stringify(p.startsWith(".") ? new URL("dist/runtime/methods/" + p, core).href : import.meta.resolve(p))}`,
  );
const now = {},
  old = {};
for (const [n, b] of Object.entries(baseline.files)) {
  for (const k of ["source", "compiled", "declaration"]) assert.equal(hash(b[k]), b[k + "Sha256"]);
  old[n] = await import(data(bind(b.compiled)));
  now[n] = await import(new URL("dist/runtime/methods/" + n + ".js", core));
}
async function observe(owners) {
  const writes = [],
    trace = { traceId: "owned-trace" },
    clock = Date.now;
  Date.now = () => 101;
  try {
    const runtime = {
      sessionId: "owned",
      sessionStore: {},
      latestConversationMessageId: "parent",
      config: {},
      workingDirectory: "owned",
      workspaceRoot: "owned-root",
      getSessionModelSelection: () => ({ modelId: "m", providerId: "p" }),
      getPlanEnabled: () => false,
      async persistMessage(m, t) {
        assert.equal(this, runtime);
        assert.equal(t, trace);
        writes.push(["message", m]);
      },
      async persistPart(p, t) {
        assert.equal(this, runtime);
        assert.equal(t, trace);
        writes.push(["part", p]);
      },
    };
    const timeline = {
      timelineType: "model_change",
      display: "separator",
      status: "completed",
      time: { start: 4, end: 5 },
    };
    await owners["timeline-persistence"].persistAssistantTimelinePartForSession.call(runtime, {
      sessionId: "child",
      messageID: "msg",
      partID: "part",
      timeline,
      traceContext: trace,
    });
    assert.equal(writes[0][0], "message");
    assert.equal(writes[1][0], "part");
    assert.equal(writes[1][1].time, timeline.time);
    const input = { parsed: true },
      raw = { raw: true };
    await owners["tool-part-persistence"].persistPendingToolPart(runtime, {
      assistantMessageId: "msg",
      partID: "tool",
      declarationIndex: 2,
      input,
      toolCall: { id: "call", name: " ", input: raw },
      traceContext: trace,
      metadata: { providerToolName: "override" },
      model: {},
    });
    assert.equal(writes[2][1].state.input, input);
    assert.equal(writes[2][1].metadata.providerToolName, "override");
    assert.equal(writes[2][1].state.raw, '{"tool":"empty_tool_name","input":{"raw":true}}');
    const refs = [];
    const intent = owners["input-intent-persistence"].buildPersistedConversationInputIntent(
      "display",
      {
        kind: "goal",
        text: "canonical",
        attachmentRefs: refs,
        admittedDelivery: "guide",
        planEnabled: false,
        queuePosition: 0,
      },
      "drained",
    );
    assert.equal(intent.attachments, refs);
    assert.equal(intent.planEnabled, false);
    assert.equal(intent.order.queuePosition, 0);
    assert.equal(intent.text, "canonical");
    const failure = Error("Owned part failure");
    let called = 0;
    const stopping = {
      sessionId: "owned",
      async persistPart() {
        called++;
        throw failure;
      },
    };
    await assert.rejects(
      owners["cancelled-stream-persistence"].persistCancelledStreamSnapshot(stopping, {
        assistantCreatedAt: 1,
        assistantMessageId: "msg",
        snapshot: { reasoning: [{ text: "Owned reasoning" }], text: "Owned text" },
        traceContext: trace,
      }),
      (e) => e === failure,
    );
    assert.equal(called, 1);
    const checkpoint = {
      id: "event",
      sessionId: "owned",
      timestamp: new Date(7),
      sequenceNumber: 2,
      traceId: "owned-trace",
      turnId: "turn",
      payload: {
        checkpointId: "checkpoint",
        messageId: "msg",
        scope: "workspace",
        snapshotRef: "owned-artifact",
      },
    };
    const entries = [];
    const port = {
      async saveSessionEntry(e) {
        assert.equal(this, port);
        entries.push(e);
      },
    };
    await owners["workspace-checkpoint-persistence"].persistWorkspaceCheckpointEntry(
      { sessionStore: port },
      checkpoint,
      trace,
    );
    assert.equal(entries.length, 1);
    assert.equal(entries[0].data.eventId, "event");
    assert.deepEqual(entries[0].time, { created: 7, updated: 7 });
    return { writes, intent, entries };
  } finally {
    Date.now = clock;
  }
}
assert.deepEqual(await observe(now), await observe(old));
console.log(
  JSON.stringify({
    actualEmittedPersistenceCheck: "pass",
    pairedGroups: 1,
    limits:
      "Owned synthetic records/ports; no restore or ordinary suite; transitive workspace dependencies via tsx",
  }),
);
