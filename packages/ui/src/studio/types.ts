import type { StudioKernelId as ServiceKernelId, StudioKernelStatus } from "@knorvia/services";

/** The service owns kernel identity. UI metadata is a fallback until discovery completes. */
export type StudioKernelId = ServiceKernelId;

export interface StudioKernelOption {
  id: StudioKernelId;
  name: string;
  vendor: string;
  builtin: boolean;
}

export const STUDIO_KERNELS: readonly StudioKernelOption[] = [
  { id: "knorvia", name: "Knorvia", vendor: "Knorvia Studio", builtin: true },
  { id: "codex", name: "Codex", vendor: "OpenAI", builtin: false },
  { id: "claude-code", name: "Claude Code", vendor: "Anthropic", builtin: false },
  { id: "grok-build", name: "Grok Build", vendor: "xAI", builtin: false },
  { id: "opencode", name: "OpenCode", vendor: "OpenCode", builtin: false },
  { id: "qoder", name: "Qoder CLI", vendor: "Qoder", builtin: false },
  { id: "qoder-cn", name: "Qoder CN CLI", vendor: "Qoder CN", builtin: false },
  { id: "hermes", name: "Hermes Agent", vendor: "Nous Research", builtin: false },
  { id: "qwen-code", name: "Qwen Code", vendor: "Alibaba Cloud", builtin: false },
  { id: "mistral-vibe", name: "Mistral Vibe", vendor: "Mistral AI", builtin: false },
  { id: "deepseek-harness", name: "DeepSeek Harness", vendor: "DeepSeek", builtin: false },
  { id: "gemini-cli", name: "Gemini CLI", vendor: "Google", builtin: false },
  { id: "antigravity", name: "Google Antigravity CLI", vendor: "Google", builtin: false },
  { id: "goose", name: "Goose", vendor: "Block", builtin: false },
  { id: "kimi-cli", name: "Kimi CLI", vendor: "Moonshot AI", builtin: false },
  { id: "copilot", name: "GitHub Copilot CLI", vendor: "GitHub", builtin: false },
];

const CUSTOM_KERNEL_ID = /^acp:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const knownIds = new Set<string>(STUDIO_KERNELS.map((kernel) => kernel.id));

export function isStudioKernelId(value: unknown): value is StudioKernelId {
  if (typeof value !== "string") return false;
  if (knownIds.has(value) || CUSTOM_KERNEL_ID.test(value)) return true;
  const remote = /^ssh:[a-f0-9]{24}:(.+)$/.exec(value);
  return Boolean(remote && (knownIds.has(remote[1]!) || CUSTOM_KERNEL_ID.test(remote[1]!)));
}

export function studioKernelOption(
  id: StudioKernelId,
  statuses: readonly StudioKernelStatus[] = [],
): StudioKernelOption {
  const fallback = STUDIO_KERNELS.find((kernel) => kernel.id === id);
  const status = statuses.find((item) => item.id === id);
  const candidate = status?.displayName?.trim();
  const remote = /^ssh:([a-f0-9]{24}):(.+)$/.exec(id);
  const remoteBase = remote ? STUDIO_KERNELS.find((kernel) => kernel.id === remote[2]) : undefined;
  return {
    id,
    name: candidate && candidate.length <= 120
      ? candidate
      : remote ? `${remoteBase?.name ?? remote[2]} · SSH ${remote[1]!.slice(0, 6)}`
      : (fallback?.name ?? id.slice(4)),
    vendor: status?.remoteEnvironmentLabel ?? fallback?.vendor ?? remoteBase?.vendor ?? "Local ACP",
    builtin: id === "knorvia",
  };
}

/** Stable known order, followed by discovered custom adapters and retained selections. */
export function studioKernelOptions(
  statuses: readonly StudioKernelStatus[] = [],
  retained: readonly StudioKernelId[] = [],
): StudioKernelOption[] {
  const ids = new Set<StudioKernelId>(STUDIO_KERNELS.map((kernel) => kernel.id));
  for (const status of statuses) if (isStudioKernelId(status.id)) ids.add(status.id);
  for (const id of retained) if (isStudioKernelId(id)) ids.add(id);
  return [...ids].map((id) => studioKernelOption(id, statuses));
}

/** Creation controls remain quiet: built-in, installed and explicitly retained choices only. */
export function studioSelectableKernelOptions(
  statuses: readonly StudioKernelStatus[] = [],
  retained: readonly StudioKernelId[] = [],
): StudioKernelOption[] {
  return studioKernelOptions(statuses, retained).filter(
    (kernel) =>
      kernel.builtin ||
      retained.includes(kernel.id) ||
      statuses.some((status) => status.id === kernel.id && status.installed),
  );
}

/** Only the original three CLI adapters have a Studio-managed install lifecycle. */
export function studioManagesKernel(id: StudioKernelId, status?: StudioKernelStatus): boolean {
  return (
    !id.startsWith("ssh:") &&
    (status?.management === "studio" || id === "codex" || id === "claude-code" || id === "grok-build")
  );
}
