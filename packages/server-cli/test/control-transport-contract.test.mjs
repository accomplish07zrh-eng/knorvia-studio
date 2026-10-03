import assert from "node:assert/strict";
import test from "node:test";
import { deferred, flush, loadOwner, ports, socket } from "./control-transport-fixture.mjs";

// Authored for the integration checkpoint. These scenarios have not been run by
// the native lane; fake-port results cannot certify schemas or OS transports.
test("JSONL keeps byte limits, mutable options, native JSON failures and consumed suffixes", async () => {
  const { JsonLineDecoder, encodeJsonLine } = await loadOwner("framing");
  assert.equal(encodeJsonLine(undefined), "undefined\n");
  const cycle = {};
  cycle.self = cycle;
  assert.throws(() => encodeJsonLine(cycle), TypeError);

  const options = { maxFrameBytes: 64 };
  const decoder = new JsonLineDecoder(options);
  assert.deepEqual(decoder.push(' \r\nnull\n{"a":'), [null]);
  assert.throws(() => decoder.finish(), /Incomplete JSONL frame/);
  options.maxFrameBytes = 12;
  assert.deepEqual(decoder.push('"é"}\nfalse\n  '), [{ a: "é" }, false]);
  decoder.finish();

  const fourBytes = new JsonLineDecoder({ maxFrameBytes: 4 });
  assert.deepEqual(fourBytes.push(' "é" \n'), ["é"]);
  assert.throws(() => fourBytes.push('"漢"\n'), /maximum size/);
  assert.deepEqual(fourBytes.push("1\nabcde"), [1]);
  assert.throws(() => fourBytes.push(""), /maximum size/);
  assert.throws(() => fourBytes.push("\n"), /maximum size/);
  fourBytes.finish();

  const broken = new JsonLineDecoder();
  assert.throws(
    () => broken.push('1\nbroken\n{"n":'),
    (error) => {
      assert.equal(error.message, "Invalid JSONL frame");
      assert.ok(error.cause instanceof SyntaxError);
      return true;
    },
  );
  assert.deepEqual(broken.push("2}\n"), [{ n: 2 }]);

  const binary = new JsonLineDecoder();
  assert.deepEqual(binary.push(new Uint8Array([0x22, 0xc3])), []);
  assert.deepEqual(binary.push(new Uint8Array([0xa9, 0x22, 0x0a])), ["��"]);
});

test("server sessions isolate partial frames and admit concurrent calls through the existing schema", async () => {
  const state = ports();
  const { createControlServer } = await loadOwner("controlServer", state);
  const waiting = new Map();
  const admitted = [];
  const endpoint = "/fixture/control.sock";
  const control = await createControlServer(endpoint, function (request) {
    assert.equal(this, undefined);
    admitted.push(request);
    const reply = deferred();
    waiting.set(request.id, reply);
    return reply.promise;
  });
  assert.equal(control.server, state.server);
  assert.deepEqual(state.journal.slice(0, 4), [
    ["rm", endpoint, { force: true }],
    ["mkdir", "/fixture", { recursive: true }],
    ["listen", endpoint],
    ["chmod", endpoint, 0o600],
  ]);
  const first = socket();
  const second = socket();
  state.server.accept(first);
  state.server.accept(second);
  first.emit("data", '{"id":"a","command":"status"');
  second.emit("data", '{"id":"b","command":"ping"}\n');
  first.emit("data", '}\n{"id":"c","command":"status"}\n{"id":"bad","command":"invalid"}\n');
  assert.deepEqual(
    admitted.map((value) => value.id),
    ["b", "a", "c"],
  );
  assert.deepEqual(JSON.parse(first.writes[0]), {
    id: "fixture-generated-id",
    ok: false,
    error: { code: "invalid-request", message: "Invalid control request" },
  });
  waiting.get("c").resolve({ ordinal: 3 });
  await flush();
  waiting.get("a").resolve({ ordinal: 1 });
  await flush();
  assert.deepEqual(
    first.writes.slice(1).map((line) => JSON.parse(line).id),
    ["c", "a"],
  );
  const before = state.responses.length;
  second.destroyed = true;
  waiting.get("b").resolve("late");
  await flush();
  assert.equal(state.responses.length, before + 1);
  assert.deepEqual(second.writes, []);
});

