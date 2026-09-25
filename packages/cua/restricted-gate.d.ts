// 受限电脑控制门禁的类型声明。运行时实现见 restricted-gate.js（纯函数，无 IO）。
// 契约见 specs/knorvia-cua-restricted.md。

export declare const CUA_RESTRICTED_CONTRACT_VERSION: 1;

export declare const CUA_OBSERVATION_MAX_AGE_MS: number;

export type CuaRestrictedPermissionMode = "none" | "observe-only" | "restricted";

export declare const CUA_RESTRICTED_PERMISSION_MODES: readonly CuaRestrictedPermissionMode[];

export type CuaRestrictedActionKind = "observe" | "read-interface" | "click" | "type-text" | "stop";

export declare const CUA_RESTRICTED_ACTION_KINDS: readonly CuaRestrictedActionKind[];

export type CuaRestrictedRefusalReason =
  | "experiment_disabled"
  | "run_stopped"
  | "action_not_allowed"
  | "driver_unavailable"
  | "helper_unavailable"
  | "permission_insufficient"
  | "foreground_not_approved"
  | "observation_missing"
  | "observation_invalid"
  | "observation_expired"
  | "observation_stale_version"
  | "observation_scope_mismatch"
  | "target_window_mismatch";

export declare const CUA_RESTRICTED_REFUSAL_REASONS: readonly CuaRestrictedRefusalReason[];

export declare const CUA_RESTRICTED_DECISIONS: readonly ["allow", "refuse"];

export type CuaRestrictedStopStep =
  | "forbid-subsequent-actions"
  | "cancel-current-request"
  | "read-terminal-state";

export declare const CUA_RESTRICTED_STOP_STEPS: readonly CuaRestrictedStopStep[];

export type CuaObservationFreshness = "fresh" | "expired" | "invalid";

export interface CuaRestrictedObservation {
  observationId: string;
  /** 单调递增版本号；动作必须引用它，对不上就是过期坐标。 */
  observationVersion: number;
  capturedAt: number;
  /** 必须显式给出；没有「永不过期」的观察。 */
  expiresAt: number;
  runId: string;
  turnId?: string | null;
  windowId: string;
}

export interface CuaRestrictedActionRequest {
  requestId: string;
  runId: string;
  turnId?: string | null;
  windowId: string;
  actionKind: CuaRestrictedActionKind;
  observationId?: string | null;
  observationVersion?: number | null;
  /** true 表示该动作需要前台/焦点；门禁绝不会自行取得，只接受本次运行的显式批准。 */
  requiresForeground?: boolean;
}

export interface CuaRestrictedGateContext {
  /** 实验开关默认关闭；非 true 时一切受限动作被拒绝。 */
  experimentEnabled: boolean;
  driverAvailable: boolean;
  helperAvailable: boolean;
  permissionMode: CuaRestrictedPermissionMode;
  nowMs: number;
  runStopped?: boolean;
  foregroundApprovedForRun?: boolean;
  observation?: CuaRestrictedObservation | null;
}

export interface CuaRestrictedGateDecision {
  decision: "allow" | "refuse";
  reason: string;
  allowed: boolean;
}

export declare function isCuaRestrictedActionKind(value: unknown): value is CuaRestrictedActionKind;

export declare function isCuaRestrictedPermissionMode(
  value: unknown,
): value is CuaRestrictedPermissionMode;

export declare function resolveCuaObservationFreshness(
  observation: CuaRestrictedObservation | null | undefined,
  nowMs: number,
): CuaObservationFreshness;

export declare function evaluateCuaRestrictedAction(
  request: CuaRestrictedActionRequest,
  context: CuaRestrictedGateContext,
): CuaRestrictedGateDecision;

export type CuaRestrictedOutcome = "not-dispatched" | "succeeded" | "failed" | "unknown";

export declare function classifyCuaRestrictedOutcome(result: unknown): {
  outcome: CuaRestrictedOutcome;
  dispatched: boolean;
};

export declare function shouldAutoReplayCuaRestrictedOutcome(outcome: CuaRestrictedOutcome): {
  replay: boolean;
  reason: string;
};

export interface CuaRestrictedStopRequest {
  runId: string;
  currentRequestId?: string | null;
  reason?: string | null;
}

export interface CuaRestrictedStopPlan {
  runId: string;
  steps: CuaRestrictedStopStep[];
  cancelledRequestId: string | null;
  /** 停止不撤销已派发的动作；未确认的动作仍按 unknown 处理。 */
  cancelsDispatchedActions: false;
  reason: string | null;
}

export interface CuaRestrictedStopController {
  requestStop(input: CuaRestrictedStopRequest): CuaRestrictedStopPlan;
  isStopped(runId: string): boolean;
  cancelledRequestId(runId: string): string | null;
  assertDispatchAllowed(runId: string): { allowed: boolean; reason: string };
}

export declare function createCuaRestrictedStopController(): CuaRestrictedStopController;
