import type { StudioKernelCapabilities, StudioKernelId, StudioPermission } from "../kernelTypes.js";
import {
  assessKernelCapabilities,
  type StudioCapabilityAssessment,
  type StudioCapabilityId,
} from "./capabilityMatrix.js";

/** Fixed candidates are only the bundled catalog. Explicit ACP manifests add `acp:<slug>` IDs. */
export const MANAGED_KERNELS = ["codex", "claude-code", "grok-build"] as const;
export type ManagedKernelId = (typeof MANAGED_KERNELS)[number];
export const EXTERNAL_KERNELS = [
  ...MANAGED_KERNELS,
  "opencode",
  "qoder",
  "qoder-cn",
  "gemini-cli",
  "antigravity",
  "goose",
  "kimi-cli",
  "copilot",
  "hermes",
  "qwen-code",
  "mistral-vibe",
  "deepseek-harness",
] as const;
export type KnownExternalKernel = (typeof EXTERNAL_KERNELS)[number];
export type ExternalKernel = KnownExternalKernel | `acp:${string}`;
export function isManagedKernel(id: StudioKernelId): id is ManagedKernelId {
  return MANAGED_KERNELS.some((item) => item === id);
}

/**
 * 五能力来自 `domain/capabilityMatrix.ts` 的版本化表；未知版本沿用既有声明，已知但未核验的版本失败关闭。
 */
export function kernelCapabilities(id: StudioKernelId, version?: string): StudioKernelCapabilities {
  return capabilityAssessment(id, version).capabilities;
}

/** 与 `kernelCapabilities` 同源，但保留证据等级供发现层与权限断言区分未核验/不支持/用户例外。 */
export function capabilityAssessment(
  id: StudioKernelId,
  version?: string,
  exception?: { capability: StudioCapabilityId; reason?: string },
): StudioCapabilityAssessment {
  return assessKernelCapabilities({
    kernel: id,
    ...(version ? { version } : {}),
    ...(exception ? { exception } : {}),
  });
}

export function assertKernelPermission(
  id: StudioKernelId,
  permission: StudioPermission,
  options?: { version?: string; exception?: { capability: StudioCapabilityId; reason?: string } },
): void {
  if (!["read-only", "ask", "full-access"].includes(permission)) throw new Error("未知执行权限");
  const assessment = capabilityAssessment(id, options?.version, options?.exception);
  if (permission === "read-only" && !assessment.capabilities.readOnly) {
    throw new Error(`${id} 当前接入不能保证强制只读，请选择询问模式；不会自动放宽权限`);
  }
}

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
export function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
export function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
export function safeDetail(value: unknown): string {
  const result = typeof value === "string" ? value : JSON.stringify(value ?? {});
  return result
    .replace(/(Bearer\s+)[^\s"']+/gi, "$1[redacted]")
    .replace(
      /((?:api[_-]?key|access[_-]?token|authorization)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi,
      "$1[redacted]",
    )
    .slice(0, 24_000);
}
export function errorText(error: unknown): string {
  return safeDetail(error instanceof Error ? error.message : String(error));
}
export function versionFrom(output: string): string | undefined {
  return output.match(/\b\d+\.\d+\.\d+(?:-[\w.-]+)?\b/)?.[0];
}

export function validVersion(value: unknown): string {
  const version = text(value).trim();
  if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version))
    throw new Error("下载源返回了无效版本号");
  return version;
}
