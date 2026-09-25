// 受限电脑控制（restricted Computer Use）的 fail-closed 门禁。
//
// 纯函数 + 纯状态：不做 IO、不启动进程、不申请系统权限、不发网络请求。
// 本构建里的 @knorvia/cua 是故意 fail-closed 的占位实现——没有可观察路径，也没有可派发的动作；
// 本模块只做判定，不修改任何既有导出，也不会让任何东西变成「可用」。
// 契约见 specs/knorvia-cua-restricted.md。

export const CUA_RESTRICTED_CONTRACT_VERSION = 1;

/** 观察的最大有效期上限；调用方给出的 expiresAt 超过它一律按过期处理。 */
export const CUA_OBSERVATION_MAX_AGE_MS = 15_000;

/** 权限模式由弱到强；模型不能提高权限，模式不足即拒绝。 */
export const CUA_RESTRICTED_PERMISSION_MODES = ["none", "observe-only", "restricted"];

/** 允许的动作白名单；不在表内即拒绝，不做「就近匹配」。 */
export const CUA_RESTRICTED_ACTION_KINDS = [
  "observe",
  "read-interface",
  "click",
  "type-text",
  "stop",
];

/** 需要观察作为坐标来源的动作；observe 自己产生观察，stop 不依赖观察。 */
const OBSERVATION_BOUND_ACTIONS = ["read-interface", "click", "type-text"];

/** 需要 restricted 模式的动作；观察类动作在 observe-only 下即可。 */
const MUTATING_ACTIONS = ["click", "type-text"];

export const CUA_RESTRICTED_REFUSAL_REASONS = Object.freeze([
  "experiment_disabled",
  "run_stopped",
  "action_not_allowed",
  "driver_unavailable",
  "helper_unavailable",
  "permission_insufficient",
  "foreground_not_approved",
  "observation_missing",
  "observation_invalid",
  "observation_expired",
  "observation_stale_version",
  "observation_scope_mismatch",
  "target_window_mismatch",
]);

export const CUA_RESTRICTED_DECISIONS = Object.freeze(["allow", "refuse"]);

/** 停止的固定顺序：禁止后续动作 → 取消当前请求 → 读取真实终态。顺序不可交换。 */
export const CUA_RESTRICTED_STOP_STEPS = Object.freeze([
  "forbid-subsequent-actions",
  "cancel-current-request",
  "read-terminal-state",
]);

export function isCuaRestrictedActionKind(value) {
  return typeof value === "string" && CUA_RESTRICTED_ACTION_KINDS.includes(value);
}

export function isCuaRestrictedPermissionMode(value) {
  return typeof value === "string" && CUA_RESTRICTED_PERMISSION_MODES.includes(value);
}

function permissionRank(mode) {
  const index = CUA_RESTRICTED_PERMISSION_MODES.indexOf(mode);
  return index < 0 ? -1 : index;
}

function refuse(reason) {
  return { decision: "refuse", reason, allowed: false };
}

