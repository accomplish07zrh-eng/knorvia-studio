import {
  PROBE_STAGES,
  assessKernelCapabilities,
  type ProbeCode,
  type ProbeStage,
  type ProbeStageStatus,
  type StudioCapabilityEvidence,
  type StudioCapabilityId,
  type StudioKernelProbe,
  type StudioKernelStatus,
} from "@knorvia/services";

/**
 * 分层探测状态的纯投影（无 React、无 IO），供 Agent 管理、会话编辑器与诊断导出共用。
 *
 * 规则（见 specs/knorvia-kernel-status.md 的「UI 呈现」）：
 * - 未知/未核验一律如实呈现，绝不渲染成「已安装/可用」；
 * - 阶段状态与机器代码原样展示，不把失败折叠成一句「未安装」；
 * - 能力布尔值只取自宿主上报的 `capabilities`（已包含 ACP 协商后的升级），
 *   本模块只补充证据等级说明，从不重算、也从不升级能力。
 */

/** 阶段状态；未知取值（未来新增或载荷损坏）归一为 `unknown`，绝不当作通过。 */
export type StudioProbeStageState = ProbeStageStatus | "unknown";

export interface StudioProbeStageView {
  stage: ProbeStage;
  state: StudioProbeStageState;
  code?: ProbeCode;
  reason?: string;
  ms: number;
  /** `studio.agents.probe.stage.<stage>` */
  labelKey: string;
  /** `studio.agents.probe.status.<state>` */
  statusKey: string;
  /** 机器代码的人读解释；未登记代码时为 undefined（此时只显示代码本身）。 */
  glossKey?: string;
}

const STAGE_STATES: readonly ProbeStageStatus[] = [
  "ok",
  "failed",
  "skipped",
  "cancelled",
  "timeout",
];

function isStageState(value: unknown): value is ProbeStageStatus {
  return STAGE_STATES.includes(value as ProbeStageStatus);
}

/**
 * 有本地化解释的失败/跳过代码。未登记的代码只渲染机器代码本身，
 * 避免为未知代码猜语义（后端 `probeResult.ts` 的 `ProbeCode` 是唯一词表）。
 */
const PROBE_CODE_GLOSS = new Set<string>([
  "locate.missing",
  "locate.path-invalid",
  "locate.launcher-unresolved",
  "locate.registry-closed",
  "locate.manager-unavailable",
  "locate.failed",
  "version.spawn",
  "version.exit",
  "version.timeout",
  "version.cancelled",
  "version.output-invalid",
  "version.unparsable",
  "version.failed",
  "protocol.unavailable",
  "protocol.mismatch",
  "protocol.rpc",
  "protocol.transport",
  "protocol.timeout",
  "protocol.cancelled",
  "protocol.failed",
  "auth.not-requested",
  "auth.unavailable",
  "auth.failed",
  "auth.timeout",
  "auth.cancelled",
  "stage.not-reached",
]);

export function studioProbeCodeGlossKey(code: string | undefined): string | undefined {
  return code && PROBE_CODE_GLOSS.has(code) ? `studio.agents.probe.code.${code}` : undefined;
}

export function studioProbeStageViews(
  probe: StudioKernelProbe | undefined,
): StudioProbeStageView[] {
  if (!probe) return [];
  return PROBE_STAGES.map((stage) => {
    const result = probe.stages?.[stage];
    const state: StudioProbeStageState = isStageState(result?.status) ? result.status : "unknown";
    const code = typeof result?.code === "string" ? (result.code as ProbeCode) : undefined;
    const glossKey = studioProbeCodeGlossKey(code);
    return {
      stage,
      state,
      ...(code ? { code } : {}),
      ...(result?.reason ? { reason: result.reason } : {}),
      ms: typeof result?.ms === "number" && result.ms >= 0 ? result.ms : 0,
      labelKey: `studio.agents.probe.stage.${stage}`,
      statusKey: `studio.agents.probe.status.${state}`,
      ...(glossKey ? { glossKey } : {}),
    };
  });
}

