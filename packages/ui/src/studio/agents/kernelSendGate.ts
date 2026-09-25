import {
  assessKernelCapabilities,
  type ProbeCode,
  type ProbeStage,
  type StudioCapabilityId,
  type StudioKernelStatus,
  type StudioPermission,
} from "@knorvia/services";
import { studioProbeFirstFailure, studioProbeState } from "./kernelProbeView.js";

/**
 * 发送前的真实能力校验（纯函数，无 IO）。
 *
 * 规则（见 specs/knorvia-kernel-status.md 的「发送前校验」）：
 * - 只做「拒绝或放行」，从不替换模型、从不放宽/提升权限，也从不静默降级用户选择；
 * - 未检测、未安装、程序在但协议失败、版本未核验都按失败关闭处理，并给出可解释原因；
 * - 只有用户主动选择的权限档需要被内核证明时才拦截（`read-only` → `readOnly`，
 *   `full-access` → `fullAccess`；`ask` 沿用 CLI 自身的审批流，不额外收紧）。
 */

export type StudioSendRefusalCode =
  | "status-unknown"
  | "remote-offline"
  | "not-installed"
  | "probe-failed"
  | "version-unverified"
  | "permission-unsupported";

/** 参数值以该前缀开头时表示「这是 i18n id，请调用方本地化」。 */
export const STUDIO_REFUSAL_I18N_PREFIX = "i18n:";

export interface StudioSendRefusal {
  code: StudioSendRefusalCode;
  /** 顶层消息 id；调用方用 `studioSendRefusalValues` 解析参数后再格式化。 */
  messageId: string;
  params: Record<string, string>;
  /** 触发拒绝的阶段与机器代码；只用于展示与诊断，不含路径或凭据。 */
  stage?: ProbeStage;
  probeCode?: ProbeCode;
  /** 重新探测可能改变结论时为 true（界面据此提供「重新检测」入口）。 */
  retryable: boolean;
}

const i18n = (id: string) => `${STUDIO_REFUSAL_I18N_PREFIX}${id}`;

export function studioSendRefusalValues(
  refusal: StudioSendRefusal,
  format: (id: string) => string,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(refusal.params).map(([key, value]) => [
      key,
      value.startsWith(STUDIO_REFUSAL_I18N_PREFIX)
        ? format(value.slice(STUDIO_REFUSAL_I18N_PREFIX.length))
        : value,
    ]),
  );
}

/** 业务入口抛出它，界面按 `refusal` 呈现可解释文案；消息文本本身就是 messageId。 */
export class StudioSendRefusalError extends Error {
  constructor(readonly refusal: StudioSendRefusal) {
    super(refusal.messageId);
    this.name = "StudioSendRefusalError";
  }
}

/** 权限档到必须被内核证明的能力；`ask` 不需要额外证据。 */
const PERMISSION_CAPABILITY: Record<StudioPermission, StudioCapabilityId | undefined> = {
  "read-only": "readOnly",
  ask: undefined,
  "full-access": "fullAccess",
};

export function studioPermissionCapability(
  permission: StudioPermission,
): StudioCapabilityId | undefined {
  return PERMISSION_CAPABILITY[permission];
}

export function studioSendRefusal(input: {
  status?: StudioKernelStatus;
  permission: StudioPermission;
  kernelName: string;
}): StudioSendRefusal | undefined {
  const { status, permission, kernelName } = input;
  if (!status)
    return {
      code: "status-unknown",
      messageId: "studio.agents.sendRefusal.statusUnknown",
      params: { name: kernelName },
      retryable: true,
    };
  if (status.remoteWorkspacePath && !status.installed)
    return {
      code: "remote-offline",
      messageId: "studio.agents.sendRefusal.remoteOffline",
      params: { name: kernelName },
      retryable: true,
    };
  const state = studioProbeState(status);
  if (state === "not-installed" || (!status.probe && !status.installed))
    return {
      code: "not-installed",
      messageId: "studio.agents.sendRefusal.notInstalled",
      params: { name: kernelName },
      ...failureEvidence(status),
      retryable: true,
    };
  if (state === "unusable")
    return {
      code: "probe-failed",
      messageId: "studio.agents.sendRefusal.probeFailed",
      params: {
        name: kernelName,
        stage: i18n(
          `studio.agents.probe.stage.${studioProbeFirstFailure(status)?.stage ?? "locate"}`,
        ),
        code: studioProbeFirstFailure(status)?.code ?? "",
      },
      ...failureEvidence(status),
      retryable: true,
    };
  const required = studioPermissionCapability(permission);
  if (required && status.capabilities?.[required] !== true) {
    const evidence = assessKernelCapabilities({
      kernel: status.id,
      ...(status.version ? { version: status.version } : {}),
    }).decisions[required].evidence;
    const unverified = evidence === "unverified";
    return {
      code: unverified ? "version-unverified" : "permission-unsupported",
      messageId: unverified
        ? "studio.agents.sendRefusal.versionUnverified"
        : "studio.agents.sendRefusal.permissionUnsupported",
      params: {
        name: kernelName,
        capability: i18n(`studio.agents.capability.${required}`),
        permission: i18n(`studio.agents.permission.${permission}`),
        version: status.version ?? "",
      },
      retryable: false,
    };
  }
  return undefined;
}

function failureEvidence(status: StudioKernelStatus): {
  stage?: ProbeStage;
  probeCode?: ProbeCode;
} {
  const failure = studioProbeFirstFailure(status);
  if (!failure) return {};
  return { stage: failure.stage, ...(failure.code ? { probeCode: failure.code } : {}) };
}
