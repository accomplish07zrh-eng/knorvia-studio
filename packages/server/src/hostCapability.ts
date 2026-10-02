import { randomBytes } from "node:crypto";
import type { ServerRemoteHostCapability } from "@knorvia/shared";

export const DEFAULT_HOST_CAPABILITY_TTL_MS = 30_000;

export interface HostCapabilityStoreOptions {
  ttlMs?: number;
  now?: () => number;
  createCapability?: () => string;
}

export interface HostCapabilityStore {
  issue(): ServerRemoteHostCapability;
  consume(capability: string | undefined): boolean;
}

export function createHostCapabilityStore(
  options: HostCapabilityStoreOptions = {},
): HostCapabilityStore {
  const ttl = options.ttlMs ?? DEFAULT_HOST_CAPABILITY_TTL_MS;
  const clock = options.now ?? Date.now;
  const generate = options.createCapability ?? (() => randomBytes(32).toString("base64url"));
  const issued = new Map<string, number>();

  function purge(time: number): void {
    for (const [token, expiry] of issued) {
      if (expiry <= time) issued.delete(token);
    }
  }

  return {
    issue() {
      const time = clock();
      purge(time);
      const capability = generate();
      const expiresAt = time + ttl;
      issued.set(capability, expiresAt);
      return { capability, expiresAt };
    },
    consume(capability) {
      if (!capability) return false;
      const time = clock();
      const expiry = issued.get(capability);
      issued.delete(capability);
      purge(time);
      return expiry !== undefined && expiry > time;
    },
  };
}
