import assert from "node:assert/strict";
import { test } from "node:test";
import { createBroadcastService } from "../src/broadcast/broadcastService.js";

test("fake broadcast ports preserve reentrant ordering and token-safe late claim cleanup", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  let ids = 0;
  t.mock.method(globalThis.crypto, "randomUUID", () => `synthetic-claim-${++ids}`);
  type Wire = {
    type: string;
    key?: string;
    requestId?: string;
    claimToken?: string;
    message?: { channel: string; payload: unknown };
  };
  const posted: Wire[] = [];
  let receive: ((event: { data: unknown }) => void) | undefined;
  let immediateReply = false;
  const service = createBroadcastService({
    on: (event, listener) => {
      assert.equal(event, "message");
      assert.equal(receive, undefined);
      receive = listener;
    },
    postMessage: (message) => {
      const wire = message as Wire;
      posted.push(wire);
      if (immediateReply && wire.type === "broadcast-claim-request") {
        receive?.({
          data: {
            type: "broadcast-claim-result",
            requestId: wire.requestId,
            status: "acquired",
            claimToken: "synchronous-token",
          },
        });
      }
    },
  });
  const delivered: string[] = [];
  const payload = { synthetic: true };
  service.onMessage((message) => {
    delivered.push(message.channel);
    assert.equal(message.payload, payload);
    if (message.channel === "outer") void service.send({ channel: "inner", payload });
  });
  await service.send({ channel: "outer", payload });
  assert.deepEqual(delivered, ["outer", "inner"]);
  assert.deepEqual(
    posted.map((wire) => wire.message?.channel),
    ["inner", "outer"],
  );
  assert.equal(posted[1]?.message?.payload, payload);

  immediateReply = true;
  const synchronous = await service.acquireClaim("  scoped-key  ");
  assert.deepEqual(synchronous, {
    status: "acquired",
    lease: { key: "scoped-key", token: "synchronous-token" },
  });
  immediateReply = false;
  const late = service.acquireClaim(" late-key ");
  const request = posted.at(-1)!;
  t.mock.timers.tick(2_000);
  assert.deepEqual(await late, { status: "unavailable" });
  receive?.({
    data: {
      type: "broadcast-claim-result",
      requestId: request.requestId,
      status: "acquired",
      claimToken: "late-token",
    },
  });
  assert.deepEqual(posted.at(-1), {
    type: "broadcast-claim-release",
    key: "late-key",
    claimToken: "late-token",
  });
  const forgotten = service.acquireClaim("forgotten-key");
  const forgottenRequest = posted.at(-1)!;
  t.mock.timers.tick(2_000);
  assert.deepEqual(await forgotten, { status: "unavailable" });
  t.mock.timers.tick(7_000);
  const count = posted.length;
  receive?.({
    data: {
      type: "broadcast-claim-result",
      requestId: forgottenRequest.requestId,
      status: "acquired",
      claimToken: "expired-token",
    },
  });
  assert.equal(posted.length, count);

  const local = createBroadcastService(null);
  const old = await local.acquireClaim("local-key");
  assert.equal(old.status, "acquired");
  if (old.status !== "acquired") throw new Error("synthetic setup failed");
  await local.releaseClaim({ key: old.lease.key, token: "wrong-token" });
  assert.equal((await local.acquireClaim("local-key")).status, "busy");
  t.mock.timers.tick(5_000);
  const renewed = await local.acquireClaim("local-key");
  assert.equal(renewed.status, "acquired");
  if (renewed.status !== "acquired") throw new Error("synthetic renewal failed");
  await local.commitClaim(old.lease);
  await local.releaseClaim(old.lease);
  assert.equal((await local.acquireClaim("local-key")).status, "busy");
  await local.commitClaim(renewed.lease);
  await local.releaseClaim(renewed.lease);
  assert.deepEqual(await local.acquireClaim("local-key"), { status: "committed" });
});
