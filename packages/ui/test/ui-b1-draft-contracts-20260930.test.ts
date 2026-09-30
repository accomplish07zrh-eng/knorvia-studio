// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

type Event = { kind: string; args: unknown[] };
let events: Event[] = [];
let draftSessionId: string | null = "draft-fixture";
let stateFailure: Error | undefined;
let queryFailure: Error | undefined;
let invalidateFailure: Error | undefined;
let infoFailure: Error | undefined;
let warnFailure: Error | undefined;
const store = {
  getWorkspaceState(...args: unknown[]) {
    events.push({ kind: "query", args });
    if (queryFailure) throw queryFailure;
    return { draftSessionId };
  },
  invalidateDraftRuntime(...args: unknown[]) {
    events.push({ kind: "invalidate", args });
    if (invalidateFailure) throw invalidateFailure;
    draftSessionId = null;
  },
};

mock.module(new URL("../src/store/sessionStore.js", import.meta.url).href, {
  namedExports: {
    useKnorviaSessionStore: {
      getState() {
        events.push({ kind: "getState", args: [] });
        if (stateFailure) throw stateFailure;
        return store;
      },
    },
  },
});
mock.module(new URL("../src/logger.js", import.meta.url).href, {
  namedExports: {
    logger: {
      info(...args: unknown[]) {
        events.push({ kind: "info", args });
        if (infoFailure) throw infoFailure;
      },
      warn(...args: unknown[]) {
        events.push({ kind: "warn", args });
        if (warnFailure) throw warnFailure;
      },
    },
  },
});

const target = process.env.KNORVIA_UI_B1_LIB_DIR
  ? pathToFileURL(resolve(process.env.KNORVIA_UI_B1_LIB_DIR, "draftSkillInvalidation.ts")).href
  : new URL("../src/lib/draftSkillInvalidation.js", import.meta.url).href;
const {
  invalidateDeferredDraftSessionForRuntimeChange: runtime,
  invalidateDeferredDraftSessionForSkillChange: skill,
} = await import(target);

function setup() {
  events = [];
  draftSessionId = "draft-fixture";
  stateFailure = queryFailure = invalidateFailure = infoFailure = warnFailure = undefined;
  const sessionService = {
    async closeSession(...args: unknown[]) {
      assert.equal(this, sessionService);
      events.push({ kind: "close", args });
    },
  };
  return {
    workspacePath: "/synthetic",
    workspaceIdentity: " remote-fixture ",
    reason: "fixture change",
    logScope: "fixture",
    sessionService,
  };
}

test("B1 draft: missing path performs no reads, invalidation, close or logging", async () => {
  for (const workspacePath of [undefined, null, ""]) {
    const params = setup();
    await runtime({ ...params, workspacePath });
    assert.deepEqual(events, []);
  }
});

test("B1 draft: V4 draft with no legacy id still invalidates once", async () => {
  const params = setup();
  draftSessionId = null;
  await runtime(params);
  assert.deepEqual(events, [
    { kind: "getState", args: [] },
    { kind: "query", args: ["/synthetic", "remote-fixture"] },
    { kind: "invalidate", args: ["/synthetic", "remote-fixture"] },
  ]);
});

test("B1 draft: close waits after invalidation and uses the captured session", async () => {
  const params = setup();
  const gate = Promise.withResolvers<void>();
  params.sessionService.closeSession = async function (...args: unknown[]) {
    assert.equal(this, params.sessionService);
    assert.equal(draftSessionId, null);
    events.push({ kind: "close", args });
    await gate.promise;
  };
  const pending = runtime(params);
  assert.deepEqual(
    events.map((event) => event.kind),
    ["getState", "query", "invalidate", "close"],
  );
  assert.deepEqual(events[3]?.args, [
    {
      workspacePath: "/synthetic",
      workspaceIdentity: "remote-fixture",
      sessionId: "draft-fixture",
    },
  ]);
  gate.resolve();
  await pending;
  assert.deepEqual(events.at(-1), {
    kind: "info",
    args: [
      "[fixture] invalidated deferred draft session after runtime change",
      {
        draftSessionId: "draft-fixture",
        reason: "fixture change",
        workspaceIdentity: "remote-fixture",
        workspacePath: "/synthetic",
      },
    ],
  });
});

