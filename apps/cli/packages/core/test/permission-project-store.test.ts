// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { PermissionRuleset, ProjectId } from "@knorvia/contracts";
import {
  loadProjectPermissionRuleset,
  persistProjectPermissionUpdates,
} from "../src/tool/executor/permission-rules-persistence.js";
import { grantFixture, grantUpdate } from "./permission-grant-fixture.js";
import type { ToolExecutorDeps } from "../src/tool/executor/types.js";
import { gate } from "./tool-invocation-fixture.js";

test("project load returns null for missing store/session/project and preserves errors", async () => {
  const f = grantFixture();
  f.deps.sessionStore = undefined;
  assert.equal(await loadProjectPermissionRuleset(f.deps), null);
  for (const session of [null, undefined, {}, { projectID: "" }]) {
    f.deps.sessionStore = {
      getSession: async () => session,
      getProjectPermission: async () => {
        throw new Error("must not read rules");
      },
    } as unknown as ToolExecutorDeps["sessionStore"];
    assert.equal(await loadProjectPermissionRuleset(f.deps), null);
  }
  const failure = { fixture: "session read" };
  f.deps.sessionStore = {
    getSession: async () => {
      throw failure;
    },
  } as unknown as ToolExecutorDeps["sessionStore"];
  await assert.rejects(loadProjectPermissionRuleset(f.deps), (error) => error === failure);
});

test("project load resolves live session identity on every call and retains receiver and rules reference", async () => {
  const f = grantFixture(),
    rules: PermissionRuleset = { version: 1, allow: [{ toolName: "Fixture" }] };
  let project = "first";
  const identities: string[] = [];
  const store = {
    async getSession(sessionId: string) {
      assert.equal(this, store);
      assert.equal(sessionId, f.deps.sessionId);
      return { projectID: project };
    },
    async getProjectPermission(projectId: ProjectId) {
      assert.equal(this, store);
      identities.push(projectId);
      return rules;
    },
  };
  f.deps.sessionStore = store as unknown as ToolExecutorDeps["sessionStore"];
  assert.equal(await loadProjectPermissionRuleset(f.deps), rules);
  project = "second";
  assert.equal(await loadProjectPermissionRuleset(f.deps), rules);
  assert.deepEqual(identities, ["first", "second"]);
});

test("empty project updates avoid even store and logger getters", async () => {
  const f = grantFixture();
  Object.defineProperty(f.deps, "sessionStore", {
    get() {
      throw new Error("store must stay unread");
    },
  });
  Object.defineProperty(f.deps, "logger", {
    get() {
      throw new Error("logger must stay unread");
    },
  });
  await persistProjectPermissionUpdates(f.deps, [], f.trace);
});

test("nonempty updates preserve separate missing-store and missing-session diagnostics", async () => {
  const f = grantFixture();
  f.deps.sessionStore = undefined;
  await persistProjectPermissionUpdates(f.deps, grantUpdate(), f.trace);
  f.deps.sessionStore = {
    getSession: async () => null,
  } as unknown as ToolExecutorDeps["sessionStore"];
  await persistProjectPermissionUpdates(f.deps, grantUpdate(), f.trace);
  assert.deepEqual(
    f.observed.logs.map((entry) => entry.slice(0, 2)),
    [
      ["warn", "Project permission update skipped without session store"],
      ["warn", "Project permission update skipped without persisted session"],
    ],
  );
  for (const log of f.observed.logs) {
    const data = log[2] as Record<string, unknown>;
    assert.equal(data.event, "tool.permission.project_update.skipped");
    assert.equal(data.traceId, f.trace.traceId);
    assert.equal(data.status, "completed");
  }
});

test("missing-store diagnostics run before the caller can change the logger", async () => {
  const f = grantFixture();
  f.deps.sessionStore = undefined;
  const pending = persistProjectPermissionUpdates(f.deps, grantUpdate(), f.trace);
  assert.equal(f.observed.logs.length, 1);
  f.deps.logger = undefined;
  await pending;
});

test("project persistence awaits save before success logging and does not use its returned value", async () => {
  const f = grantFixture(),
    release = gate(),
    entered = gate();
  const first = { toolName: "First" };
  f.state.rules = { version: 1, allow: [first] };
  let saved: unknown;
  f.store.saveProjectPermission = async function (input: unknown) {
    assert.equal(this, f.store);
    saved = input;
    f.timeline.push("save.enter");
    entered.resolve();
    await release.promise;
    f.timeline.push("save.exit");
  };
  const info = f.deps.logger!.info;
  f.deps.logger!.info = function (...args) {
    assert.equal(this, f.deps.logger);
    f.timeline.push("logged");
    info.apply(this, args);
  };
  const pending = persistProjectPermissionUpdates(f.deps, grantUpdate("Second"), f.trace);
  await entered.promise;
  assert.equal(f.observed.logs.length, 0);
  assert.deepEqual(saved, {
    projectID: "fixture-project",
    permission: { version: 1, allow: [first, { toolName: "Second" }] },
  });
  release.resolve();
  assert.equal(await pending, undefined);
  assert.deepEqual(f.timeline, [
    "store.session",
    "store.rules",
    "save.enter",
    "save.exit",
    "logged",
  ]);
});

test("missing logger avoids trace inspection while port and log failures propagate unchanged", async () => {
  const f = grantFixture();
  f.deps.sessionStore = undefined;
  f.deps.logger = undefined;
  Object.defineProperty(f.trace, "traceId", {
    get() {
      throw new Error("trace unread");
    },
  });
  await persistProjectPermissionUpdates(f.deps, grantUpdate(), f.trace);
  for (const phase of ["read", "save", "log"]) {
    const next = grantFixture(),
      failure = { phase };
    if (phase === "read")
      next.store.getProjectPermission = async () => {
        throw failure;
      };
    if (phase === "save")
      next.store.saveProjectPermission = async () => {
        throw failure;
      };
    if (phase === "log")
      next.deps.logger!.info = () => {
        throw failure;
      };
    await assert.rejects(
      persistProjectPermissionUpdates(next.deps, grantUpdate(), next.trace),
      (error) => error === failure,
    );
  }
});
