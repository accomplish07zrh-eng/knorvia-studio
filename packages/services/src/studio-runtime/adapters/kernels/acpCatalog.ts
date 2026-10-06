import type { ExternalKernel, KnownExternalKernel } from "../../domain/kernelPolicy.js";

export interface KernelDescriptor {
  id: ExternalKernel;
  displayName: string;
  executableName: string;
  /** 同一官方安装提供的其他命令名，按顺序在主命令名之后查找（如 Qoder 的 `qodercli`）。 */
  alternateExecutableNames?: string[];
  npmPackages?: string[];
  args: string[];
  protocol: "codex" | "claude" | "grok" | "antigravity" | "acp";
  management: "studio" | "external";
  /** 启动该内核进程时附加的固定环境变量（例如关闭自动更新），不得包含凭据。 */
  environment?: Record<string, string>;
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
    alternateExecutableNames: ["qodercli"],
    npmPackages: ["@qoder-ai/qodercli"],
    args: ["--acp"],
    protocol: "acp",
    management: "external",
  },
  {
    id: "qoder-cn",
    displayName: "Qoder CN CLI",
    executableName: "qoderclicn",
    alternateExecutableNames: ["qodercn"],
    npmPackages: ["@qodercn-ai/qoderclicn"],
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
    // 原 Kimi CLI 已归档，由 Kimi Code 取代；命令与 `kimi acp` 不变，保留 ID 兼容已保存记录。
    displayName: "Kimi Code",
    executableName: "kimi",
    npmPackages: ["@moonshot-ai/kimi-code"],
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
  {
    id: "devin",
    displayName: "Devin CLI",
    executableName: "devin",
    args: ["acp"],
    protocol: "acp",
    management: "external",
  },
  {
    id: "cursor",
    displayName: "Cursor Agent",
    // 新版安装器的主命令名 `agent` 过于通用，只接受官方保留的 `cursor-agent`。
    executableName: "cursor-agent",
    args: ["acp"],
    protocol: "acp",
    management: "external",
  },
  {
    id: "factory-droid",
    displayName: "Factory Droid",
    executableName: "droid",
    npmPackages: ["droid", "@factory/cli"],
    // 官方文档与 Zed 使用 `acp`；ACP 目录中的 `acp-daemon` 有报告与 stdio MCP 不兼容。
    args: ["exec", "--output-format", "acp"],
    protocol: "acp",
    management: "external",
  },
  {
    id: "cline",
    displayName: "Cline",
    executableName: "cline",
    npmPackages: ["cline"],
    args: ["--acp"],
    protocol: "acp",
    management: "external",
  },
  {
    id: "auggie",
    displayName: "Augment Auggie",
    executableName: "auggie",
    npmPackages: ["@augmentcode/auggie"],
    args: ["--acp"],
    environment: { AUGMENT_DISABLE_AUTO_UPDATE: "1" },
    protocol: "acp",
    management: "external",
  },
  {
    id: "junie",
    displayName: "JetBrains Junie",
    executableName: "junie",
    npmPackages: ["@jetbrains/junie"],
    args: ["--acp=true"],
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