test("B1 draft: whitespace identity is absent in close and null in logs", async () => {
  const params = setup();
  await runtime({ ...params, workspacePath: "   ", workspaceIdentity: "   " });
  assert.deepEqual(events[1]?.args, ["   ", undefined]);
  const request = events[3]?.args[0] as Record<string, unknown>;
  assert.equal(Object.hasOwn(request, "workspaceIdentity"), false);
  assert.equal(request.workspacePath, "   ");
  assert.equal((events.at(-1)?.args[1] as Record<string, unknown>).workspaceIdentity, null);
});

test("B1 draft: skill entry enforces the skills log scope", async () => {
  await skill(setup());
  assert.equal(
    events.at(-1)?.args[0],
    "[skills] invalidated deferred draft session after runtime change",
  );
});

test("B1 draft: close reject is warned after invalidation and does not reject", async () => {
  const params = setup();
  params.sessionService.closeSession = async (...args: unknown[]) => {
    events.push({ kind: "close", args });
    throw new Error("close rejected");
  };
  await runtime(params);
  assert.deepEqual(
    events.map((event) => event.kind),
    ["getState", "query", "invalidate", "close", "warn"],
  );
  assert.deepEqual(events.at(-1)?.args, [
    "[fixture] close deferred draft session after runtime change failed",
    {
      draftSessionId: "draft-fixture",
      reason: "fixture change",
      workspaceIdentity: "remote-fixture",
      workspacePath: "/synthetic",
      error: "close rejected",
    },
  ]);
});

test("B1 draft: synchronous close throw follows the same warning route", async () => {
  const params = setup();
  params.sessionService.closeSession = () => {
    throw "sync rejection";
  };
  await runtime(params);
  assert.equal((events.at(-1)?.args[1] as Record<string, unknown>).error, "sync rejection");
});

for (const boundary of ["state", "query", "invalidate"] as const) {
  test(`B1 draft: ${boundary} failure rejects before close or logs`, async () => {
    const params = setup();
    const failure = new Error(`${boundary} rejected`);
    if (boundary === "state") stateFailure = failure;
    if (boundary === "query") queryFailure = failure;
    if (boundary === "invalidate") invalidateFailure = failure;
    await assert.rejects(runtime(params), (error) => error === failure);
    assert.equal(
      events.some((event) => ["close", "info", "warn"].includes(event.kind)),
      false,
    );
  });
}

test("B1 draft: success logger failure warns, warning logger failure rejects", async () => {
  const params = setup();
  infoFailure = new Error("info rejected");
  await runtime(params);
  assert.deepEqual(
    events.slice(-2).map((event) => event.kind),
    ["info", "warn"],
  );
  assert.equal((events.at(-1)?.args[1] as Record<string, unknown>).error, "info rejected");
  setup();
  const failure = new Error("warn rejected");
  warnFailure = failure;
  params.sessionService.closeSession = async () => {
    throw new Error("close rejected");
  };
  await assert.rejects(runtime(params), (error) => error === failure);
});

test("B1 draft: unstringifiable close failure rejects at the existing log boundary", async () => {
  const params = setup();
  const failure = new Error("String rejected");
  params.sessionService.closeSession = async () => {
    throw {
      toString() {
        throw failure;
      },
    };
  };
  await assert.rejects(runtime(params), (error) => error === failure);
  assert.equal(
    events.some((event) => event.kind === "warn"),
    false,
  );
});

test("B1 draft: each call invalidates once and a later call does not close a cleared id", async () => {
  const params = setup();
  await runtime(params);
  await runtime(params);
  assert.equal(events.filter((event) => event.kind === "invalidate").length, 2);
  assert.equal(events.filter((event) => event.kind === "close").length, 1);
});
