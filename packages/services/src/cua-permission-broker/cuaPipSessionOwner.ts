import type { PipSessionEvent } from "@knorvia/cua/pip-session";
import type { PipSessionClient, PipSessionClientOptions } from "@knorvia/cua/pip-session/node";
import type { ServiceLogger } from "../logger/serviceLogger.js";
import type { CuaPipSessionService } from "./cuaPipSession.js";

type SkipReason =
  | "service-disabled"
  | "service-disposed"
  | "credentials-unavailable"
  | "transport-disabled";

type ClientResolution =
  | { client: PipSessionClient; skipReason?: never }
  | { client: null; skipReason: SkipReason };

type PendingTurn = {
  event: Extract<PipSessionEvent, { kind: "turn-started" }>;
  turnId: string;
};

export function createCuaPipSessionOwner(
  options: {
    enabled: boolean;
    resolveCredentials: () => Promise<{ socketPath: string } | undefined>;
    createClient?: (options: PipSessionClientOptions) => PipSessionClient;
    logger?: ServiceLogger;
  },
  ports: {
    createClient: (options: PipSessionClientOptions) => PipSessionClient;
    createLogger: () => ServiceLogger;
    eventLogContext: (event: PipSessionEvent) => Record<string, unknown>;
  },
): CuaPipSessionService {
  const logger = options.logger ?? ports.createLogger();
  const clientFactory = options.createClient ?? ports.createClient;
  let current: { key: string; client: PipSessionClient } | null = null;
  let quarantinedKey: string | null = null;
  let tail: Promise<void> = Promise.resolve();
  let disposed = false;
  let pending: PendingTurn | null = null;
  let replayTimer: ReturnType<typeof setTimeout> | null = null;
  let replayDeadline = 0;

  function cancelReplayTimer(): void {
    if (replayTimer !== null) {
      clearTimeout(replayTimer);
      replayTimer = null;
    }
  }

  async function getClient(): Promise<ClientResolution> {
    if (!options.enabled) {
      return { client: null, skipReason: "service-disabled" };
    }
    if (disposed) {
      return { client: null, skipReason: "service-disposed" };
    }
    const credentials = await options.resolveCredentials();
    if (!credentials) {
      return { client: null, skipReason: "credentials-unavailable" };
    }
    const key = credentials.socketPath;
    if (quarantinedKey === key) {
      return { client: null, skipReason: "transport-disabled" };
    }
    if (current?.key === key) {
      return { client: current.client };
    }
    current?.client.close();
    const client = clientFactory({
      socketPath: credentials.socketPath,
      onDiagnostic: (diagnostic) => {
        const message = `[cua-pip-session] ${diagnostic.code}: ${diagnostic.message}`;
        if (diagnostic.code === "version_mismatch") {
          logger.warn(undefined, message);
        } else {
          logger.debug(undefined, message);
        }
      },
    });
    current = { key, client };
    try {
      await client.connect();
      return { client };
    } catch (error) {
      if (current?.client === client) {
        current = null;
      }
      client.close();
      if ((error as { code?: unknown }).code === "version_mismatch") {
        quarantinedKey = key;
      }
      throw error;
    }
  }

  function scheduleReplay(): void {
    cancelReplayTimer();
    if (disposed || pending === null) {
      return;
    }
    if (Date.now() >= replayDeadline) {
      logger.warn(undefined, "[cua-pip-session] deferred turn-started expired before transport", {
        ...ports.eventLogContext(pending.event),
      });
      pending = null;
      return;
    }
    replayTimer = setTimeout(() => {
      replayTimer = null;
      if (disposed || pending === null) {
        return;
      }
      const operation = tail.then(async () => {
        if (disposed || pending === null) {
          return;
        }
        let resolution: ClientResolution;
        try {
          resolution = await getClient();
        } catch {
          scheduleReplay();
          return;
        }
        if (resolution.client === null) {
          scheduleReplay();
          return;
        }
        const replay = pending!;
        pending = null;
        try {
          const acknowledgement = await resolution.client.send(replay.event);
          logger.info(undefined, "[cua-pip-session] replayed deferred turn-started", {
            ...ports.eventLogContext(replay.event),
            applied: acknowledgement.applied,
            reason: acknowledgement.reason,
          });
        } catch (error) {
          logger.warn(undefined, "[cua-pip-session] replay of deferred turn-started failed", {
            ...ports.eventLogContext(replay.event),
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        }
      });
      tail = operation;
    }, 250);
    replayTimer.unref?.();
  }

  function publish(event: PipSessionEvent): Promise<void> {
    if (disposed) {
      return Promise.resolve();
    }
    const operation = tail.then(async () => {
      try {
        const resolution = await getClient();
        if (resolution.client === null) {
          const { skipReason } = resolution;
          if (skipReason === "credentials-unavailable" || skipReason === "transport-disabled") {
            if (event.kind === "turn-started") {
              pending = { event, turnId: event.turnId };
              replayDeadline = Date.now() + 30_000;
              scheduleReplay();
            } else if (
              (event.kind === "turn-ended" || event.kind === "session-closed") &&
              pending !== null &&
              ("turnId" in event
                ? pending.turnId === event.turnId
                : pending.event.sessionId === event.sessionId)
            ) {
              pending = null;
              cancelReplayTimer();
            }
            logger.warn(undefined, "[cua-pip-session] event delivery skipped", {
              ...ports.eventLogContext(event),
              skipReason,
            });
          } else {
            logger.warn(undefined, "[cua-pip-session] event delivery dropped", {
              ...ports.eventLogContext(event),
              skipReason,
            });
          }
          return;
        }
        const client = resolution.client;
        cancelReplayTimer();
        const replay = event.kind === "turn-started" ? null : pending;
        pending = null;
        if (replay !== null) {
          try {
            const acknowledgement = await client.send(replay.event);
            logger.info(undefined, "[cua-pip-session] replayed deferred turn-started", {
              ...ports.eventLogContext(replay.event),
              applied: acknowledgement.applied,
              reason: acknowledgement.reason,
            });
          } catch (error) {
            logger.warn(undefined, "[cua-pip-session] replay of deferred turn-started failed", {
              ...ports.eventLogContext(replay.event),
              errorMessage: error instanceof Error ? error.message : String(error),
            });
          }
        }
        const acknowledgement = await client.send(event);
        logger.info(undefined, "[cua-pip-session] event delivery acknowledged", {
          ...ports.eventLogContext(event),
          applied: acknowledgement.applied,
          reason: acknowledgement.reason,
        });
      } catch (error) {
        logger.warn(undefined, "[cua-pip-session] event delivery failed", {
          ...ports.eventLogContext(event),
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    });
    tail = operation;
    return operation;
  }

  function dispose(): void {
    disposed = true;
    cancelReplayTimer();
    pending = null;
    current?.client.close();
    current = null;
  }

  return { publishFocus: publish, publishLifecycle: publish, dispose };
}
