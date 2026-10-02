import { Emitter } from "@knorvia/rpc";
import {
  broadcastMessageSchema,
  hostBroadcastClaimResultMessageSchema,
  hostBroadcastEnvelopeSchema,
  HostMessageTypes,
  HostResponseTypes,
} from "@knorvia/shared";
import type {
  BroadcastClaimAcquireResult,
  BroadcastClaimLease,
  BroadcastMessage,
  IBroadcastService,
} from "./broadcast.js";

const CLAIM_TIMEOUT_MS = 2000;
const RESERVATION_TTL_MS = 5000;
const CLAIM_RETRY_MS = 250;
const LOCAL_CLAIM_LIMIT = 1024;

let requestSequence = 0;

type ParentPort = {
  postMessage(message: unknown): void;
  on(event: "message", listener: (event: { data: unknown }) => void): void;
};

type LocalClaim = {
  status: "reserved" | "committed";
  token: string;
  expiresAt: number | null;
};

type PendingClaim = {
  key: string;
  resolve: (result: BroadcastClaimAcquireResult) => void;
  timeout: ReturnType<typeof setTimeout>;
  timedOut: boolean;
  cleanupTimeout: ReturnType<typeof setTimeout> | null;
};

function nextRequestId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  requestSequence += 1;
  return `broadcast-claim-${Date.now()}-${requestSequence}`;
}

export function createBroadcastService(parentPort: ParentPort | null): IBroadcastService {
  const emitter = new Emitter<BroadcastMessage>();
  const localClaims = new Map<string, LocalClaim>();
  const pendingClaims = new Map<string, PendingClaim>();

  function pruneLocalClaims(now = Date.now()): void {
    for (const [key, claim] of localClaims) {
      if (claim.status === "reserved" && claim.expiresAt !== null && claim.expiresAt <= now) {
        localClaims.delete(key);
      }
    }
    while (localClaims.size > LOCAL_CLAIM_LIMIT) {
      const firstKey = localClaims.keys().next().value;
      if (!firstKey) break;
      localClaims.delete(firstKey);
    }
  }

  function postClaimControl(
    type:
      | typeof HostResponseTypes.BroadcastClaimCommit
      | typeof HostResponseTypes.BroadcastClaimRelease,
    lease: BroadcastClaimLease,
  ): void {
    if (!parentPort) return;
    try {
      parentPort.postMessage({
        type,
        key: lease.key,
        claimToken: lease.token,
      });
    } catch {
      // 关闭期间控制消息可能无法发送，保留无异常返回的协议行为。
    }
  }

  if (parentPort) {
    parentPort.on("message", (event) => {
      const envelope = hostBroadcastEnvelopeSchema.safeParse(event.data);
      if (envelope.success && envelope.data.type === HostMessageTypes.Broadcast) {
        emitter.fire(envelope.data.message);
        return;
      }

      const claimResult = hostBroadcastClaimResultMessageSchema.safeParse(event.data);
      if (!claimResult.success) return;
      const result = claimResult.data;
      const pending = pendingClaims.get(result.requestId);
      if (!pending) return;

      // 先撤销待响应记录，避免同步回调重入时再次处理同一申请。
      pendingClaims.delete(result.requestId);
      clearTimeout(pending.timeout);
      if (pending.cleanupTimeout) clearTimeout(pending.cleanupTimeout);

      if (pending.timedOut) {
        if (result.status === "acquired") {
          postClaimControl(HostResponseTypes.BroadcastClaimRelease, {
            key: pending.key,
            token: result.claimToken,
          });
        }
        return;
      }

      if (result.status === "acquired") {
        pending.resolve({
          status: "acquired",
          lease: { key: pending.key, token: result.claimToken },
        });
      } else if (result.status === "busy") {
        pending.resolve({ status: "busy", retryAfterMs: result.retryAfterMs });
      } else {
        pending.resolve({ status: "committed" });
      }
    });
  }

  async function send(message: BroadcastMessage): Promise<void> {
    const validated = broadcastMessageSchema.parse(message);
    emitter.fire(validated);
    parentPort?.postMessage({
      type: HostResponseTypes.Broadcast,
      message: validated,
    });
  }

  async function acquireClaim(key: string): Promise<BroadcastClaimAcquireResult> {
    const normalizedKey = key.trim();
    if (!normalizedKey) return { status: "unavailable" };

    if (!parentPort) {
      const now = Date.now();
      pruneLocalClaims(now);
      const current = localClaims.get(normalizedKey);
      if (current?.status === "committed") return { status: "committed" };
      if (current) {
        return {
          status: "busy",
          retryAfterMs: Math.max(0, Math.min(CLAIM_RETRY_MS, (current.expiresAt ?? now) - now)),
        };
      }
      const lease = { key: normalizedKey, token: `local-${nextRequestId()}` };
      localClaims.set(normalizedKey, {
        status: "reserved",
        token: lease.token,
        expiresAt: now + RESERVATION_TTL_MS,
      });
      pruneLocalClaims(now);
      return { status: "acquired", lease };
    }

    const requestId = nextRequestId();
    return new Promise<BroadcastClaimAcquireResult>((resolve) => {
      const timeout = setTimeout(() => {
        const pending = pendingClaims.get(requestId);
        if (pending) {
          pending.timedOut = true;
          pending.cleanupTimeout = setTimeout(() => {
            pendingClaims.delete(requestId);
          }, RESERVATION_TTL_MS + CLAIM_TIMEOUT_MS);
        }
        resolve({ status: "unavailable" });
      }, CLAIM_TIMEOUT_MS);

      pendingClaims.set(requestId, {
        key: normalizedKey,
        resolve,
        timeout,
        timedOut: false,
        cleanupTimeout: null,
      });
      try {
        parentPort.postMessage({
          type: HostResponseTypes.BroadcastClaimRequest,
          requestId,
          key: normalizedKey,
        });
      } catch {
        clearTimeout(timeout);
        pendingClaims.delete(requestId);
        resolve({ status: "unavailable" });
      }
    });
  }

  async function commitClaim(lease: BroadcastClaimLease): Promise<void> {
    if (parentPort) {
      postClaimControl(HostResponseTypes.BroadcastClaimCommit, lease);
      return;
    }
    pruneLocalClaims();
    const current = localClaims.get(lease.key);
    if (current?.status === "reserved" && current.token === lease.token) {
      localClaims.set(lease.key, {
        ...current,
        status: "committed",
        expiresAt: null,
      });
    }
  }

  async function releaseClaim(lease: BroadcastClaimLease): Promise<void> {
    if (parentPort) {
      postClaimControl(HostResponseTypes.BroadcastClaimRelease, lease);
      return;
    }
    pruneLocalClaims();
    const current = localClaims.get(lease.key);
    if (current?.status === "reserved" && current.token === lease.token) {
      localClaims.delete(lease.key);
    }
  }

  async function tryClaim(key: string): Promise<boolean> {
    const result = await acquireClaim(key);
    if (result.status !== "acquired") return false;
    await commitClaim(result.lease);
    return true;
  }

  return {
    send,
    acquireClaim,
    commitClaim,
    releaseClaim,
    tryClaim,
    onMessage: emitter.event,
  };
}
