import assert from "node:assert/strict";
import test from "node:test";
import {
  CUA_RESTRICTED_EXPERIMENT_DEFAULT_ENABLED,
  CUA_RESTRICTED_RUNTIME_OBSERVATION_AVAILABLE,
  CUA_RESTRICTED_STOP_RULE_MESSAGE_IDS,
  createCuaRestrictedExperimentState,
  planCuaRestrictedExperimentToggle,
  resolveCuaRestrictedExperimentView,
  setCuaRestrictedExperimentEnabled,
} from "../src/settings/cuaRestrictedExperiment.js";

// 纯逻辑测试：不渲染、不启动 Helper、不申请系统权限、不发网络请求。
// 契约见 specs/knorvia-cua-restricted.md 第 8 节。

test("the restricted Computer Use experiment is off by default", () => {
  assert.equal(CUA_RESTRICTED_EXPERIMENT_DEFAULT_ENABLED, false);
  assert.equal(CUA_RESTRICTED_RUNTIME_OBSERVATION_AVAILABLE, false);
  assert.deepEqual(createCuaRestrictedExperimentState(), { enabled: false });
  const view = resolveCuaRestrictedExperimentView({
    state: createCuaRestrictedExperimentState(),
    runtimeAvailable: CUA_RESTRICTED_RUNTIME_OBSERVATION_AVAILABLE,
  });
  assert.equal(view.enabled, false);
  assert.equal(view.canObserve, false);
  assert.equal(view.canAct, false);
  assert.equal(
    view.availabilityMessageId,
    "settings.computerUse.restricted.experiment.unavailable",
  );
});

test("turning the experiment on starts nothing and keeps the placeholder honest", () => {
  const initial = createCuaRestrictedExperimentState();
  const enabled = setCuaRestrictedExperimentEnabled(initial, true);
  assert.equal(initial.enabled, false, "state updates must not mutate the previous state");
  assert.equal(enabled.enabled, true);

  const plan = planCuaRestrictedExperimentToggle(true);
  assert.equal(plan.startsHelper, false);
  assert.equal(plan.requestsOsPermission, false);
  assert.equal(plan.sendsNetworkRequest, false);
  assert.equal(plan.persistsPreference, false, "the switch must stay session-local");
  assert.equal(plan.availabilityUnchanged, true);
  assert.deepEqual(plan.steps, ["record-session-local-preference"]);

  // 即使开关打开，本构建的运行时可用性仍是 false，因此依然不能观察、不能动作。
  const view = resolveCuaRestrictedExperimentView({
    state: enabled,
    runtimeAvailable: CUA_RESTRICTED_RUNTIME_OBSERVATION_AVAILABLE,
  });
  assert.equal(view.enabled, true);
  assert.equal(view.canObserve, false, "the placeholder must not claim it can observe");
  assert.equal(view.canAct, false);
  assert.equal(
    view.observationMessageId,
    "settings.computerUse.restricted.experiment.cannotObserve",
  );
});

test("the view only claims observation when a runtime really reports it", () => {
  // 该分支只证明推导不是恒假；真实调用方传入的是运行时探测结果（本构建恒为 false）。
  const view = resolveCuaRestrictedExperimentView({
    state: createCuaRestrictedExperimentState(true),
    runtimeAvailable: true,
  });
  assert.equal(view.canObserve, true);
  assert.equal(view.availabilityMessageId, "settings.computerUse.restricted.experiment.available");
  const stillOff = resolveCuaRestrictedExperimentView({
    state: createCuaRestrictedExperimentState(false),
    runtimeAvailable: true,
  });
  assert.equal(
    stillOff.canObserve,
    false,
    "an off switch cannot observe even when a runtime exists",
  );
});

test("the stop affordance describes the fixed stop-first order", () => {
  assert.deepEqual(CUA_RESTRICTED_STOP_RULE_MESSAGE_IDS, [
    "settings.computerUse.restricted.stopFirst.forbid",
    "settings.computerUse.restricted.stopFirst.cancel",
    "settings.computerUse.restricted.stopFirst.readState",
  ]);
  const view = resolveCuaRestrictedExperimentView({
    state: createCuaRestrictedExperimentState(true),
    runtimeAvailable: false,
  });
  assert.deepEqual(view.stopRuleMessageIds, [...CUA_RESTRICTED_STOP_RULE_MESSAGE_IDS]);
});
