import type { ExternalKernel, KnownExternalKernel } from "../../domain/kernelPolicy.js";

export interface KernelDescriptor {
  id: ExternalKernel;
  displayName: string;
  executableName: string;
  npmPackages?: string[];
  args: string[];
  protocol: "codex" | "claude" | "grok" | "antigravity" | "acp";
  management: "studio" | "external";
  /** Only explicit manifests may supply an absolute custom path. */
  customPath?: string;
}

/** Source commands are verified against each vendor's official ACP documentation. */
export const BUILTIN_KERNELS: readonly KernelDescriptor[] = [
  {
    id: "codex",
    displayName: "Codex",
    executableName: "codex",
    npmPackages: ["@openai/codex"],
    args: [],
    protocol: "codex",
    management: "studio",
  },
  {
    id: "claude-code",
    displayName: "Claude Code",
    executableName: "claude",
    npmPackages: ["@anthropic-ai/claude-code"],
    args: [],
    protocol: "claude",
    management: "studio",
  },
  {
    id: "grok-build",
    displayName: "Grok Build",
    executableName: "grok",
    args: [],
    protocol: "grok",
    management: "studio",
  },
  {
    id: "opencode",
    displayName: "OpenCode",
    executableName: "opencode",
    npmPackages: ["@opencode/cli", "opencode-ai"],
    args: ["acp"],
    protocol: "acp",
    management: "external",
  },
  {
    id: "qoder",
    displayName: "Qoder CLI",
    executableName: "qoder",
    npmPackages: ["@qoder-ai/qodercli"],
    args: ["--acp"],
    protocol: "acp",
    management: "external",
  },
  {
    id: "qoder-cn",
    displayName: "Qoder CN CLI",
    executableName: "qoderclicn",
    npmPackages: ["@qodercn-ai/qoderclicn"],
    args: ["--acp"],
    protocol: "acp",
    management: "external",
  },
  {
    id: "gemini-cli",
    displayName: "Gemini CLI",
    executableName: "gemini",
    npmPackages: ["@google/gemini-cli"],
    args: ["--acp"],
    protocol: "acp",
    management: "external",
  },
  {
    id: "antigravity",
    displayName: "Google Antigravity CLI",
    executableName: "agy",
    args: [],
    protocol: "antigravity",
    management: "external",
  },
  {
    id: "goose",
    displayName: "goose",
    executableName: "goose",
    args: ["acp"],
    protocol: "acp",
    management: "external",
  },
  {
    id: "kimi-cli",
    displayName: "Kimi CLI",
    executableName: "kimi",
    args: ["acp"],
    protocol: "acp",
    management: "external",
  },
  {
    id: "copilot",
    displayName: "GitHub Copilot CLI",
    executableName: "copilot",
    npmPackages: ["@github/copilot"],
    args: ["--acp", "--stdio"],
    protocol: "acp",
    management: "external",
  },
  {
    id: "hermes",
    displayName: "Hermes Agent",
    executableName: "hermes",
    args: ["acp"],
    protocol: "acp",
    management: "external",
  },
  {
    id: "qwen-code",
    displayName: "Qwen Code",
    executableName: "qwen",
    npmPackages: ["@qwen-code/qwen-code"],
    args: ["--acp"],
    protocol: "acp",
    management: "external",
  },
  {
    id: "mistral-vibe",
    displayName: "Mistral Vibe",
    executableName: "vibe-acp",
    args: [],
    protocol: "acp",
    management: "external",
  },
  {
    id: "deepseek-harness",
    displayName: "DeepSeek Harness",
    executableName: "dsh",
    npmPackages: ["@deepseek-ai/dsh"],
    args: ["--profile", "acp"],
    protocol: "acp",
    management: "external",
  },
] satisfies readonly KernelDescriptor[];

export const BUILTIN_KERNEL_BY_ID = new Map<ExternalKernel, KernelDescriptor>(
  BUILTIN_KERNELS.map((entry) => [entry.id, entry]),
);

export function knownDescriptor(id: KnownExternalKernel): KernelDescriptor {
  const descriptor = BUILTIN_KERNEL_BY_ID.get(id);
  if (!descriptor) throw new Error(`未知内核：${id}`);
  return descriptor;
}
