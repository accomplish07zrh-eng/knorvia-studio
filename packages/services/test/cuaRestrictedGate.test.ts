import assert from "node:assert/strict";
import test from "node:test";
import {
  CUA_OBSERVATION_MAX_AGE_MS,
  CUA_RESTRICTED_STOP_STEPS,
  classifyCuaRestrictedOutcome,
  createCuaRestrictedStopController,
  evaluateCuaRestrictedAction,
  resolveCuaObservationFreshness,
  shouldAutoReplayCuaRestrictedOutcome,
  type CuaRestrictedActionRequest,
  type CuaRestrictedGateContext,
  type CuaRestrictedObservation,
} from "@knorvia/cua/restricted-gate";
import {
  createCuaRestrictedRuntimeStopController,
  evaluateCuaRestrictedRequestForRuntime,
  readCuaRestrictedRuntimeAvailability,
} from "../src/cua-permission-broker/cuaRestrictedGateWiring.js";

// 纯逻辑测试：不启动 Helper、不申请权限、不发网络请求、不派发任何动作。
// 「允许」分支只用于证明门禁不是恒假的谓词；它由夹具构造的上下文驱动，
// 不代表本构建具备任何桌面控制能力（占位实现下运行时可用性恒为不可用）。

const NOW = 1_800_000_000_000;

function observation(overrides: Partial<CuaRestrictedObservation> = {}): CuaRestrictedObservation {
  return {
    observationId: "obs-1",
    observationVersion: 7,
    capturedAt: NOW - 1_000,
    expiresAt: NOW + 5_000,
    runId: "run-1",
    turnId: "turn-1",
    windowId: "win-1",
    ...overrides,
  };
}

function request(overrides: Partial<CuaRestrictedActionRequest> = {}): CuaRestrictedActionRequest {
  return {
    requestId: "req-1",
    runId: "run-1",
    turnId: "turn-1",
    windowId: "win-1",
    actionKind: "click",
    observationId: "obs-1",
    observationVersion: 7,
    ...overrides,
  };
}

function context(overrides: Partial<CuaRestrictedGateContext> = {}): CuaRestrictedGateContext {
  return {
    experimentEnabled: true,
    driverAvailable: true,
    helperAvailable: true,
    permissionMode: "restricted",
    nowMs: NOW,
    observation: observation(),
    ...overrides,
  };
}

test("the gate refuses everything while the experiment switch is off (default)", () => {
  const decision = evaluateCuaRestrictedAction(request(), context({ experimentEnabled: false }));
  assert.equal(decision.decision, "refuse");
  assert.equal(decision.reason, "experiment_disabled");
  assert.equal(decision.allowed, false);
  // 缺省上下文（未显式打开开关）同样拒绝，避免调用方忘记传值就放行。
  const missing = evaluateCuaRestrictedAction(request(), {} as CuaRestrictedGateContext);
  assert.equal(missing.reason, "experiment_disabled");
});

test("the gate refuses when the driver or the helper is unavailable", () => {
  assert.equal(
    evaluateCuaRestrictedAction(request(), context({ driverAvailable: false })).reason,
    "driver_unavailable",
  );
  assert.equal(
    evaluateCuaRestrictedAction(request(), context({ helperAvailable: false })).reason,
    "helper_unavailable",
  );
});

test("the gate refuses a stale or malformed observation and never replays stale coordinates", () => {
  const expired = observation({ capturedAt: NOW - 60_000, expiresAt: NOW - 1_000 });
  assert.equal(resolveCuaObservationFreshness(expired, NOW), "expired");
  assert.equal(
    evaluateCuaRestrictedAction(request(), context({ observation: expired })).reason,
    "observation_expired",
  );

  // 声明有效期超过上限也按过期处理，避免「永不过期」的观察。
  const tooLong = observation({
    capturedAt: NOW - 1_000,
    expiresAt: NOW + CUA_OBSERVATION_MAX_AGE_MS + 1,
  });
  assert.equal(resolveCuaObservationFreshness(tooLong, NOW), "expired");

  // 版本对不上：旧坐标必须拒绝，正确做法是重新观察。
  assert.equal(
    evaluateCuaRestrictedAction(request({ observationVersion: 6 }), context()).reason,
    "observation_stale_version",
  );
  assert.equal(
    evaluateCuaRestrictedAction(request({ observationId: "obs-other" }), context()).reason,
    "observation_stale_version",
  );
  assert.equal(
    evaluateCuaRestrictedAction(request(), context({ observation: null })).reason,
    "observation_missing",
  );
  assert.equal(
    evaluateCuaRestrictedAction(
      request(),
      context({ observation: observation({ expiresAt: NOW }) }),
    ).reason,
    "observation_expired",
  );
  assert.equal(
    evaluateCuaRestrictedAction(
      request(),
      context({ observation: { ...observation(), capturedAt: Number.NaN } }),
    ).reason,
    "observation_invalid",
  );
});

test("the gate refuses an observation from another run, turn or window", () => {
  assert.equal(
    evaluateCuaRestrictedAction(
      request(),
      context({ observation: observation({ runId: "run-2", observationId: "obs-1" }) }),
    ).reason,
    "observation_scope_mismatch",
  );
  assert.equal(
    evaluateCuaRestrictedAction(
      request(),
      context({ observation: observation({ turnId: "turn-2" }) }),
    ).reason,
    "observation_scope_mismatch",
  );
  assert.equal(
    evaluateCuaRestrictedAction(
      request(),
      context({ observation: observation({ windowId: "win-2" }) }),
    ).reason,
    "target_window_mismatch",
  );
  // 动作请求本身指向别的窗口时同样拒绝，不做「就近匹配」。
  assert.equal(
    evaluateCuaRestrictedAction(request({ windowId: "win-9" }), context()).reason,
    "target_window_mismatch",
  );
});

