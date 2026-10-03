import assert from "node:assert/strict";
import { test } from "node:test";
import type { KnorviaTaskTarget } from "../src/agent-session/session.js";

test("conditional retirement admits once and releases only after a successful acknowledgement", async (t) => {
  let remembered = true;
  let forgets = 0;
  let forgetFailure: { value: unknown } | undefined;
  let warningFailure: { value: unknown } | undefined;
  const warnings: unknown[][] = [];
  const calls: unknown[] = [];
  let close: () => Promise<boolean> = () => Promise.resolve(false);
  const target = Object.freeze({
    workspacePath: "synthetic/workspace",
    workspaceIdentity: "synthetic-identity",
    sessionId: "synthetic-session",
    remoteSessionId: "synthetic-remote",
    expectedPersistence: "caller-value",
  });
  const registry = {
    has: () => remembered,
    remember() {
      remembered = true;
    },
    forget() {
      forgets++;
      if (forgetFailure) throw forgetFailure.value;
      remembered = false;
    },
  };
  t.mock.module("@knorvia/shared", { namedExports: { createSessionTraceId: () => "trace" } });
  t.mock.module("../src/logger/serviceLogger.js", {
    namedExports: {
      createServiceLogger: () => ({
        debug() {},
        info() {},
        warn(...args: unknown[]) {
          warnings.push(args);
          if (warningFailure) throw warningFailure.value;
        },
      }),
    },
  });
  t.mock.module("../src/agent/configOptions.js", {
    namedExports: { formatModelPickerValue: () => "model" },
  });
  t.mock.module("../src/agent-session/sessionApiRetry.js", {
    namedExports: {
      createKnorviaSessionApiRetryRuntimeTracker: () => ({
        withApiRetryRuntime: (value: unknown) => value,
      }),
    },
  });
  t.mock.module("../src/agent-session/sessionDraftRegistry.js", {
    namedExports: {
      createKnorviaDeferredDraftRegistry: () => registry,
    },
  });
  t.mock.module("../src/agent-session/importedClaudeSessionRepair.js", {
    namedExports: {
      repairEmptyImportedClaudeSessionSnapshot: async (input: { snapshot: unknown }) =>
        input.snapshot,
    },
  });
  t.mock.module("../src/session/mcpWorkspaceScope.js", {
    namedExports: {
      appendWorkspaceToFilesystemMcpServers: (value: unknown) => value,
    },
  });
  const { createKnorviaSessionService } = await import("../src/agent-session/sessionService.js");
  type Options = Parameters<typeof createKnorviaSessionService>[0];
  const service = createKnorviaSessionService({
    agentService: {
      closeSession(input: unknown) {
        calls.push(input);
        return close();
      },
    } as unknown as Options["agentService"],
  });
  function reset() {
    remembered = true;
    forgets = 0;
    forgetFailure = undefined;
    warningFailure = undefined;
    warnings.length = 0;
    calls.length = 0;
    close = () => Promise.resolve(false);
  }
  await t.test(
    "pending acknowledgement has no optimistic release and true releases once",
    async () => {
      reset();
      let resolve!: (value: boolean) => void;
      close = () =>
        new Promise<boolean>((finish) => {
          resolve = finish;
        });
      const pending = service.closeDeferredDraftSession(target);
      assert.equal(calls.length, 1);
      assert.equal(forgets, 0);
      assert.equal(remembered, true);
      assert.notEqual(calls[0], target);
      assert.deepEqual(calls[0], { ...target, expectedPersistence: "deferred" });
      resolve(true);
      assert.equal(await pending, true);
      assert.equal(forgets, 1);
      assert.equal(remembered, false);
      assert.equal(warnings.length, 0);
      assert.equal(target.expectedPersistence, "caller-value");
    },
  );
  await t.test("false acknowledgement keeps the remembered draft", async () => {
    reset();
    assert.equal(await service.closeDeferredDraftSession(target), false);
    assert.equal(forgets, 0);
    assert.equal(remembered, true);
    assert.equal(calls.length, 1);
    assert.equal(warnings.length, 0);
  });
  for (const failure of [undefined, null, false, 0, new Error("synthetic rejection")]) {
    await t.test("rejection preserves draft and diagnostic for " + String(failure), async () => {
      reset();
      close = () => Promise.reject(failure);
      assert.equal(await service.closeDeferredDraftSession(target), false);
      assert.equal(calls.length, 1);
      assert.equal(forgets, 0);
      assert.equal(remembered, true);
      assert.equal(warnings.length, 1);
      assert.deepEqual(warnings[0]?.[2], {
        error: failure instanceof Error ? failure.message : String(failure),
        sessionId: target.sessionId,
        workspaceIdentity: target.workspaceIdentity,
        workspacePath: target.workspacePath,
      });
    });
  }
  await t.test("synchronous invocation failure warns without a second request", async () => {
    reset();
    close = () => {
      throw new Error("synchronous close failure");
    };
    assert.equal(await service.closeDeferredDraftSession(target), false);
    assert.equal(calls.length, 1);
    assert.equal(warnings.length, 1);
    assert.equal(forgets, 0);
  });
  await t.test("parameter admission failure never calls the Agent", async () => {
    reset();
    const input = { ...target };
    Object.defineProperty(input, "admission", {
      enumerable: true,
      get() {
        throw false;
      },
    });
    assert.equal(await service.closeDeferredDraftSession(input), false);
    assert.equal(calls.length, 0);
    assert.equal(warnings.length, 1);
    assert.equal(forgets, 0);
  });
  await t.test("registry completion failure enters the existing false result policy", async () => {
    reset();
    close = () => Promise.resolve(true);
    forgetFailure = { value: undefined };
    assert.equal(await service.closeDeferredDraftSession(target), false);
    assert.equal(calls.length, 1);
    assert.equal(forgets, 1);
    assert.equal(remembered, true);
    assert.equal(warnings.length, 1);
  });
  await t.test("warning failure rejects once without a duplicate warning", async () => {
    reset();
    close = () => Promise.resolve(true);
    forgetFailure = { value: new Error("forget failure") };
    const failure = new Error("warning failure");
    warningFailure = { value: failure };
    await assert.rejects(service.closeDeferredDraftSession(target), (error) => error === failure);
    assert.equal(warnings.length, 1);
    assert.equal(calls.length, 1);
  });
  await t.test("diagnostic getter failure retains its rejection boundary", async () => {
    reset();
    const failure = new Error("diagnostic target getter");
    const input = { ...target };
    Object.defineProperty(input, "sessionId", {
      enumerable: true,
      get() {
        throw failure;
      },
    });
    await assert.rejects(
      service.closeDeferredDraftSession(input as KnorviaTaskTarget),
      (error) => error === failure,
    );
    assert.equal(calls.length, 0);
    assert.equal(warnings.length, 0);
  });
});
