// 受限电脑控制门禁在 services 层的接线。
//
// 只做两件事：把既有 CUA 装配**自己暴露的可用性事实**读出来，交给纯门禁判定；并转发停止控制器。
// 不新增探测、不启动 Helper、不申请系统权限、不发网络请求。
//
// 本构建里 @knorvia/cua 是 fail-closed 占位包：createProductCuaHelperHost() 返回的 host
// running 恒为 false、socketPath 恒为 null，且没有任何截图探针结果。因此这里读出来的
// 可用性恒为「不可用」，门禁对任何真实请求都会给出 refuse——这是预期行为，不是缺陷。
import {
  createProductCuaHelperHost,
  isScreenCaptureProbeSuccess,
} from "@knorvia/cua/broker/server";
import {
  createCuaRestrictedStopController,
  evaluateCuaRestrictedAction,
  type CuaRestrictedActionRequest,
  type CuaRestrictedGateDecision,
  type CuaRestrictedObservation,
  type CuaRestrictedPermissionMode,
  type CuaRestrictedStopController,
} from "@knorvia/cua/restricted-gate";

export interface CuaRestrictedRuntimeAvailability {
  driverAvailable: boolean;
  helperAvailable: boolean;
  helperRunning: boolean;
  socketPath: string | null;
  screenCaptureProbeOk: boolean;
  experimentEnabled: boolean;
  /** 事实来源标记：当前只能是占位包自身，不是真实 Driver。 */
  observedFrom: "cua-package-placeholder";
}

/**
 * 读取当前 CUA 运行时可用性。所有字段都是既有装配的可观察输出，
 * 不含任何新的进程启动、权限申请或网络访问。
 */
export function readCuaRestrictedRuntimeAvailability(): CuaRestrictedRuntimeAvailability {
  const host = createProductCuaHelperHost();
  const socketPath = host.socketPath;
  const helperRunning = host.running;
  return {
    // 本构建没有可监督的 Driver 进程；占位实现不提供任何启动路径。
    driverAvailable: false,
    helperAvailable: Boolean(helperRunning && socketPath),
    helperRunning,
    socketPath,
    // 没有截图探针结果可用：占位实现的两个探针判定恒为 false。
    screenCaptureProbeOk: isScreenCaptureProbeSuccess(undefined),
    // 受限实验开关由 UI 会话内偏好持有，不来自任何持久配置，host 侧不读取它。
    experimentEnabled: false,
    observedFrom: "cua-package-placeholder",
  };
}

export interface CuaRestrictedRuntimeDecisionInput {
  request: CuaRestrictedActionRequest;
  observation?: CuaRestrictedObservation | null;
  permissionMode: CuaRestrictedPermissionMode;
  nowMs: number;
  runStopped?: boolean;
  foregroundApprovedForRun?: boolean;
}

/** 用运行时真实可用性判定一次受限动作请求；本构建下必然 refuse。 */
export function evaluateCuaRestrictedRequestForRuntime(
  input: CuaRestrictedRuntimeDecisionInput,
): CuaRestrictedGateDecision {
  const availability = readCuaRestrictedRuntimeAvailability();
  return evaluateCuaRestrictedAction(input.request, {
    experimentEnabled: availability.experimentEnabled,
    driverAvailable: availability.driverAvailable,
    helperAvailable: availability.helperAvailable,
    permissionMode: input.permissionMode,
    nowMs: input.nowMs,
    runStopped: input.runStopped,
    foregroundApprovedForRun: input.foregroundApprovedForRun,
    observation: input.observation ?? null,
  });
}

/** 停止控制器：顺序固定为「禁止后续动作 → 取消当前请求 → 读取真实终态」。 */
export function createCuaRestrictedRuntimeStopController(): CuaRestrictedStopController {
  return createCuaRestrictedStopController();
}
