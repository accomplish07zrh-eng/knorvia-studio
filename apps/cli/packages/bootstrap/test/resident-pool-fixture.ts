import type {
  SessionDeactivationDecision,
  SessionResidentPool,
  SessionResidentPoolHost,
  SessionResidentPoolOptions,
  SessionResidencyFacts,
} from "../src/protocol/session-resident-pool.js";

export type PoolFactory = (
  host: SessionResidentPoolHost,
  options?: SessionResidentPoolOptions,
) => Pick<SessionResidentPool, "acquireOperation" | "rebalance" | "touch" | "waitForDeactivation">;
export type PoolCase = { name: string; run(factory: PoolFactory): Promise<unknown> };

export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export function residentFixture(factory: PoolFactory, options: SessionResidentPoolOptions = {}) {
  const residents = new Map<string, SessionResidencyFacts>();
  const decisions: { sessionId: string; decision: SessionDeactivationDecision }[] = [];
  const started = new Set<string>();
  const state = { now: 0, reads: 0, clocks: 0 };
  const host: SessionResidentPoolHost = {
    listSessionIds: () => [...residents.keys()],
    readResidencyFacts: (id) => {
      state.reads += 1;
      return residents.get(id) ?? null;
    },
    deactivate: (id) => {
      started.add(id);
      residents.delete(id);
      return Promise.resolve();
    },
    onDeactivated: (sessionId, decision) => {
      decisions.push({ sessionId, decision });
    },
  };
  const pool = factory(host, {
    now: () => {
      state.clocks += 1;
      return state.now;
    },
    ...options,
  });
  const add = (id: string, lastActivityAt = 0): SessionResidencyFacts => {
    const facts = {
      persisted: true,
      hasResidencyBlockingWork: false,
      hasPendingInteractions: false,
      hasQueuedCommands: false,
      hasSubscribers: false,
      hasLegacySubscriber: false,
      lastActivityAt,
    };
    residents.set(id, facts);
    return facts;
  };
  const settle = () => Promise.all([...started].map((id) => pool.waitForDeactivation(id)));
  return { residents, decisions, state, host, pool, add, settle };
}