/** 该段是否算通过（`ok` 与按规则 `skipped` 都通过）；`unknown` 不通过。 */
function stagePasses(state: StudioProbeStageState): boolean {
  return state === "ok" || state === "skipped";
}

export type StudioProbeState =
  /** 四段全部通过（含按规则跳过）。 */
  | "verified"
  /** 定位段失败：机器上没有可用程序。 */
  | "not-installed"
  /** 定位成功但版本/协议段失败或未完成：程序在，但当前接入不可用。 */
  | "unusable"
  /** 没有分层证据（旧记录、远端快照、被拒清单）：不能据此确认可用。 */
  | "unknown";

export function studioProbeState(status: StudioKernelStatus | undefined): StudioProbeState {
  if (!status?.probe) return "unknown";
  const failure = studioProbeStageViews(status.probe).find((view) => !stagePasses(view.state));
  if (!failure) return "verified";
  return failure.stage === "locate" ? "not-installed" : "unusable";
}

/**
 * 卡片徽标 id。“程序存在但协议失败”（`unusable`）与“未安装”（`not-installed`）必须不同；
 * `probe` 缺失时沿用旧字段语义（旧记录、远端快照、被拒清单），不额外推断可用性。
 */
export function studioProbeBadgeKey(input: {
  status?: StudioKernelStatus;
  inspected: boolean;
  builtin: boolean;
}): string {
  const { status, inspected, builtin } = input;
  if (!status) return inspected ? "studio.agents.notInstalled" : "studio.agents.unchecked";
  if (status.remoteWorkspacePath && !status.installed) return "studio.agents.sshOffline";
  if (status.probe) {
    switch (studioProbeState(status)) {
      case "verified":
        return builtin ? "studio.agents.builtin" : "studio.agents.detected";
      case "not-installed":
        return "studio.agents.notInstalled";
      case "unusable":
        return "studio.agents.probe.badgeUnusable";
      default:
        return "studio.agents.unchecked";
    }
  }
  return status.installed ? "studio.agents.detected" : "studio.agents.notInstalled";
}

export function studioProbeCached(status: StudioKernelStatus | undefined): boolean {
  return status?.probe?.cached === true;
}

/** 第一条非通过阶段；全通过时为 undefined。 */
export function studioProbeFirstFailure(
  status: StudioKernelStatus | undefined,
): StudioProbeStageView | undefined {
  return studioProbeStageViews(status?.probe).find((view) => !stagePasses(view.state));
}

export type StudioCapabilityEvidenceState = "verified" | "reported" | "unverified" | "unsupported";

export interface StudioCapabilityRow {
  capability: StudioCapabilityId;
  supported: boolean;
  evidence: StudioCapabilityEvidence;
  evidenceState: StudioCapabilityEvidenceState;
  /** `studio.agents.capability.<id>` */
  capabilityKey: string;
  /** `studio.agents.capabilityEvidence.<state>` */
  evidenceKey: string;
  /** 宿主上报的能力是否被本地版本化矩阵独立核验过。 */
  versionKnown: boolean;
}

const CAPABILITY_IDS: readonly StudioCapabilityId[] = [
  "resume",
  "approval",
  "questions",
  "readOnly",
  "fullAccess",
];

/**
 * 能力行的诚实呈现：
 * - 布尔值只取自 `status.capabilities`（含 ACP 协商后的升级），本模块不重算；
 * - `verified` 只在本地矩阵对「这个版本」给出 verified 时使用；
 * - 不支持但版本已知且低于已核验下限时标为 `unverified`（失败关闭），与 `unsupported` 区分。
 */
