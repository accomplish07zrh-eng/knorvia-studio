import type { LocalStudioKernelId, StudioKernelId } from "../kernelTypes.js";
import { parseRemoteStudioKernelId } from "./remoteAgentIdentity.js";

/** Known agents remain addressable even when their CLI is not installed. */
export const STUDIO_KERNEL_IDS: readonly LocalStudioKernelId[] = [
  "knorvia",
  "codex",
  "claude-code",
  "grok-build",
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
];

/** A custom ACP manifest uses a namespaced, bounded identity; no path is accepted here. */
export function isLocalStudioKernelId(value: unknown): value is LocalStudioKernelId {
  return (
    typeof value === "string" &&
    (STUDIO_KERNEL_IDS.includes(value as LocalStudioKernelId) ||
      /^acp:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(value))
  );
}

export function isStudioKernelId(value: unknown): value is StudioKernelId {
  return isLocalStudioKernelId(value) || parseRemoteStudioKernelId(value) !== null;
}