test("the gate refuses an insufficient permission mode and an ungranted foreground need", () => {
  assert.equal(
    evaluateCuaRestrictedAction(request(), context({ permissionMode: "observe-only" })).reason,
    "permission_insufficient",
  );
  assert.equal(
    evaluateCuaRestrictedAction(request(), context({ permissionMode: "none" })).reason,
    "permission_insufficient",
  );
  assert.equal(
    evaluateCuaRestrictedAction(
      request({ actionKind: "observe" }),
      context({ permissionMode: "none" }),
    ).reason,
    "permission_insufficient",
  );
  // 需要前台时只接受本次运行的显式批准；门禁绝不自行取得焦点。
  assert.equal(
    evaluateCuaRestrictedAction(request({ requiresForeground: true }), context()).reason,
    "foreground_not_approved",
  );
  // 未登记的动作类别一律拒绝。
  assert.equal(
    evaluateCuaRestrictedAction(
      request({ actionKind: "drag" as CuaRestrictedActionRequest["actionKind"] }),
      context(),
    ).reason,
    "action_not_allowed",
  );
});

test("a fully bound request is the only shape the gate lets through", () => {
  // 该分支只证明判定不是恒假：夹具提供可用 Driver/Helper、restricted 模式与新鲜观察。
  // 真实运行时下 driverAvailable/helperAvailable 恒为 false，因此本构建仍然全部拒绝。
  const decision = evaluateCuaRestrictedAction(request(), context());
  assert.equal(decision.decision, "allow");
  assert.equal(decision.reason, "ok");
  const readOnly = evaluateCuaRestrictedAction(
    request({ actionKind: "read-interface" }),
    context({ permissionMode: "observe-only" }),
  );
  assert.equal(readOnly.decision, "allow");
});

test("stop-first forbids subsequent actions, cancels the current request, then reads the state", () => {
  const controller = createCuaRestrictedStopController();
  const before = evaluateCuaRestrictedAction(
    request(),
    context({ runStopped: controller.isStopped("run-1") }),
  );
  assert.equal(before.decision, "allow");

  const plan = controller.requestStop({
    runId: "run-1",
    currentRequestId: "req-1",
    reason: "user",
  });
  assert.deepEqual(plan.steps, [...CUA_RESTRICTED_STOP_STEPS]);
  assert.deepEqual(plan.steps, [
    "forbid-subsequent-actions",
    "cancel-current-request",
    "read-terminal-state",
  ]);
  assert.equal(plan.cancelledRequestId, "req-1");
  // 停止不代表已派发的动作被撤销。
  assert.equal(plan.cancelsDispatchedActions, false);
  assert.equal(controller.isStopped("run-1"), true);
  assert.deepEqual(controller.assertDispatchAllowed("run-1"), {
    allowed: false,
    reason: "run_stopped",
  });

  // 停止后任何新动作（含排队中的）都被拒绝。
  const after = evaluateCuaRestrictedAction(
    request({ requestId: "req-2" }),
    context({ runStopped: controller.isStopped("run-1") }),
  );
  assert.equal(after.decision, "refuse");
  assert.equal(after.reason, "run_stopped");
  // 另一个 run 不受影响，但停止状态必须是按 run 精确记录的。
  assert.equal(controller.assertDispatchAllowed("run-2").allowed, true);
});

test("an unconfirmed dispatched action is unknown and is never auto-replayed", () => {
  assert.deepEqual(classifyCuaRestrictedOutcome({ dispatched: true }), {
    outcome: "unknown",
    dispatched: true,
  });
  assert.deepEqual(classifyCuaRestrictedOutcome({ dispatched: true, confirmed: true }), {
    outcome: "succeeded",
    dispatched: true,
  });
  assert.deepEqual(
    classifyCuaRestrictedOutcome({ dispatched: true, confirmed: true, failed: true }),
    {
      outcome: "failed",
      dispatched: true,
    },
  );
  assert.deepEqual(classifyCuaRestrictedOutcome({ dispatched: false }), {
    outcome: "not-dispatched",
    dispatched: false,
  });

  assert.deepEqual(shouldAutoReplayCuaRestrictedOutcome("unknown"), {
    replay: false,
    reason: "unknown-result-must-not-be-replayed",
  });
  assert.equal(shouldAutoReplayCuaRestrictedOutcome("succeeded").replay, false);
  assert.equal(shouldAutoReplayCuaRestrictedOutcome("failed").replay, false);
  // 只有「什么都没派发」才允许重试，因为不存在重复副作用。
  assert.equal(shouldAutoReplayCuaRestrictedOutcome("not-dispatched").replay, true);
});

test("the runtime wiring reports the placeholder as unavailable and refuses every request", () => {
  const availability = readCuaRestrictedRuntimeAvailability();
  assert.equal(availability.driverAvailable, false);
  assert.equal(availability.helperAvailable, false);
  assert.equal(availability.helperRunning, false);
  assert.equal(availability.socketPath, null);
  assert.equal(availability.screenCaptureProbeOk, false);
  assert.equal(availability.experimentEnabled, false);
  assert.equal(availability.observedFrom, "cua-package-placeholder");

  const decision = evaluateCuaRestrictedRequestForRuntime({
    request: request(),
    observation: observation(),
    permissionMode: "restricted",
    nowMs: NOW,
  });
  assert.equal(decision.decision, "refuse");
  assert.equal(decision.reason, "experiment_disabled");

  const stop = createCuaRestrictedRuntimeStopController().requestStop({ runId: "run-1" });
  assert.deepEqual(stop.steps, [...CUA_RESTRICTED_STOP_STEPS]);
});