test("server errors preserve control metadata and use best-effort socket write cleanup", async () => {
  const state = ports();
  const { createControlServer, FixtureControlRequestError } = await loadOwner(
    "controlServer",
    state,
  );
  const typed = new FixtureControlRequestError("fixture-busy", "x".repeat(501), false);
  await createControlServer("fixture-pipe", async () => {
    throw typed;
  });
  const client = socket();
  state.server.accept(client);
  client.emit("data", '{"id":"held","command":"restart"}\n');
  await flush();
  assert.deepEqual(JSON.parse(client.writes[0]), {
    id: "held",
    ok: false,
    error: { code: "fixture-busy", message: "x".repeat(500), retryable: false },
  });
  client.writeCallbacks[0](new Error("fixture EPIPE"));
  assert.equal(client.destroys, 1);

  const malformed = socket();
  state.server.accept(malformed);
  malformed.emit("data", "malformed\n");
  assert.equal(JSON.parse(malformed.writes[0]).error.code, "invalid-frame");
  assert.equal(malformed.destroys, 1);
  const incomplete = socket();
  state.server.accept(incomplete);
  incomplete.emit("data", '{"id":');
  incomplete.emit("end");
  assert.equal(incomplete.destroys, 1);
  const nativeFailure = socket();
  state.server.accept(nativeFailure);
  nativeFailure.emit("error", new Error("fixture ECONNRESET"));
  assert.equal(nativeFailure.destroys, 1);
});

test("listener shutdown destroys live sockets once and bounds close before endpoint removal", async () => {
  const state = ports();
  const { createControlServer } = await loadOwner("controlServer", state);
  const endpoint = String.raw`\\.\pipe\fixture-control`;
  const control = await createControlServer(endpoint, async () => undefined);
  assert.deepEqual(state.journal[1], ["mkdir", ".", { recursive: true }]);
  const first = socket(state.journal);
  const retired = socket();
  const last = socket(state.journal);
  state.server.accept(first);
  state.server.accept(retired);
  state.server.accept(last);
  retired.emit("close");
  const one = control.close();
  const two = control.close();
  assert.notEqual(one, two);
  assert.equal(state.server.closeCalls, 1);
  assert.equal(first.destroys, 1);
  assert.equal(last.destroys, 1);
  assert.equal(retired.destroys, 0);
  const [deadline] = state.deadlines.values();
  assert.equal(deadline.ms, 2000);
  assert.equal(deadline.unrefed, true);
  assert.equal(state.journal.filter(([kind]) => kind === "rm").length, 1);
  deadline.callback();
  await Promise.all([one, two]);
  assert.equal(state.journal.filter(([kind]) => kind === "rm").length, 2);
  state.server.closed();
  await control.close();
  assert.equal(state.server.closeCalls, 1);
});

test("client retains first-frame correlation, command variant fields and late callback effects", async () => {
  const state = ports();
  const { requestControl } = await loadOwner("controlClient", state);
  const request = { command: "apply-update", force: false };
  const promise = requestControl("fixture-pipe", request, 17);
  request.force = true;
  state.client.emit("connect");
  assert.deepEqual(JSON.parse(state.client.writes[0]), {
    command: "apply-update",
    force: true,
    id: "fixture-generated-id",
  });
  assert.equal([...state.deadlines.values()][0].ms, 17);
  state.client.emit(
    "data",
    '{"id":"different","ok":true}\n{"id":"fixture-generated-id","ok":true,"result":"discarded"}\n',
  );
  assert.equal(state.client.ends, 0);
  assert.equal(state.deadlines.size, 1);
  state.client.emit("data", '{"id":"fixture-generated-id","ok":true,"result":{"held":true}}\n');
  assert.deepEqual(await promise, { held: true });
  assert.equal(state.client.ends, 1);
  assert.equal(state.deadlines.size, 0);
  state.client.emit("data", "bad\n");
  assert.equal(state.client.destroys, 1);
});

test("client projects remote control errors and preserves native failure/timer ownership", async () => {
  const state = ports();
  const { requestControl } = await loadOwner("controlClient", state);
  const typed = requestControl("fixture", {
    command: "confirm-uninstall",
    confirmation: "fixture",
  }).catch((error) => error);
  state.client.emit("connect");
  assert.equal(JSON.parse(state.client.writes[0]).confirmation, "fixture");
  state.client.emit(
    "data",
    '{"id":"fixture-generated-id","ok":false,"error":{"code":"held","message":"wait","retryable":false}}\n',
  );
  const remoteError = await typed;
  assert.equal(remoteError.name, "ControlRequestError");
  assert.equal(remoteError.code, "held");
  assert.equal(remoteError.message, "wait");
  assert.equal(remoteError.retryable, false);

  const native = ports();
  const nativeOwner = await loadOwner("controlClient", native);
  const original = new Error("fixture native failure");
  const failed = nativeOwner.requestControl("fixture", { command: "stop" }).catch((error) => error);
  native.client.emit("error", original);
  assert.equal(await failed, original);
  assert.equal(native.client.destroys, 0);
  assert.equal(native.deadlines.size, 0);

  const timed = ports();
  const timedOwner = await loadOwner("controlClient", timed);
  const expired = timedOwner
    .requestControl("fixture", { command: "status" })
    .catch((error) => error);
  const [timer] = timed.deadlines.values();
  assert.equal(timer.ms, 10000);
  timer.callback();
  assert.equal((await expired).message, "Supervisor control request timed out");
  assert.equal(timed.client.destroys, 1);
});
