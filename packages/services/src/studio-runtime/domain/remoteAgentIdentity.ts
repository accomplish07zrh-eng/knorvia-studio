import type { LocalStudioKernelId } from "../kernelTypes.js";

const REMOTE_ID = /^ssh:([a-f0-9]{24}):(.+)$/;
const LOCAL_ID =
  /^(?:knorvia|codex|claude-code|grok-build|opencode|qoder|qoder-cn|gemini-cli|antigravity|goose|kimi-cli|copilot|hermes|qwen-code|mistral-vibe|deepseek-harness|acp:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)$/;

export function parseRemoteStudioKernelId(
  value: unknown,
): { workspaceKey: string; kernel: LocalStudioKernelId } | null {
  if (typeof value !== "string") return null;
  const match = REMOTE_ID.exec(value);
  if (!match || !LOCAL_ID.test(match[2]!)) return null;
  return { workspaceKey: match[1]!, kernel: match[2]! as LocalStudioKernelId };
}