function allow(reason) {
  return { decision: "allow", reason, allowed: true };
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * 观察新鲜度。没有可用时间戳、结构不完整时返回 "invalid"；
 * 超过 CUA_OBSERVATION_MAX_AGE_MS 或已过 expiresAt 时返回 "expired"。
 */
export function resolveCuaObservationFreshness(observation, nowMs) {
  if (!observation || typeof observation !== "object") return "invalid";
  const { capturedAt, expiresAt } = observation;
  if (!Number.isFinite(nowMs)) return "invalid";
  if (!Number.isFinite(capturedAt) || !Number.isFinite(expiresAt)) return "invalid";
  if (expiresAt <= capturedAt) return "invalid";
  if (expiresAt - capturedAt > CUA_OBSERVATION_MAX_AGE_MS) return "expired";
  if (nowMs >= expiresAt) return "expired";
  if (nowMs < capturedAt) return "invalid";
  return "fresh";
}

function checkObservationBinding(request, observation, nowMs) {
  if (!observation) return refuse("observation_missing");
  if (!hasText(observation.observationId)) return refuse("observation_invalid");
  const freshness = resolveCuaObservationFreshness(observation, nowMs);
  if (freshness === "invalid") return refuse("observation_invalid");
  if (freshness === "expired") return refuse("observation_expired");
  if (observation.observationVersion !== request.observationVersion) {
    // 版本对不上就是过期坐标，绝不用旧坐标重试。
    return refuse("observation_stale_version");
  }
  if (observation.observationId !== request.observationId) {
    return refuse("observation_stale_version");
  }
  if (
    observation.runId !== request.runId ||
    (observation.turnId ?? null) !== (request.turnId ?? null)
  ) {
    return refuse("observation_scope_mismatch");
  }
  if (observation.windowId !== request.windowId) return refuse("target_window_mismatch");
  return null;
}

/**
 * 门禁判定。默认 fail-closed：任何输入不完整、上下文缺失或顺序不明的情况都拒绝。
 * 返回 { decision, reason, allowed }，reason 是机器可读原因码（见 CUA_RESTRICTED_REFUSAL_REASONS）。
 */
export function evaluateCuaRestrictedAction(request, context) {
  if (!request || typeof request !== "object") return refuse("action_not_allowed");
  const now = context && typeof context === "object" ? context : {};

  // 实验开关默认关闭：关闭时连 stop 请求也不进入受限通道（stop 仍可由既有停止链路处理）。
  if (now.experimentEnabled !== true) return refuse("experiment_disabled");

  if (!hasText(request.requestId)) return refuse("action_not_allowed");
  if (!hasText(request.runId)) return refuse("action_not_allowed");
  if (!hasText(request.windowId)) return refuse("action_not_allowed");
  if (!isCuaRestrictedActionKind(request.actionKind)) return refuse("action_not_allowed");

  if (now.runStopped === true) return refuse("run_stopped");

  // stop 只是状态迁移，不依赖 Driver/观察，但也不得在无进程时假装「已撤销动作」。
  if (request.actionKind === "stop") return allow("stop-first");

  if (now.driverAvailable !== true) return refuse("driver_unavailable");
  if (now.helperAvailable !== true) return refuse("helper_unavailable");

  if (!isCuaRestrictedPermissionMode(now.permissionMode)) {
    return refuse("permission_insufficient");
  }
  const requiredMode = MUTATING_ACTIONS.includes(request.actionKind)
    ? "restricted"
    : "observe-only";
  if (permissionRank(now.permissionMode) < permissionRank(requiredMode)) {
    return refuse("permission_insufficient");
  }

  // 前台/焦点只由用户针对本次运行显式批准；门禁绝不自行取得。
  if (request.requiresForeground === true && now.foregroundApprovedForRun !== true) {
    return refuse("foreground_not_approved");
  }

  if (OBSERVATION_BOUND_ACTIONS.includes(request.actionKind)) {
    const binding = checkObservationBinding(request, now.observation ?? null, now.nowMs);
    if (binding) return binding;
  }

  return allow("ok");
}

/** 结果分类：已派发但无法确认 = unknown；unknown 永不自动重放。 */
export function classifyCuaRestrictedOutcome(result) {
  if (!result || typeof result !== "object") return { outcome: "unknown", dispatched: false };
  const dispatched = result.dispatched === true;
  if (!dispatched) return { outcome: "not-dispatched", dispatched: false };
  if (result.failed === true) return { outcome: "failed", dispatched: true };
  if (result.confirmed === true) return { outcome: "succeeded", dispatched: true };
  return { outcome: "unknown", dispatched: true };
}

/**
 * 是否允许自动重放。除了「完全没派发」以外一律不允许：
 * 已派发但未确认的动作必须由用户决定，绝不自动重放。
 */
export function shouldAutoReplayCuaRestrictedOutcome(outcome) {
  if (outcome === "not-dispatched") {
    return { replay: true, reason: "not-dispatched" };
  }
  if (outcome === "unknown") {
    return { replay: false, reason: "unknown-result-must-not-be-replayed" };
  }
  return { replay: false, reason: "settled-result-must-not-be-replayed" };
}

/**
 * 停止控制器。requestStop 严格按 stop-first 顺序推进状态：
 * 先禁止后续动作（同一 run 的任何新请求都会被 run_stopped 拒绝），再记录被取消的当前请求，
 * 最后由调用方执行 read-terminal-state 读取真实终态。
 */
export function createCuaRestrictedStopController() {
  const stoppedRuns = new Set();
  const cancelledRequests = new Map();
  return {
    requestStop(input) {
      const runId = input && typeof input.runId === "string" ? input.runId : "";
      const currentRequestId =
        input && typeof input.currentRequestId === "string" && input.currentRequestId.trim()
          ? input.currentRequestId
          : null;
      if (runId) {
        stoppedRuns.add(runId);
        if (currentRequestId) cancelledRequests.set(runId, currentRequestId);
      }
      return {
        runId,
        steps: [...CUA_RESTRICTED_STOP_STEPS],
        cancelledRequestId: currentRequestId,
        // 停止不表示已经派发的动作被撤销；未确认的动作仍按 unknown 处理。
        cancelsDispatchedActions: false,
        reason: input && typeof input.reason === "string" ? input.reason : null,
      };
    },
    isStopped(runId) {
      return stoppedRuns.has(runId);
    },
    cancelledRequestId(runId) {
      return cancelledRequests.get(runId) ?? null;
    },
    /** 停止后任何新动作（含排队中的）都必须被禁止。 */
    assertDispatchAllowed(runId) {
      return stoppedRuns.has(runId)
        ? { allowed: false, reason: "run_stopped" }
        : { allowed: true, reason: "ok" };
    },
  };
}
