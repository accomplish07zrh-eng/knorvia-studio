import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const core = new URL("../", import.meta.url),
  hash = (x) => createHash("sha256").update(x).digest("hex"),
  read = (p) => readFile(new URL(p, core), "utf8");
const b = await read("test/runtime-session-fork-baseline-20261003.json"),
  p = await read("test/runtime-session-fork-current-20261003.json");
assert.equal(hash(b), "e376ca25b02ffe7b4fb5d2f407194fed2839fdf87d62798ad1009a527bde6cd2");
assert.equal(hash(p), "bf3c3085ba6eba0f6688436670065544b8c3c63121fc8be28dfa4e14598683b9");
const baseline = JSON.parse(b),
  pins = JSON.parse(p);
async function select(reader = read) {
  for (const [p, h] of Object.entries(pins.files)) assert.equal(hash(await reader(p)), h, p);
}
await select();
await assert.rejects(
  select(async (p) => (p.endsWith("session-fork-atomic.js") ? "wrong" : read(p))),
);
await assert.rejects(
  select(async (p) => {
    if (p.endsWith("session-fork-identities.js")) throw Error("Owned missing");
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
  f = baseline.files["session-fork"];
for (const k of ["source", "compiled", "declaration"]) assert.equal(hash(f[k]), f[k + "Sha256"]);
const old = await import(data(bind(f.compiled))),
  now = await import(new URL("dist/runtime/methods/session-fork.js", core));
async function observe(owner) {
  const trace = { traceId: "owned-trace" },
    permission = [],
    path = { root: "owned-root" },
    parent = {
      id: "parent",
      projectID: "project",
      workspaceID: "workspace",
      slug: "owned",
      directory: "owned",
      path,
      title: "Owned",
      version: "owned",
      permission,
    },
    selection = { providerId: "provider", modelId: "model" },
    initialInput = { id: "owned-input", kind: "prompt", text: "Owned" },
    commandFact = { parentSessionId: "parent", sourceCommandId: "owned-command" },
    history = [
      {
        info: {
          id: "u",
          sessionID: "parent",
          role: "user",
          time: { created: 1 },
          agent: "agent",
          modelSelection: selection,
        },
        parts: [
          {
            id: "pu",
            sessionID: "parent",
            messageID: "u",
            type: "text",
            text: "Owned user",
            time: { start: 1, end: 1 },
          },
        ],
      },
      {
        info: {
          id: "a",
          sessionID: "parent",
          role: "assistant",
          parentID: "u",
          time: { created: 2, completed: 3 },
          modelId: "model",
          providerId: "provider",
          agent: "agent",
          path: { cwd: "owned", root: "owned-root" },
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          cost: 0,
          mode: "default",
          planEnabled: false,
          anchor: {
            turnId: "turn",
            productTurnId: "u",
            orderedMessageIds: ["u", "a"],
            boundaryMessageId: "a",
          },
        },
        parts: [
          {
            id: "pa",
            sessionID: "parent",
            messageID: "a",
            type: "text",
            text: "Owned assistant",
            time: { start: 2, end: 3 },
          },
        ],
      },
      { info: { id: "next", sessionID: "parent", role: "user", time: { created: 4 } }, parts: [] },
    ],
    snapshot = structuredClone(history),
    calls = [],
    bundles = [],
    failure = Error("Owned parent publication failure");
  const store = {
      async getSession(id) {
        assert.equal(this, store);
        assert.equal(id, "parent");
        calls.push("parent");
        return parent;
      },
      async messages(x) {
        assert.equal(this, store);
        assert.deepEqual(x, { sessionID: "parent" });
        calls.push("messages");
        return history;
      },
      async commitForkBundle(bundle) {
        assert.equal(this, store);
        calls.push("commit");
        bundles.push(bundle);
        return { id: "persisted-child" };
      },
    },
    runtime = {
      sessionId: "parent",
      sessionStore: store,
      rootTraceContext: trace,
      config: { agentName: "agent", mode: "default", planEnabled: false },
      workingDirectory: "owned",
      workspaceRoot: "owned-root",
      getSessionModelSelection() {
        return selection;
      },
      createEvent(type, payload, t) {
        assert.equal(t, trace);
        calls.push("event");
        return { type, payload };
      },
      async appendEvent(e, t) {
        assert.equal(t, trace);
        assert.equal(e.payload.forkedSessionId, "persisted-child");
        calls.push("append");
        throw failure;
      },
      logger: {
        warn(label, fields) {
          assert.equal(fields.error, failure.message);
          calls.push("warn");
        },
      },
    };
  const clock = Date.now;
  Date.now = () => 101;
  let result;
  try {
    result = await owner.forkConversationBeforeMessage.call(runtime, {
      forkedSessionId: "child",
      goalBoundary: { kind: "none" },
      initialInput,
      commandFact,
      sourceCommandId: "owned-command",
      targetMessageId: "next",
      traceContext: trace,
    });
  } finally {
    Date.now = clock;
  }
  assert.deepEqual(calls, ["parent", "messages", "commit", "event", "append", "warn"]);
  assert.equal(bundles.length, 1);
  const bundle = bundles[0];
  assert.equal(bundle.child.permission, permission);
  assert.equal(bundle.child.path, path);
  assert.equal(bundle.initialInput, initialInput);
  assert.equal(bundle.commandFact, commandFact);
  assert.equal(bundle.goal, undefined);
  assert.equal(bundle.child.id, "child");
  assert.equal(bundle.messages.length, 4);
  assert.equal(bundle.entries.length, 2);
  assert.deepEqual(history, snapshot);
  const childIdOf = (id) =>
      Object.entries(bundle.copySources.messages).find(([, source]) => source === id)?.[0],
    userId = childIdOf("u"),
    assistantId = childIdOf("a");
  assert.ok(userId && assistantId);
  assert.notEqual(userId, "u");
  assert.notEqual(assistantId, "a");
  assert.equal(bundle.messages[0].info.id, userId);
  assert.equal(bundle.messages[1].info.id, assistantId);
  assert.equal(bundle.messages[1].info.parentID, userId);
  assert.deepEqual(bundle.messages[1].info.anchor.orderedMessageIds, [userId, assistantId]);
  assert.equal(bundle.messages[1].info.anchor.productTurnId, userId);
  assert.equal(bundle.messages[1].info.anchor.boundaryMessageId, assistantId);
  for (const m of bundle.messages) {
    assert.equal(m.info.sessionID, "child");
    for (const part of m.parts) {
      assert.equal(part.sessionID, "child");
      assert.equal(part.messageID, m.info.id);
    }
  }
  assert.equal(bundle.messages[2].info.anchor, bundle.messages[3].info.anchor);
  assert.equal(
    bundle.messages[2].info.metadata.forkOrigin,
    bundle.messages[3].info.metadata.forkOrigin,
  );
  assert.equal(result.forkedSessionId, "persisted-child");
  assert.equal(result.copiedMessageCount, 2);
  return {
    calls,
    result,
    child: bundle.child,
    entries: bundle.entries,
    copySourceMessages: Object.values(bundle.copySources.messages),
    copySourceParts: Object.values(bundle.copySources.parts),
    noticeText: bundle.messages[2].parts[0].text,
  };
}
assert.deepEqual(await observe(now), await observe(old));
console.log(
  JSON.stringify({
    actualEmittedPersistenceCheck: "pass",
    pairedGroups: 1,
    scope:
      "One atomic before-input bundle, child-local message/part/anchor refs, shared inputs, post-commit parent error preservation. Not all fork branches; dependencies via tsx.",
  }),
);
