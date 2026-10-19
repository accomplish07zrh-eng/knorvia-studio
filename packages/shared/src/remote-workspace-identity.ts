// 身份键遵守既有 remote:ssh/wsl/docker 文法；实际 IO 路径仍由调用方保管。
// 迁移契约与来源暴露记录：specs/knorvia-remote-identity-helpers-20260930.md。
// 保留仓库 Apache-2.0 与 NOTICE，文法/字段兼容不代表来源已闭合。
import type { RemoteTarget } from "./remoteTarget.js";

export type RemoteWorkspaceIdentityKind = "ssh" | "wsl" | "docker";

export interface ParsedRemoteWorkspaceIdentity {
  kind: RemoteWorkspaceIdentityKind;
  /** 远端真实路径（posix 归一形态）。 */
  workspacePath: string;
}

// authority 仅要求非空；路径从首个 '/' 起完整保留，包括冒号及换行。
// WSL legacy 路径以 '/' 起始，只有非 '/' 起始段能成为可选 user。
const IDENTITY_GRAMMARS: readonly [RemoteWorkspaceIdentityKind, RegExp][] = [
  ["ssh", /^remote:ssh:[^:]+:[^:]+:[^:]+:(\/[\s\S]*)$/],
  ["wsl", /^remote:wsl:[^:]+:(?:[^:/][^:]*:)?(\/[\s\S]*)$/],
  ["docker", /^remote:docker:[^:]+:(\/[\s\S]*)$/],
];

/**
 * 统一构造远程 workspace identity。Host、Main 和 UI 禁止自行拼接 authority；
 * `workspacePath` 只在这里归一后进入身份键，实际 IO 仍使用调用方原路径。
 */
export function buildRemoteWorkspaceIdentity(workspacePath: string, target: RemoteTarget): string {
  const pathSegments = workspacePath.replace(/\\/g, "/").split("/").filter(Boolean);
  const normalizedPath = `/${pathSegments.join("/")}`;
  switch (target.kind) {
    case "ssh":
      return `remote:ssh:${target.host.trim().toLowerCase()}:${target.port ?? 22}:${target.username.trim()}:${normalizedPath}`;
    case "wsl": {
      const distro = target.distro?.trim() || "default";
      const user = target.user?.trim();
      return user
        ? `remote:wsl:${distro}:${user}:${normalizedPath}`
        : `remote:wsl:${distro}:${normalizedPath}`;
    }
    case "docker":
      return `remote:docker:${target.container}:${normalizedPath}`;
  }
}

/**
 * 解析远程 workspace identity；非法/非远程 identity 返回 null（调用方回落
 * 「按本地 workspacePath 处理」）。只提取 workspacePath——authority 细节
 * （host/port 等）对消费方（CLI 运行在远端机器上）无意义，不透出。
 */
export function parseRemoteWorkspaceIdentity(
  identity: string,
): ParsedRemoteWorkspaceIdentity | null {
  if (!identity.startsWith("remote:")) {
    return null;
  }
  for (const [kind, grammar] of IDENTITY_GRAMMARS) {
    const match = grammar.exec(identity);
    if (match) {
      return { kind, workspacePath: match[1]! };
    }
  }
  return null;
}

/** identity 是否是远程 workspace identity（可被 parseRemoteWorkspaceIdentity 解析）。 */
export function isRemoteWorkspaceIdentity(identity: string): boolean {
  return parseRemoteWorkspaceIdentity(identity) !== null;
}
