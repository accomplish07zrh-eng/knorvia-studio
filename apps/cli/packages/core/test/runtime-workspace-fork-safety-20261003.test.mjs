import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const core = new URL("../", import.meta.url),
  hash = (x) => createHash("sha256").update(x).digest("hex"),
  read = (p) => readFile(new URL(p, core), "utf8");
const b = await read("test/runtime-workspace-fork-baseline-20261003.json"),
  p = await read("test/runtime-workspace-fork-current-20261003.json");
assert.equal(hash(b), "f8ff7a397664f6e1a28b47bf02523cf4d6be4c2c005be7c18fb6ea8fe5cef933");
assert.equal(hash(p), "40eec30a3fc822cb36e8cf40a8981b696e08863807b7cc1313d911afc16c649c");
const baseline = JSON.parse(b),
  pins = JSON.parse(p);
async function select(reader = read) {
  for (const [p, h] of Object.entries(pins.files)) assert.equal(hash(await reader(p)), h, p);
}
await select();
await assert.rejects(select(async (p) => (p.endsWith("workspace-fork.js") ? "wrong" : read(p))));
await assert.rejects(
  select(async (p) => {
    if (p.endsWith("workspace-fork.js")) throw Error("Owned missing");
    return read(p);
  }),
);
const old = {},
  now = {},
  data = (s) => "data:text/javascript;base64," + Buffer.from(s).toString("base64"),
  bind = (s) =>
    s.replace(
      /from "([^"]+)"/gu,
      (_, p) =>
        `from ${JSON.stringify(p.startsWith(".") ? new URL("dist/runtime/methods/" + p, core).href : import.meta.resolve(p))}`,
    );
for (const [n, f] of Object.entries(baseline.files)) {
  for (const k of ["source", "compiled", "declaration"]) assert.equal(hash(f[k]), f[k + "Sha256"]);
  old[n] = await import(data(bind(f.compiled)));
  now[n] = await import(new URL("dist/runtime/methods/" + n + ".js", core));
}
async function observe(o) {
  const trace = { traceId: "owned-trace" },
    signal = new AbortController().signal,
    calls = [],
    failure = Error("Owned write failure");
  const port = {
    async removeFile(x, y) {
      assert.equal(this, port);
      assert.equal(x.trace, trace);
      assert.equal(y.signal, signal);
      calls.push(["remove", x.path]);
    },
    async writeTextFile(x, y) {
      assert.equal(this, port);
      assert.equal(x.trace, trace);
      assert.equal(y.signal, signal);
      assert.equal(x.atomic, true);
      assert.equal(x.createParents, true);
      calls.push(["write", x.path]);
      if (x.path === "owned-fail") throw failure;
      return { bytesWritten: 3 };
    },
  };
  await assert.rejects(
    o["workspace-fork"].restoreWorkspaceCheckpointFiles(
      { fileSystemPort: port },
      [
        { path: "owned-delete", existedBefore: false, beforeContent: null },
        { path: "owned-fail", existedBefore: true, beforeContent: "Owned" },
        { path: "never", existedBefore: true, beforeContent: "Never" },
      ],
      trace,
      signal,
    ),
    (e) => e === failure,
  );
  assert.deepEqual(calls, [
    ["remove", "owned-delete"],
    ["write", "owned-fail"],
  ]);
  const messages = [
      { info: { id: "start", role: "user" } },
      { info: { id: "end", role: "assistant", time: { completed: 9 }, anchor: { turnId: "old" } } },
    ],
    target = {
      targetID: "goal",
      activeInputId: "old",
      activeRunStartedAtMs: 1,
      activeRunLastSeenAtMs: 2,
      time: { created: 3 },
    },
    saved = [];
  const store = {
    async messages() {
      assert.equal(this, store);
      return messages;
    },
    async readTarget() {
      assert.equal(this, store);
      return target;
    },
    async sessionEntries() {
      assert.equal(this, store);
      return [
        {
          id: "inside",
          data: { payload: { targetId: "goal", anchorAssistantMessageId: "start" } },
        },
        {
          id: "outside",
          data: { payload: { targetId: "goal", anchorAssistantMessageId: "later" } },
        },
      ];
    },
    async saveMessage(m) {
      assert.equal(this, store);
      saved.push(m);
    },
  };
  await o["stable-fork-boundary"].persistStableForkCompletionBoundary(
    { sessionId: "owned", sessionStore: store },
    {
      boundaryMessageId: "end",
      startMessageId: "start",
      historyRoundCount: 2,
      traceContext: trace,
    },
  );
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].anchor.orderedMessageIds, ["start", "end"]);
  assert.deepEqual(saved[0].anchor.goalBoundary.verificationEntryIds, ["inside"]);
  assert.equal(saved[0].anchor.goalBoundary.target.activeInputId, null);
  assert.notEqual(saved[0].anchor.goalBoundary.target.time, target.time);
  assert.equal(target.activeInputId, "old");
  return { calls, saved };
}
assert.deepEqual(await observe(now), await observe(old));
console.log(
  JSON.stringify({
    actualEmittedPersistenceCheck: "pass",
    pairedGroups: 1,
    limits:
      "Synthetic restoration partial-write stop and stable anchor; not full workspace fork. Transitive dependencies through tsx.",
  }),
);