export function studioCapabilityRows(
  status: StudioKernelStatus | undefined,
): StudioCapabilityRow[] {
  const assessment = status
    ? assessKernelCapabilities({
        kernel: status.id,
        ...(status.version ? { version: status.version } : {}),
      })
    : undefined;
  const versionKnown = Boolean(status?.version);
  return CAPABILITY_IDS.map((capability) => {
    const supported = status?.capabilities?.[capability] === true;
    const evidence = assessment?.decisions[capability].evidence ?? "unsupported";
    const evidenceState: StudioCapabilityEvidenceState = supported
      ? evidence === "verified"
        ? "verified"
        : "reported"
      : evidence === "unverified"
        ? "unverified"
        : "unsupported";
    return {
      capability,
      supported,
      evidence,
      evidenceState,
      capabilityKey: `studio.agents.capability.${capability}`,
      evidenceKey: `studio.agents.capabilityEvidence.${evidenceState}`,
      versionKnown,
    };
  });
}

export interface StudioProbeDiagnosticStage {
  status: ProbeStageStatus;
  code?: string;
  reason?: string;
  ms: number;
}

export interface StudioProbeDiagnosticFields {
  stages: Record<ProbeStage, StudioProbeDiagnosticStage>;
  durationMs: number;
  probedAt: number;
  cached?: boolean;
}

/**
 * 诊断导出的 opt-in 阶段投影：只保留状态、机器代码、原因与耗时。
 * 路径、环境变量与凭据不属于探测阶段，因此这里也没有可导出的字段；
 * 桌面端导出前还会再过一遍脱敏规则（见 `packages/desktop/src/main/localDiagnostics.ts`）。
 */
export function studioProbeDiagnosticFields(
  probe: StudioKernelProbe | undefined,
): StudioProbeDiagnosticFields | undefined {
  if (!probe) return undefined;
  const views = studioProbeStageViews(probe);
  // 形状不可信（缺段或未知状态）时宁可不导出阶段信息，也不把未知写成 failed。
  if (!views.length || views.some((view) => view.state === "unknown")) return undefined;
  const stages = Object.fromEntries(
    views.map((view) => [
      view.stage,
      {
        status: view.state,
        ...(view.code ? { code: view.code } : {}),
        ...(view.reason ? { reason: view.reason.slice(0, 240) } : {}),
        ms: view.ms,
      },
    ]),
  ) as Record<ProbeStage, StudioProbeDiagnosticStage>;
  return {
    stages,
    durationMs: probe.durationMs,
    probedAt: probe.probedAt,
    ...(probe.cached ? { cached: true } : {}),
  };
}

/** 认证迹象：只在真正失败/超时/取消的阶段里找，跳过 `auth.not-requested`。 */
const AUTH_REASON =
  /(?:\bauth(?:entication|orization)?\b|\blog ?in\b|\bsign[ -]?in\b|credential|token|unauthor|登录|认证|授权|凭据|凭证)/iu;

export interface StudioAuthHint {
  /** 只读提示的 i18n id；本模块不提供任何执行登录的入口。 */
  titleKey: string;
  bodyKey: string;
  actionKey: string;
  cliName: string;
  stage: ProbeStage;
  code?: ProbeCode;
}

/**
 * 「去原 CLI 登录」只读提示。只在失败原因确实指向认证时给出；
 * 本函数是纯计算：不联网、不启动进程、不读写任何凭据。
 */
export function studioAuthHint(
  status: StudioKernelStatus | undefined,
  cliName: string,
): StudioAuthHint | undefined {
  const failure = studioProbeFirstFailure(status);
  if (!failure) return undefined;
  const indicatesAuth =
    failure.stage === "auth" || AUTH_REASON.test(`${failure.code ?? ""} ${failure.reason ?? ""}`);
  if (!indicatesAuth) return undefined;
  return {
    titleKey: "studio.agents.probe.authHint.title",
    bodyKey: "studio.agents.probe.authHint.body",
    actionKey: "studio.agents.probe.authHint.action",
    cliName,
    stage: failure.stage,
    ...(failure.code ? { code: failure.code } : {}),
  };
}
