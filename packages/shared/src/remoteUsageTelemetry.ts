import type { RemoteTarget } from "./remoteTarget.js";

import type { TelemetryEventPayload } from "./telemetry.js";

import {
  parseRemoteWorkspaceIdentity,
  type RemoteWorkspaceIdentityKind,
} from "./remote-workspace-identity.js";

export function resolveWorkspaceTelemetryDetail(scope: {
  workspaceIdentity?: string | null;
  remoteSessionId?: string | null;
}): {
  workspace_kind: "local" | "remote";
  remote_kind: RemoteWorkspaceIdentityKind | "";
} {
  const identity = scope.workspaceIdentity?.trim();
  return {
    workspace_kind: identity || scope.remoteSessionId?.trim() ? "remote" : "local",
    remote_kind: identity ? (parseRemoteWorkspaceIdentity(identity)?.kind ?? "") : "",
  };
}

export type RemoteUsageRemoteKind = RemoteTarget["kind"];

export type RemoteUsageWorkspaceKind = "local" | "remote";

export type RemoteUsageResult = "success" | "failure";

export type RemoteWorkspaceConnectTrigger = "new" | "reconnect" | "restore";

export type RemoteUsageErrorCategory =
  | "auth"
  | "connect"
  | "deploy"
  | "host_start"
  | "attach"
  | "relay"
  | "unknown";

export function buildRemoteWorkspaceConnectResultTelemetry(input: {
  result: RemoteUsageResult;
  remoteKind: RemoteUsageRemoteKind;
  connectTrigger: RemoteWorkspaceConnectTrigger;
  errorCategory?: RemoteUsageErrorCategory;
}): TelemetryEventPayload {
  return {
    elementName: "remote_workspace_connect_result",
    eventRegion: "remote_workspace",
    eventType: "result",
    eventExtraDetail: {
      result: input.result,
      remote_kind: input.remoteKind,
      connect_trigger: input.connectTrigger,
      error_category: input.result === "success" ? "" : (input.errorCategory ?? "unknown"),
    },
  };
}

export function classifyRemoteUsageError(error: unknown): RemoteUsageErrorCategory {
  let text = "";
  if (typeof error === "string") {
    text = error.toLowerCase();
  } else if (typeof error === "object" && error !== null) {
    const code = "code" in error ? String(error.code ?? "") : "";
    const message = "message" in error ? String(error.message ?? "") : "";
    text = (code + " " + message).toLowerCase();
  }

  if (/(auth|password|credential|token|permission|denied|unauthor)/.test(text)) {
    return "auth";
  }
  if (/(deploy|download|install|asset|checksum)/.test(text)) {
    return "deploy";
  }
  if (/(host_start|host start|spawn|process.*(?:exit|start)|host.*(?:exit|start))/.test(text)) {
    return "host_start";
  }
  if (
    /(attach|desktop_host_missing|workspace.*(?:identity|missing|mismatch)|remote_session)/.test(
      text,
    )
  ) {
    return "attach";
  }
  if (/(relay|websocket|web socket|pair|device.*(?:kicked|not.found))/.test(text)) {
    return "relay";
  }
  if (/(connect|network|socket|ssh|wsl|docker|server|timeout|timedout|econn)/.test(text)) {
    return "connect";
  }
  return "unknown";
}
