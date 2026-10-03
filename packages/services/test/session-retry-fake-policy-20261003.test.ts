import assert from "node:assert/strict";
import { test } from "node:test";
import type { KnorviaSessionApiRetryStatus, KnorviaSessionStateSnapshot } from "@knorvia/shared";
import type {
  KnorviaSessionServiceEvent,
  KnorviaTaskTarget,
} from "../src/agent-session/session.js";

test("synthetic shared policy ports preserve retry precedence, session identity, null clearing and live/snapshot projection", async (t) => {
  // 不执行协议校验：这些只用于观测 owner 如何传递外部策略返回值和原引用。
  const retryA = { synthetic: "A" } as unknown as KnorviaSessionApiRetryStatus;
  const retryB = { synthetic: "B" } as unknown as KnorviaSessionApiRetryStatus;
  const calls: string[] = [];
  const normalizeError = new Error("synthetic normalization failure");
  const keyError = new Error("synthetic key failure");
  t.mock.module("@knorvia/shared", {
    namedExports: {
      normalizeKnorviaApiRetryStatus(value: unknown) {
        calls.push("normalize");
        if (value === normalizeError) throw normalizeError;
        return value === retryA || value === retryB || value === null ? value : undefined;
      },
      isKnorviaModelRetryRecoveryProgressPayload(value: Record<string, unknown>) {
        calls.push("progress");
        return value.syntheticProgress === true;
      },
      resolveWorkspaceKey(value: KnorviaTaskTarget) {
        calls.push("key");
        assert.deepEqual(Object.keys(value), ["workspacePath", "workspaceIdentity", "sessionId"]);
        assert.equal("remoteSessionId" in value, false);
        if (value.workspacePath === "synthetic/error") throw keyError;
        return value.workspaceIdentity?.trim() || value.workspacePath;
      },
      knorviaApiRetryFromStreamRecoveryPayload(value: Record<string, unknown>) {
        calls.push("stream");
        return value.syntheticStream;
      },
      knorviaApiRetryFromModelNetworkStatusPayload(value: Record<string, unknown>) {
        calls.push("network");
        return value.syntheticNetwork;
      },
    },
  });
  const { createKnorviaSessionApiRetryRuntimeTracker: create } =
    await import("../src/agent-session/sessionApiRetry.js");
  const tracker = create();
  assert.deepEqual(Object.keys(tracker), ["trackApiRetryFromSessionEvent", "withApiRetryRuntime"]);
  assert.equal(Object.isFrozen(tracker), false);
  const { trackApiRetryFromSessionEvent: track, withApiRetryRuntime: withRetry } = tracker;
  const target: KnorviaTaskTarget = {
    workspacePath: "synthetic/ws",
    workspaceIdentity: " synthetic-identity ",
    sessionId: "ignored-outer",
    remoteSessionId: "synthetic-remote",
  };
  function event(
    payload: unknown,
    sessionId = "synthetic-session",
    type = "session.updated",
  ): KnorviaSessionServiceEvent {
    return {
      type: "session.event",
      event: { type, sessionId, payload, syntheticExtra: "keep" },
    } as unknown as KnorviaSessionServiceEvent;
  }
  function snapshot(
    runtime: Record<string, unknown> = {},
    status = "running",
    sessionId = "synthetic-session",
    identity = " synthetic-identity ",
  ): KnorviaSessionStateSnapshot {
    return {
      session: {
        sessionId,
        workspace: { workspacePath: "synthetic/ws", workspaceIdentity: identity },
        status,
      },
      runtime,
      syntheticExtra: "keep",
    } as unknown as KnorviaSessionStateSnapshot;
  }
  const empty = snapshot();
  assert.equal(withRetry(empty), empty);
  const update = event({
    apiRetry: retryA,
    runtime: { apiRetry: retryB },
    syntheticStream: retryB,
  });
  calls.length = 0;
  assert.equal(track(target, update), update);
  assert.deepEqual(calls, ["normalize", "key"]);
  const projected = withRetry(empty);
  assert.notEqual(projected, empty);
  assert.equal(projected.runtime.apiRetry, retryA);
  assert.equal(projected.session, empty.session);
  assert.equal("apiRetry" in empty.runtime, false);
  assert.equal(withRetry(snapshot({}, "running", "other")).runtime.apiRetry, undefined);
  const isolated = snapshot({}, "running", "synthetic-session", "other-identity");
  assert.equal(withRetry(isolated), isolated);
  const second = create();
  assert.equal(second.withApiRetryRuntime(empty), empty);

  // 显式顶层 undefined 抑制 runtime/meta/stream；没有恢复进展时保持现有值。
  const inherited = Object.create({ apiRetry: undefined }) as Record<string, unknown>;
  inherited.runtime = { apiRetry: retryB };
  inherited.syntheticStream = retryB;
  calls.length = 0;
  track(target, event(inherited));
  assert.deepEqual(calls, ["normalize", "key", "progress"]);
  assert.equal(withRetry(empty).runtime.apiRetry, retryA);
  track(target, event({ apiRetry: undefined, syntheticProgress: true }));
  assert.equal(withRetry(empty).runtime.apiRetry, null);
  calls.length = 0;
  track(target, event({ apiRetry: undefined, syntheticProgress: true }));
  assert.deepEqual(calls, ["normalize", "key"]);
  calls.length = 0;
  track(target, event({ runtime: { apiRetry: null }, _meta: { knorvia: { apiRetry: retryB } } }));
  assert.deepEqual(calls, ["normalize", "key"]);
  assert.equal(withRetry(empty).runtime.apiRetry, null);
  calls.length = 0;
  track(target, event({ _meta: { knorvia: { apiRetry: retryB } } }));
  assert.deepEqual(calls, ["normalize", "normalize", "key"]);
  assert.equal(withRetry(empty).runtime.apiRetry, retryB);
  calls.length = 0;
  track(
    target,
    event(
      { syntheticStream: null, syntheticNetwork: retryA },
      "synthetic-session",
      "streamRecovery.updated",
    ),
  );
  assert.deepEqual(calls, ["normalize", "normalize", "stream", "network", "key"]);
  assert.equal(withRetry(empty).runtime.apiRetry, retryA);
  calls.length = 0;
  track(target, event({ syntheticStream: retryB, syntheticNetwork: retryA }));
  assert.deepEqual(calls, ["normalize", "normalize", "stream", "key"]);
  assert.equal(withRetry(empty).runtime.apiRetry, retryB);
  const irrelevant = event({ apiRetry: retryA }, "synthetic-session", "turn.started");
  assert.equal(track(target, irrelevant), irrelevant);
  assert.equal(withRetry(empty).runtime.apiRetry, retryB);

  const explicit = snapshot({ apiRetry: retryA, other: "retained" }, "completed");
  assert.equal(withRetry(explicit), explicit);
  assert.equal(withRetry(empty).runtime.apiRetry, retryA);
  const terminal = snapshot({ other: "retained" }, "completed");
  const cleared = withRetry(terminal);
  assert.deepEqual(cleared.runtime, { other: "retained", apiRetry: null });
  assert.equal(withRetry(empty).runtime.apiRetry, null);
  const errorTerminal = snapshot({}, "error", "new-session");
  assert.equal(withRetry(errorTerminal).runtime.apiRetry, null);
  let reads = 0;
  const changingRuntime = {
    get apiRetry() {
      reads++;
      return reads === 1 ? retryA : retryB;
    },
  };
  const changing = snapshot(changingRuntime);
  assert.equal(withRetry(changing), changing);
  assert.equal(reads, 2);
  assert.equal(withRetry(empty).runtime.apiRetry, retryB);
  const wrapped: KnorviaSessionServiceEvent = { type: "snapshot", snapshot: empty };
  const result = track(target, wrapped);
  assert.notEqual(result, wrapped);
  assert.equal(result.type, "snapshot");
  if (result.type === "snapshot") assert.equal(result.snapshot.runtime.apiRetry, retryB);
  const blank = snapshot({}, "completed", "");
  calls.length = 0;
  assert.equal(withRetry(blank), blank);
  assert.deepEqual(calls, []);
  const freshSnapshot = snapshot({}, "running", "fresh");
  const freshEvent: KnorviaSessionServiceEvent = { type: "snapshot", snapshot: freshSnapshot };
  const freshWrapped = track(target, freshEvent);
  assert.notEqual(freshWrapped, freshEvent);
  if (freshWrapped.type === "snapshot") assert.equal(freshWrapped.snapshot, freshSnapshot);
  assert.throws(
    () => track(target, event({ apiRetry: normalizeError })),
    (error) => error === normalizeError,
  );
  calls.length = 0;
  assert.throws(
    () => track({ ...target, workspacePath: "synthetic/error" }, event({ apiRetry: retryA })),
    (error) => error === keyError,
  );
  assert.deepEqual(calls, ["normalize", "key"]);
  // 不改变协议 schema；只观测未校验合成值触发的既有原生字符串转换。
  const hints: string[] = [];
  const syntheticSession = {
    [Symbol.toPrimitive](hint: string) {
      hints.push(hint);
      return "synthetic-coercion";
    },
  } as unknown as string;
  track(target, event({ apiRetry: retryA }, syntheticSession));
  assert.deepEqual(hints, ["string"]);
});
