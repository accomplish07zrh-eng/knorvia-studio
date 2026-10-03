import {
  CoreErrorType,
  createCoreError,
  isCoreError,
  type RepairRemoteSessionPathsInput,
  type SessionInfo,
  type SessionStorePort,
} from "@knorvia/contracts";
import { parseRemoteWorkspaceIdentity } from "@knorvia/shared";

type RemoteSessionPathRepairStore = Pick<SessionStorePort, "getSession"> & {
  repairRemoteSessionPaths?: (input: RepairRemoteSessionPathsInput) => Promise<boolean>;
};

type PathState = "clean" | "repair" | "unsafe" | "unrelated";

function classifyPath(value: string, workspacePath: string, workspaceIdentity: string): PathState {
  if (value === workspacePath) return "clean";
  const embeddedIdentity = (workspacePath === "/" ? "/" : workspacePath + "/") + workspaceIdentity;
  if (value === workspaceIdentity || value === embeddedIdentity) return "repair";
  return value.includes(workspaceIdentity) ? "unsafe" : "unrelated";
}

function corrupted(message: string, context: Record<string, unknown>) {
  return createCoreError(CoreErrorType.SessionCorrupted, message, { context, recoverable: true });
}

function pathContext(session: SessionInfo, workspaceIdentity: string | undefined) {
  return {
    directory: session.directory,
    path: session.path,
    reason: "remote_session_workspace_path_corrupted",
    sessionId: session.id,
    workspaceIdentity,
  };
}

function repairedRecord(
  session: SessionInfo,
  workspacePath: string,
  directoryState: PathState,
  pathState: PathState,
): SessionInfo {
  const result = { ...session };
  if (directoryState === "repair") result.directory = workspacePath;
  if (pathState === "repair") result.path = workspacePath;
  return result;
}

export async function repairPersistedRemoteSessionPaths(
  sessionStore: RemoteSessionPathRepairStore,
  session: SessionInfo,
  options?: { onPersistenceFailure?: (error: unknown) => void },
): Promise<SessionInfo> {
  const workspaceIdentity = session.workspaceID?.trim();
  if (!workspaceIdentity) return session;

  const parsed = parseRemoteWorkspaceIdentity(workspaceIdentity);
  if (!parsed) {
    if (!workspaceIdentity.startsWith("remote:")) return session;
    throw corrupted(
      "Persisted remote session workspace identity is invalid",
      pathContext(session, workspaceIdentity),
    );
  }

  const workspacePath = parsed.workspacePath;
  const directoryState = classifyPath(session.directory, workspacePath, workspaceIdentity);
  const pathState =
    session.path === undefined
      ? "clean"
      : classifyPath(session.path, workspacePath, workspaceIdentity);
  if (directoryState === "unsafe" || pathState === "unsafe") {
    throw corrupted(
      "Remote session workspace path is corrupted and cannot be repaired safely",
      pathContext(session, workspaceIdentity),
    );
  }
  if (directoryState !== "repair" && pathState !== "repair") return session;

  const initialRepair = repairedRecord(session, workspacePath, directoryState, pathState);
  const input: RepairRemoteSessionPathsInput = {
    sessionID: session.id,
    workspaceID: workspaceIdentity as RepairRemoteSessionPathsInput["workspaceID"],
    expectedDirectory: session.directory,
    expectedPath: session.path ?? null,
    directory: initialRepair.directory,
    path: initialRepair.path ?? null,
    timeUpdated: session.time.updated,
  };

  if (!sessionStore.repairRemoteSessionPaths) {
    options?.onPersistenceFailure?.(
      new Error("Session store does not support narrow remote path repair"),
    );
    return initialRepair;
  }

  try {
    const matched = await sessionStore.repairRemoteSessionPaths(input);
    const refreshed = await sessionStore.getSession(session.id);
    if (matched) return refreshed ?? initialRepair;
    if (!refreshed) {
      throw corrupted("Remote session disappeared during path repair", {
        reason: "remote_session_workspace_path_corrupted",
        sessionId: session.id,
        workspaceIdentity,
      });
    }

    const refreshedIdentity = refreshed.workspaceID?.trim();
    if (refreshedIdentity !== workspaceIdentity) {
      throw corrupted(
        "Remote session workspace identity changed during path repair",
        pathContext(refreshed, refreshedIdentity),
      );
    }

    const refreshedDirectoryState = classifyPath(
      refreshed.directory,
      workspacePath,
      workspaceIdentity,
    );
    const refreshedPathState =
      refreshed.path === undefined
        ? "clean"
        : classifyPath(refreshed.path, workspacePath, workspaceIdentity);
    if (refreshedDirectoryState === "unsafe" || refreshedPathState === "unsafe") {
      throw corrupted(
        "Remote session workspace path changed to an unsafe value during repair",
        pathContext(refreshed, workspaceIdentity),
      );
    }
    if (refreshedDirectoryState !== "repair" && refreshedPathState !== "repair") {
      return refreshed;
    }

    options?.onPersistenceFailure?.(new Error("Remote session path repair CAS did not match"));
    return repairedRecord(refreshed, workspacePath, refreshedDirectoryState, refreshedPathState);
  } catch (error) {
    if (isCoreError(error) && error.type === CoreErrorType.SessionCorrupted) throw error;
    options?.onPersistenceFailure?.(error);
    return initialRepair;
  }
}
