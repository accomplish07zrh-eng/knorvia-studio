// SPDX-License-Identifier: Apache-2.0
import type { RemoteTarget } from "../remoteTarget.js";

export type RemoteWorkspaceIdentityKind = "ssh" | "wsl" | "docker";

export interface ParsedRemoteWorkspaceIdentity {
  kind: RemoteWorkspaceIdentityKind;
  workspacePath: string;
}

const IDENTITY_GRAMMARS: readonly [RemoteWorkspaceIdentityKind, RegExp][] = [
  ["ssh", /^remote:ssh:[^:]+:[^:]+:[^:]+:(\/[\s\S]*)$/],
  ["wsl", /^remote:wsl:[^:]+:(?:[^:/][^:]*:)?(\/[\s\S]*)$/],
  ["docker", /^remote:docker:[^:]+:(\/[\s\S]*)$/],
];

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

export function parseRemoteWorkspaceIdentity(
  identity: string,
): ParsedRemoteWorkspaceIdentity | null {
  if (!identity.startsWith("remote:")) {
    return null;
  }
  for (const [kind, grammar] of IDENTITY_GRAMMARS) {
    const match = grammar.exec(identity);
    if (match && match[1]) {
      return { kind, workspacePath: match[1] };
    }
  }
  return null;
}

export function isRemoteWorkspaceIdentity(identity: string): boolean {
  return parseRemoteWorkspaceIdentity(identity) !== null;
}
