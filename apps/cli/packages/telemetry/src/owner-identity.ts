// SPDX-License-Identifier: Apache-2.0
// 遥测身份与资源属性的取值规则。
//
// 输入只有环境记录与调用方给的版本信息，输出是可直接喂给 OTel Resource 的纯数据；
// 这里不做任何 I/O，也不持有状态。
import type {
  ModelApiRuntimeSurface,
  TelemetryIdentitySnapshot,
  TelemetryResourceContext,
} from "@knorvia/contracts/telemetry";
import type { EnvRecord } from "./env-record.js";
import { normalizeInstallationId } from "./owner-installation.js";

/** 三个形态闸门：安装标识、构建号与版本号。 */
const BUILD_PATTERN = /^[0-9a-f]{7,64}$/iu;
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/u;
/** 资源属性里的固定值。 */
const DEFAULT_SERVICE_NAME = "cli-agent";
const ENVIRONMENT_ATTRIBUTE = "deployment.environment.name";
/** 两个枚举字段的合法取值。 */
const SURFACES: readonly ModelApiRuntimeSurface[] = [
  "desktop_local_host",
  "remote_workspace_host",
  "standalone_cli",
];
const DISTRIBUTIONS: ReadonlyArray<TelemetryResourceContext["runtimeDistribution"]> = [
  "development_bundle",
  "packaged",
  "source",
  "unknown",
];

/**
 * 身份快照：显式状态优先；否则按「有用户主体 → authenticated、
 * 有安装标识 → anonymous、其余 unknown」推断。
 */
export function identityFromEnv(env: EnvRecord): TelemetryIdentitySnapshot {
  const userSubjectId = normalizeInstallationId(env.KNORVIA_TELEMETRY_USER_SUBJECT_ID);
  const declared = env.KNORVIA_TELEMETRY_IDENTITY_STATE?.trim();
  const declaredStates = ["authenticated", "anonymous", "unknown"];
  if (declared !== undefined && declaredStates.includes(declared)) {
    const explicit: TelemetryIdentitySnapshot = {
      identityState: declared as TelemetryIdentitySnapshot["identityState"],
    };
    if (userSubjectId !== undefined) explicit.userSubjectId = userSubjectId;
    return explicit;
  }
  // 推断顺序：有用户主体即有身份；只有安装 ID 时是匿名；都没有则未知。
  const hasInstallation = normalizeInstallationId(env.KNORVIA_TELEMETRY_DEVICE_MID) !== undefined;
  const state: TelemetryIdentitySnapshot["identityState"] = userSubjectId
    ? "authenticated"
    : hasInstallation
      ? "anonymous"
      : "unknown";
  const snapshot: TelemetryIdentitySnapshot = { identityState: state };
  if (userSubjectId !== undefined) snapshot.userSubjectId = userSubjectId;
  return snapshot;
}

/** 资源属性的组装入参：与准备入参的字段一一对应。 */
export interface ResourceInputs {
  buildCommitId?: string;
  cliVersion?: string;
  productVersion?: string;
  runtimeDistribution?: TelemetryResourceContext["runtimeDistribution"];
  runtimeSurface?: ModelApiRuntimeSurface;
}

/**
 * 组装资源上下文。空值一律保持缺席（不写空字符串），由导出层剔除。
 * 部署环境按 `KNORVIA_ENV` → `KNORVIA_RUNTIME_ENV` → `OTEL_RESOURCE_ATTRIBUTES` 的顺序取值。
 */
export function resourceFromEnv(env: EnvRecord, inputs: ResourceInputs): TelemetryResourceContext {
  const resource: TelemetryResourceContext = {
    runtimeSurface: inputs.runtimeSurface ?? pickSurface(env.KNORVIA_TELEMETRY_RUNTIME_SURFACE),
    serviceInstanceId: "",
    serviceName: env.OTEL_SERVICE_NAME?.trim() || DEFAULT_SERVICE_NAME,
    runtimeDistribution:
      inputs.runtimeDistribution ?? pickDistribution(env.KNORVIA_TELEMETRY_RUNTIME_DISTRIBUTION),
  };
  const buildCommitId = buildCommit(inputs.buildCommitId ?? env.KNORVIA_BUILD_COMMIT_ID);
  const cliVersion = versionText(inputs.cliVersion);
  const productVersion = versionText(inputs.productVersion ?? env.KNORVIA_APP_VERSION);
  const deploymentEnvironment =
    env.KNORVIA_ENV ?? env.KNORVIA_RUNTIME_ENV ?? resourceAttributes(env)[ENVIRONMENT_ATTRIBUTE];
  const installationId = normalizeInstallationId(env.KNORVIA_TELEMETRY_DEVICE_MID);
  if (buildCommitId !== undefined) resource.buildCommitId = buildCommitId;
  if (cliVersion !== undefined) resource.cliVersion = cliVersion;
  if (productVersion !== undefined) resource.productVersion = productVersion;
  if (deploymentEnvironment !== undefined) resource.deploymentEnvironment = deploymentEnvironment;
  if (installationId !== undefined) resource.installationId = installationId;
  return resource;
}

function pickSurface(value: string | undefined): ModelApiRuntimeSurface {
  const trimmed = value?.trim() as ModelApiRuntimeSurface | undefined;
  return trimmed !== undefined && SURFACES.includes(trimmed) ? trimmed : "standalone_cli";
}

function pickDistribution(
  value: string | undefined,
): TelemetryResourceContext["runtimeDistribution"] {
  const trimmed = value?.trim() as TelemetryResourceContext["runtimeDistribution"] | undefined;
  return trimmed !== undefined && DISTRIBUTIONS.includes(trimmed) ? trimmed : "unknown";
}

/** 版本号：字母数字开头，允许 `. + _ -`；不匹配时视为没有版本信息。 */
function versionText(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  return candidate !== undefined && VERSION_PATTERN.test(candidate) ? candidate : undefined;
}

/** 构建号：短十六进制前缀，统一小写。 */
function buildCommit(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  return candidate !== undefined && BUILD_PATTERN.test(candidate)
    ? candidate.toLowerCase()
    : undefined;
}

/** `OTEL_RESOURCE_ATTRIBUTES` → 键值表；解码失败保留原串。 */
/** 一对 `key=value`：只按首个 `=` 分割，键或值为空不算属性。 */
function resourceAttributeOf(item: string): readonly [string, string] | undefined {
  const cut = item.indexOf("=");
  if (cut <= 0) return undefined;
  return [percentDecoded(item.slice(0, cut).trim()), percentDecoded(item.slice(cut + 1).trim())];
}

/** `OTEL_RESOURCE_ATTRIBUTES` → 键值表；解码失败保留原串。 */
function resourceAttributes(env: EnvRecord): Record<string, string> {
  const pairs = (env.OTEL_RESOURCE_ATTRIBUTES ?? "")
    .split(",")
    .map(resourceAttributeOf)
    .filter((pair): pair is readonly [string, string] => pair !== undefined);
  return Object.fromEntries(pairs);
}

/** 百分号解码：失败保留原串（残缺转义不该让整条属性表崩掉）。 */
function percentDecoded(value: string): string {
  return bestEffortSync(() => decodeURIComponent(value)) ?? value;
}

/** 同步版 best effort：给不需要 await 的解码用。 */
function bestEffortSync<T>(run: () => T): T | undefined {
  try {
    return run();
  } catch {
    return undefined;
  }
}
