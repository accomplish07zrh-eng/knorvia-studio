// SPDX-License-Identifier: Apache-2.0
// 身份键遵守既有 remote:ssh/wsl/docker 文法；实际 IO 路径仍由调用方保管。
// 迁移契约与来源暴露记录：specs/knorvia-remote-identity-helpers-20260930.md。
import type { RemoteTarget } from "./remoteTarget.js";

const IDENTITY_KINDS = ["ssh", "wsl", "docker"] as const;

export type RemoteWorkspaceIdentityKind = (typeof IDENTITY_KINDS)[number];

type ParsedKindField = { kind: RemoteWorkspaceIdentityKind };

export interface ParsedRemoteWorkspaceIdentity
  extends ParsedKindField, Record<"workspacePath", string> {}

/* 文法表是唯一登记处：构造分支与解析分支都从 kind 取值，避免两侧字符串漂移。 */
const IDENTITY_GRAMMARS: Record<RemoteWorkspaceIdentityKind, RegExp> = {
  ssh: /^remote:ssh:[^:]+:[^:]+:[^:]+:(\/[\s\S]*)$/,
  // WSL legacy 路径以 '/' 起始，只有非 '/' 起始段才是可选 user。
  wsl: /^remote:wsl:[^:]+:(?:[^:/][^:]*:)?(\/[\s\S]*)$/,
  docker: /^remote:docker:[^:]+:(\/[\s\S]*)$/,
};

/** 反斜杠先当分隔符处理，空段丢弃，保证同一工作区只有一种身份写法。 */
const normalizeRemotePath = (workspacePath: string): string => {
  // 保持 .replace 调用形态：非字符串入参的抛错文本是既有观测行为。
  const segments = workspacePath.replace(/\\/g, "/").split("/").filter(Boolean);
  return `/${segments.join("/")}`;
};

/** SSH 主机名大小写不敏感，统一小写后入键；端口缺省 22。 */
function composeSsh(target: Extract<RemoteTarget, { kind: "ssh" }>, path: string): string {
  const authority = `${target.host.trim().toLowerCase()}:${target.port ?? 22}`;
  return `remote:ssh:${authority}:${target.username.trim()}:${path}`;
}

/** WSL 没有 user 时省略该段，保持与 legacy identity 相同的三段形态。 */
function composeWsl(target: Extract<RemoteTarget, { kind: "wsl" }>, path: string): string {
  const distro = target.distro?.trim() || "default";
  const user = target.user?.trim();
  return user ? `remote:wsl:${distro}:${user}:${path}` : `remote:wsl:${distro}:${path}`;
}

/**
 * 统一构造远程 workspace identity。Host、Main 和 UI 禁止自行拼接 authority；
 * `workspacePath` 只在这里归一后进入身份键，实际 IO 仍使用调用方原路径。
 */
export const buildRemoteWorkspaceIdentity = (
  workspacePath: string,
  target: RemoteTarget,
): string => {
  const path = normalizeRemotePath(workspacePath);
  if (target.kind === "ssh") return composeSsh(target, path);
  if (target.kind === "wsl") return composeWsl(target, path);
  if (target.kind === "docker") return `remote:docker:${target.container}:${path}`;
  // 本地目标没有远端身份键；返回 undefined 让调用方按本地 workspacePath 处理。
  return undefined as unknown as string;
};

/**
 * 解析远程 workspace identity；非法/非远程 identity 返回 null（调用方回落
 * 「按本地 workspacePath 处理」）。只提取 workspacePath——authority 细节
 * （host/port 等）对消费方无意义，不透出。
 */
export const parseRemoteWorkspaceIdentity = (
  identity: string,
): ParsedRemoteWorkspaceIdentity | null => {
  if (!identity.startsWith("remote:")) return null;
  for (const kind of IDENTITY_KINDS) {
    const match = IDENTITY_GRAMMARS[kind].exec(identity);
    if (match) return { kind, workspacePath: match[1]! };
  }
  return null;
};

/** identity 是否是远程 workspace identity（可被 parseRemoteWorkspaceIdentity 解析）。 */
export function isRemoteWorkspaceIdentity(identity: string): boolean {
  return Boolean(parseRemoteWorkspaceIdentity(identity));
}
