import type { PipSessionEvent } from "@knorvia/cua/pip-session";
import {
  createPipSessionClient,
  type PipSessionClient,
  type PipSessionClientOptions,
} from "@knorvia/cua/pip-session/node";
import { createServiceLogger, type ServiceLogger } from "../logger/serviceLogger.js";
import type { CuaPipSessionService } from "./cuaPipSession.js";

import { createCuaPipSessionOwner } from "./cuaPipSessionOwner.js";

export interface CuaPipPresentationCredentials {
  socketPath: string;
}

function eventLogContext(event: PipSessionEvent): Record<string, unknown> {
  if (event.kind === "focus-changed") {
    return {
      kind: event.kind,
      revision: event.revision,
      sessionId: event.sessionId,
      sourceWindowId: event.sourceWindowId,
    };
  }
  return {
    eventId: event.eventId,
    kind: event.kind,
    sequenceNumber: event.sequenceNumber,
    sessionId: event.sessionId,
    ...(event.kind === "session-closed" ? {} : { turnId: event.turnId }),
    ...(event.kind === "turn-ended" ? { outcome: event.outcome } : {}),
  };
}

export function createCuaPipSessionService(options: {
  enabled: boolean;
  resolveCredentials: () => Promise<CuaPipPresentationCredentials | undefined>;
  createClient?: (options: PipSessionClientOptions) => PipSessionClient;
  logger?: ServiceLogger;
}): CuaPipSessionService {
  return createCuaPipSessionOwner(options, {
    createClient: createPipSessionClient,
    createLogger: () => createServiceLogger("cua-pip-session"),
    eventLogContext,
  });
}
