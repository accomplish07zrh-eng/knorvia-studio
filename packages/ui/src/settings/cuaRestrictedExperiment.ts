// 受限电脑控制实验开关的纯逻辑（无 React、无 IO、无副作用）。
//
// 诚实前提：@knorvia/cua 在本构建里是 fail-closed 占位包，既无法观察也没有可派发的动作。
// 因此开关**只**记录一个会话内偏好：打开它不会启动 Helper、不会申请系统权限、不会发网络请求、
// 不会改变运行时可用性，也不会让任何界面文案变成「可以观察」。
// 契约见 specs/knorvia-cua-restricted.md 第 8 节。

export const CUA_RESTRICTED_EXPERIMENT_DEFAULT_ENABLED = false;

/**
 * 本构建的诚实事实：占位包没有任何观察路径（`packages/cua` 全部 fail-closed）。
 * 这不是开关，而是对现状的记录；只有真正接上可观察运行时后才允许改变它。
 */
export const CUA_RESTRICTED_RUNTIME_OBSERVATION_AVAILABLE = false;

/** 停止的固定顺序，与门禁的 CUA_RESTRICTED_STOP_STEPS 一一对应。 */
export const CUA_RESTRICTED_STOP_RULE_MESSAGE_IDS = [
  "settings.computerUse.restricted.stopFirst.forbid",
  "settings.computerUse.restricted.stopFirst.cancel",
  "settings.computerUse.restricted.stopFirst.readState",
] as const;

export interface CuaRestrictedExperimentState {
  enabled: boolean;
}

export function createCuaRestrictedExperimentState(
  enabled: boolean = CUA_RESTRICTED_EXPERIMENT_DEFAULT_ENABLED,
): CuaRestrictedExperimentState {
  return { enabled: enabled === true };
}

export function setCuaRestrictedExperimentEnabled(
  _state: CuaRestrictedExperimentState,
  enabled: boolean,
): CuaRestrictedExperimentState {
  return { enabled: enabled === true };
}

export interface CuaRestrictedExperimentTogglePlan {
  enabled: boolean;
  /** 开关只改会话内偏好，其余一切都必须保持为 false。 */
  startsHelper: false;
  requestsOsPermission: false;
  sendsNetworkRequest: false;
  persistsPreference: false;
  availabilityUnchanged: true;
  steps: readonly ["record-session-local-preference"];
}

/** 打开/关闭开关时允许发生的副作用清单；除了记录会话内偏好，什么都不做。 */
export function planCuaRestrictedExperimentToggle(
  enabled: boolean,
): CuaRestrictedExperimentTogglePlan {
  return {
    enabled: enabled === true,
    startsHelper: false,
    requestsOsPermission: false,
    sendsNetworkRequest: false,
    persistsPreference: false,
    availabilityUnchanged: true,
    steps: ["record-session-local-preference"],
  };
}

export interface CuaRestrictedExperimentView {
  enabled: boolean;
  /** 只有在运行时真的可用且开关打开时才可能观察；本构建的运行时可用性恒为 false。 */
  canObserve: boolean;
  canAct: boolean;
  availabilityMessageId: string;
  observationMessageId: string;
  stopRuleMessageIds: readonly string[];
}

/**
 * 由「开关状态 + 运行时可用性事实」推导面板文案。
 * runtimeAvailable 必须来自真实探测结果；占位实现下恒为 false，因此永远显示「无法观察」。
 */
export function resolveCuaRestrictedExperimentView(input: {
  state: CuaRestrictedExperimentState;
  runtimeAvailable: boolean;
}): CuaRestrictedExperimentView {
  const runtimeAvailable = input.runtimeAvailable === true;
  const enabled = input.state.enabled === true;
  return {
    enabled,
    canObserve: enabled && runtimeAvailable,
    canAct: enabled && runtimeAvailable,
    availabilityMessageId: runtimeAvailable
      ? "settings.computerUse.restricted.experiment.available"
      : "settings.computerUse.restricted.experiment.unavailable",
    observationMessageId: "settings.computerUse.restricted.experiment.cannotObserve",
    stopRuleMessageIds: [...CUA_RESTRICTED_STOP_RULE_MESSAGE_IDS],
  };
}
