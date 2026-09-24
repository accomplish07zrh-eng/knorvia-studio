import type { KnorviaSessionStateSnapshot } from "@knorvia/shared";
import type {
  KnorviaSessionWorkspaceTarget,
  KnorviaTaskTarget,
} from "#src/agent-session/session.js";

function getWorkspaceKey(target: KnorviaSessionWorkspaceTarget): string {
  return target.workspaceIdentity?.trim() || target.workspacePath;
}

function getSessionScopedKey(target: KnorviaTaskTarget): string {
  return `${getWorkspaceKey(target)}\0${target.sessionId}`;
}

export function createKnorviaDeferredDraftRegistry() {
  const sessionKeys = new Set<string>();

  return {
    remember(params: KnorviaSessionWorkspaceTarget, snapshot: KnorviaSessionStateSnapshot): void {
      sessionKeys.add(
        getSessionScopedKey({
          workspacePath: snapshot.session.workspace.workspacePath,
          workspaceIdentity:
            snapshot.session.workspace.workspaceIdentity ?? params.workspaceIdentity,
          sessionId: snapshot.session.sessionId,
        }),
      );
    },

    has(target: KnorviaTaskTarget): boolean {
      return sessionKeys.has(getSessionScopedKey(target));
    },

    forget(target: KnorviaTaskTarget): void {
      sessionKeys.delete(getSessionScopedKey(target));
    },
  };
}
