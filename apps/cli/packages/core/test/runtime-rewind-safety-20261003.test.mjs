import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const core = new URL("../", import.meta.url),
  hash = (x) => createHash("sha256").update(x).digest("hex"),
  read = (p) => readFile(new URL(p, core), "utf8");
const b = await read("test/runtime-rewind-baseline-20261003.json"),
  p = await read("test/runtime-rewind-current-20261003.json");
assert.equal(hash(b), "8d54ecf8a80a2189538143ea4e1c1814010937154f08321848f519a6f6b14c2e");
assert.equal(hash(p), "642f35a8ec22888b7a4b550e9bba57898866297782295ab2083d86abf36f978a");
const baseline = JSON.parse(b),
  pins = JSON.parse(p);
async function select(reader = read) {
  for (const [p, h] of Object.entries(pins.files)) assert.equal(hash(await reader(p)), h, p);
}
await select();
await assert.rejects(select(async (p) => (p.endsWith("rewind.js") ? "wrong" : read(p))));
await assert.rejects(
  select(async (p) => {
    if (p.endsWith("rewind.js")) throw Error("Owned missing");
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
  candidate = {};
for (const [n, f] of Object.entries(baseline.files)) {
  for (const k of ["source", "compiled", "declaration"]) assert.equal(hash(f[k]), f[k + "Sha256"]);
  old[n] = await import(data(bind(f.compiled)));
  candidate[n] = await import(new URL("dist/runtime/methods/" + n + ".js", core));
}
async function trace(o) {
  const trace = { traceId: "owned" },
    seen = [],
    runtime = {
      createEvent(type, payload, t) {
        assert.equal(t, trace);
        return { type, payload };
      },
      async appendEvent(e, t) {
        seen.push({ sameTrace: t === trace });
      },
    };
  await o.rewind.finishUnavailableRewind.call(runtime, {
    events: [],
    reason: "no_checkpoint_available",
    rewindId: "owned",
    traceContext: trace,
  });
  return seen;
}
async function timing(o) {
  const order = [],
    r = { sessionStore: undefined };
  o["rewind-message"].rewindConversationToMessage
    .call(r, { events: [], targetMessageId: "owned", traceContext: { traceId: "owned" } })
    .then(() => order.push("done"));
  await Promise.resolve();
  for (let i = 0; i < 5; i++) {
    order.push("tick" + i);
    await Promise.resolve();
  }
  return order;
}
const expected = { trace: await trace(old), timing: await timing(old) },
  actual = { trace: await trace(candidate), timing: await timing(candidate) };
console.log(JSON.stringify({ mode: "final-actual-emitted", expected, actual }, null, 2));
assert.deepEqual(actual, expected);
