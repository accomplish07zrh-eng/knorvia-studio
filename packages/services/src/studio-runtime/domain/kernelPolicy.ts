import type { StudioKernelCapabilities, StudioKernelId, StudioPermission } from "../kernelTypes.js";

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

export function kernelCapabilities(id: StudioKernelId): StudioKernelCapabilities {
  return {
    resume: id === "knorvia" || id === "antigravity" || isManagedKernel(id),
    approval: id === "knorvia" || isManagedKernel(id),
    questions: id === "knorvia" || isManagedKernel(id),
    readOnly: id === "codex",
    fullAccess: id === "knorvia" || id === "antigravity" || isManagedKernel(id),
  };
}

export function assertKernelPermission(id: StudioKernelId, permission: StudioPermission): void {
  if (!["read-only", "ask", "full-access"].includes(permission)) throw new Error("未知执行权限");
  if (permission === "read-only" && !kernelCapabilities(id).readOnly) {
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
