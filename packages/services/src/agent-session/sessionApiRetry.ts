import {
  normalizeKnorviaApiRetryStatus,
  isKnorviaModelRetryRecoveryProgressPayload,
  resolveWorkspaceKey,
  type KnorviaSessionApiRetryStatus,
  type KnorviaSessionStateSnapshot,
  knorviaApiRetryFromModelNetworkStatusPayload,
  knorviaApiRetryFromStreamRecoveryPayload,
} from "@knorvia/shared";
import type { KnorviaSessionServiceEvent, KnorviaTaskTarget } from "#src/agent-session/session.js";

export function createKnorviaSessionApiRetryRuntimeTracker(): {
  trackApiRetryFromSessionEvent: (
    params: KnorviaTaskTarget,
    event: KnorviaSessionServiceEvent,
  ) => KnorviaSessionServiceEvent;
  withApiRetryRuntime: (snapshot: KnorviaSessionStateSnapshot) => KnorviaSessionStateSnapshot;
} {
  const apiRetryBySession = new Map<string, KnorviaSessionApiRetryStatus | null>();

  function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  function apiRetryFromPayload(
    payload: Record<string, unknown>,
  ): KnorviaSessionApiRetryStatus | null | undefined {
    if ("apiRetry" in payload) {
      return normalizeKnorviaApiRetryStatus(payload.apiRetry);
    }

    const runtimeRetry = normalizeKnorviaApiRetryStatus(asRecord(payload.runtime).apiRetry);
    if (runtimeRetry !== undefined) {
      return runtimeRetry;
    }

    const metadataRetry = normalizeKnorviaApiRetryStatus(
      asRecord(asRecord(payload._meta).knorvia).apiRetry,
    );
    if (metadataRetry !== undefined) {
      return metadataRetry;
    }

    return (
      knorviaApiRetryFromStreamRecoveryPayload(payload) ??
      knorviaApiRetryFromModelNetworkStatusPayload(payload)
    );
  }

  function sessionKey(params: KnorviaTaskTarget): string {
    return `${resolveWorkspaceKey(params)}\0${params.sessionId}`;
  }

  function trackApiRetryFromSessionEvent(
    params: KnorviaTaskTarget,
    event: KnorviaSessionServiceEvent,
  ): KnorviaSessionServiceEvent {
    if (
      event.type === "session.event" &&
      (event.event.type === "session.updated" || event.event.type === "streamRecovery.updated")
    ) {
      const apiRetry = apiRetryFromPayload(asRecord(event.event.payload));
      const key = sessionKey({
        workspacePath: params.workspacePath,
        workspaceIdentity: params.workspaceIdentity,
        sessionId: event.event.sessionId,
      });

      if (apiRetry !== undefined) {
        apiRetryBySession.set(key, apiRetry);
      } else if (
        apiRetryBySession.get(key) != null &&
        isKnorviaModelRetryRecoveryProgressPayload(asRecord(event.event.payload))
      ) {
        apiRetryBySession.set(key, null);
      }

      return event;
    }

    if (event.type === "snapshot") {
      return { ...event, snapshot: withApiRetryRuntime(event.snapshot) };
    }

    return event;
  }

  function withApiRetryRuntime(snapshot: KnorviaSessionStateSnapshot): KnorviaSessionStateSnapshot {
    const sessionId = snapshot.session?.sessionId;
    const workspacePath = snapshot.session?.workspace?.workspacePath;
    if (!sessionId || !workspacePath) {
      return snapshot;
    }

    const key = sessionKey({
      workspacePath,
      workspaceIdentity: snapshot.session.workspace.workspaceIdentity,
      sessionId,
    });

    if (snapshot.runtime?.apiRetry !== undefined) {
      apiRetryBySession.set(key, snapshot.runtime.apiRetry);
      return snapshot;
    }

    if (snapshot.session.status === "completed" || snapshot.session.status === "error") {
      apiRetryBySession.set(key, null);
      return {
        ...snapshot,
        runtime: { ...snapshot.runtime, apiRetry: null },
      };
    }

    if (!apiRetryBySession.has(key)) {
      return snapshot;
    }

    return {
      ...snapshot,
      runtime: { ...snapshot.runtime, apiRetry: apiRetryBySession.get(key) ?? null },
    };
  }

  return { trackApiRetryFromSessionEvent, withApiRetryRuntime };
}
