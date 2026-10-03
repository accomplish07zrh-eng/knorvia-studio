import type { KnorviaAgentMcpServer, KnorviaSessionStateSnapshot } from "@knorvia/shared";
import type { KnorviaSessionCreateParams, KnorviaSessionResumeParams } from "./session.js";
import type { CuaProductMcpServerResolver } from "#src/cua-permission-broker/index.js";
import { appendWorkspaceToFilesystemMcpServers } from "#src/session/mcpWorkspaceScope.js";

interface SessionMcpPorts {
  creationMcpServer?: (workspacePath: string) => Promise<KnorviaAgentMcpServer>;
  cuaProductMcpServerResolver?: CuaProductMcpServerResolver;
}

/** Prepare one invocation; supplied configuration remains owned by its caller. */
export async function prepareSessionInvocation<
  T extends KnorviaSessionCreateParams | KnorviaSessionResumeParams,
>(input: T, ports: SessionMcpPorts): Promise<T> {
  let creation: KnorviaAgentMcpServer | undefined;
  if (!input.workspaceIdentity && !input.remoteSessionId) {
    creation = await ports.creationMcpServer?.(input.workspacePath);
  }

  let supplied = input.mcpServers;
  if (creation) {
    const replacement = creation;
    const retained: KnorviaAgentMcpServer[] = [];
    supplied?.forEach((server) => {
      if (server.name !== replacement.name) retained.push(server);
    });
    retained.push(creation);
    supplied = retained;
  }

  const scoped = appendWorkspaceToFilesystemMcpServers(supplied, input.workspacePath);
  const effective = ports.cuaProductMcpServerResolver
    ? await ports.cuaProductMcpServerResolver.resolveMcpServers(scoped, {
        workspacePath: input.workspacePath,
      })
    : scoped;
  return effective === input.mcpServers ? input : { ...input, mcpServers: effective };
}

/** null means no finite advertised choices; an empty set means disabled. */
export function sessionThoughtLevelChoices(
  snapshot: KnorviaSessionStateSnapshot,
): Set<string> | null {
  const capability = snapshot.settings.thoughtLevel;
  if (!capability.enabled) return new Set();
  const advertised: readonly unknown[] = Array.isArray(capability.available)
    ? capability.available
    : [];
  if (advertised.length === 0) return null;

  const choices = new Set<string>();
  advertised.forEach((entry) => {
    let raw: unknown = entry;
    if (typeof entry === "object" && entry !== null && "value" in entry) {
      raw = entry.value;
    }
    if (typeof raw === "string") {
      const value = raw.trim();
      if (value) choices.add(value);
    }
  });
  return choices.size === 0 ? null : choices;
}

export function sessionSnapshotDiagnostics(snapshot: KnorviaSessionStateSnapshot) {
  // 日志只观测已经校验的结果；partial mock 缺少数组时不能中断历史恢复。
  const messages = Array.isArray(snapshot.messages) ? snapshot.messages : [];
  const pending = Array.isArray(snapshot.runtime.pendingRequestIds)
    ? snapshot.runtime.pendingRequestIds
    : [];
  return {
    activeTurnId: snapshot.runtime.activeTurnId ?? null,
    eventSeq: snapshot.runtime.eventSeq,
    messageCount: messages.length,
    pendingRequestCount: pending.length,
    sessionStatus: snapshot.session.status,
    stateRevision: snapshot.runtime.stateRevision,
  };
}
