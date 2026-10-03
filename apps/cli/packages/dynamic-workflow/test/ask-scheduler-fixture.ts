import { InMemoryJournalStore } from "../src/engine/journal-memory.js";
import { AskScheduler } from "../src/engine/scheduler.js";
import type { SchedulerHost } from "../src/engine/scheduler-types.js";
import type { ActorRef, ActorSessionSeed, AskMessage, InstanceRef, NodeRecord, RunEvent, SubmitVerdict, ValidateFn, WorkflowDriver, WorkflowError } from "../src/engine/types.js";

export class ObservedJournal extends InMemoryJournalStore {
  readonly order: string[] = [];
  override putNode(row: NodeRecord): void {
    this.order.push("journal:" + row.siteId + ":" + row.status);
    super.putNode(row);
  }
}

export function schedulerFixture(concurrency = 1, validate: ValidateFn = () => []) {
  const journal = new ObservedJournal();
  const caps = { maxConcurrency: concurrency };
  journal.createRun({ runId: "fixture-run", caps, spentTokens: 0, status: "running" });
  const sessions: Array<{ actor: ActorRef; seed?: ActorSessionSeed }> = [];
  const starts: Array<{ instance: InstanceRef; message: AskMessage }> = [];
  const replies: Array<{ instance: InstanceRef; verdict: SubmitVerdict }> = [];
  const cancelled: InstanceRef[] = [];
  const events: RunEvent[] = [];
  const failures: WorkflowError[] = [];
  let settled = false;
  let closed = false;
  const ordinals = new Map<string, number>();
  const driver: WorkflowDriver = {
    journal,
    createActorSession: (actor, persona, seed) => {
      sessions.push({ actor, seed });
      journal.putActor({ runId: "fixture-run", siteId: actor.siteId, ordinal: actor.ordinal, persona, resolvedModel: "fixture-provider/fixture-model" });
      return Promise.resolve({ id: "mounted-" + actor.siteId });
    },
    startAsk: (_session, instance, message) => { starts.push({ instance, message }); journal.order.push("start:" + instance.siteId); },
    respondToSubmit: (instance, verdict) => { replies.push({ instance, verdict }); },
    cancelAsk: (instance) => { cancelled.push(instance); },
    executeWorldRead: () => Promise.resolve(undefined),
    emit: () => {},
  };
  const host: SchedulerHost = {
    runId: "fixture-run", caps, driver, validate,
    nextOrdinal: (siteId) => {
      const ordinal = ordinals.get(siteId) ?? 0;
      ordinals.set(siteId, ordinal + 1);
      return ordinal;
    },
    record: (event) => { events.push(event); journal.order.push("event:" + event.type); },
    isRunSettled: () => settled,
    runError: () => { throw new Error("unused fixture runError"); },
    failRun: (error) => { failures.push(error); settled = true; },
    importCacheClosed: () => closed,
    wasLiveBeforeResume: () => false,
  };
  return {
    scheduler: new AskScheduler(host), host, driver, journal, sessions, starts, replies, cancelled, events, failures,
    closeCache: () => { closed = true; },
    stopRun: () => { settled = true; },
  };
}

export const dispatchCheckpoint = () => new Promise<void>((resolve) => setImmediate(resolve));
