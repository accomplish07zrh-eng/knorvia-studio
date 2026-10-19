// SPDX-License-Identifier: Apache-2.0

import { inputHash } from "./hash.js";
import { importedAskRecord, type ImportedActorState } from "./imported-cache.js";
import { askJournalRecord } from "./ask-journal-projection.js";
import { describeCause, hashMismatch, headOfInstructions } from "./scheduler-helpers.js";
import { handleSubmitAttempted, handleTurnEnded, type SubmitSeam } from "./scheduler-submit.js";
import { defer } from "./scheduler-types.js";
import type { Actor, AskNode, Deferred, SchedulerHost } from "./scheduler-types.js";
import type {
  ActorId,
  ActorRef,
  AskSpec,
  AskStats,
  ImportedAskEntry,
  InstanceRef,
  NodeRecord,
  PersonaSpec,
  RunEvent,
  SessionRef,
  WorkflowErrorJson,
} from "./types.js";
import { NUDGE_ATTEMPTS, REPAIR_ATTEMPTS, refToString, WorkflowError } from "./types.js";

export type { SchedulerHost } from "./scheduler-types.js";
export { hashMismatch } from "./scheduler-helpers.js";

const SESSION_MOUNT_FAILED = "Failed to create the subagent session: ";

/** 一次准入请求的全部输入；recorded 在场表示 resume 命中了既有行。 */
interface Admission {
  readonly actor: Actor;
  readonly instance: InstanceRef;
  readonly prompt: string;
  readonly digest: string;
  readonly spec: AskSpec;
  readonly answer: Deferred<unknown>;
  readonly recorded?: NodeRecord;
}

interface ActorSeed {
  readonly ref: ActorRef;
  readonly id: ActorId;
  readonly name: string | undefined;
  readonly persona: PersonaSpec;
  readonly count: number;
  readonly imported?: ImportedActorState;
}

type Settlement =
  | { readonly ok: true; readonly result: unknown }
  | { readonly ok: false; readonly error: WorkflowError };

type EventOf<T extends RunEvent["type"]> = Extract<RunEvent, { type: T }>;

function recordEvent<T extends RunEvent["type"]>(
  host: SchedulerHost,
  type: T,
  fields: Omit<EventOf<T>, "type">,
): void {
  host.record({ type, ...fields } as EventOf<T>);
}

function cacheSettlement(
  instance: InstanceRef,
  outcome: "ok" | "failed",
  error?: WorkflowErrorJson,
): Omit<EventOf<"node-settled">, "type"> {
  return { instance, outcome, cached: true, ...(error === undefined ? {} : { error }) };
}

function belongsTo(ref: ActorRef): (row: NodeRecord) => boolean {
  return (row) =>
    row.kind === "ask" && row.actorSiteId === ref.siteId && row.actorOrdinal === ref.ordinal;
}

function makeActor(seed: ActorSeed): Actor {
  const lane = {} as Actor;
  lane.ref = seed.ref;
  lane.id = seed.id;
  lane.name = seed.name;
  lane.persona = seed.persona;
  lane.recordedCount = seed.count;
  lane.nextAdmitSeq = 0;
  lane.pendingRecorded = new Map();
  lane.pendingLive = [];
  lane.liveQueue = [];
  if (seed.imported !== undefined) lane.imported = seed.imported;
  return lane;
}

function makeNode(job: Admission, sequence: number): AskNode {
  const node = {} as AskNode;
  node.instance = job.instance;
  node.actor = job.actor;
  node.actorSeq = sequence;
  node.instructions = job.prompt;
  node.hash = job.digest;
  node.spec = job.spec;
  node.deferred = job.answer;
  node.dispatched = false;
  node.settled = false;
  node.nudgesRemaining = NUDGE_ATTEMPTS;
  node.repairsRemaining = REPAIR_ATTEMPTS;
  return node;
}

export class AskScheduler {
  private readonly host: SchedulerHost;
  private readonly registry = new Map<ActorId, Actor>();
  private readonly registrationOrder: Actor[] = [];
  private readonly liveIndex = new Map<string, AskNode>();
  private occupied = 0;
  private readonly submit: SubmitSeam;

  constructor(host: SchedulerHost) {
    this.host = host;
    this.submit = {
      host: this.host,
      liveNode: (ref) => this.liveIndex.get(refToString(ref)),
      settleOk: (node, value) => this.settle(node, { ok: true, result: value }),
      settleFailed: (node, error) => this.settle(node, { ok: false, error }),
    };
  }

  hasActor(handle: ActorId): boolean {
    return this.registry.has(handle);
  }

  registerActor(
    origin: ActorRef,
    handle: ActorId,
    displayName: string | undefined,
    persona: PersonaSpec,
    reused?: ImportedActorState,
  ): Actor {
    const count = this.host.driver.journal
      .listNodes(this.host.runId)
      .filter(belongsTo(origin)).length;
    const actor = makeActor({
      ref: origin,
      id: handle,
      name: displayName,
      persona,
      count,
      imported: reused,
    });
    this.registry.set(handle, actor);
    this.registrationOrder.push(actor);
    return actor;
  }

  admitAsk(siteId: string, handle: ActorId, prompt: string, spec: AskSpec): Promise<unknown> {
    const actor = this.registry.get(handle);
    if (actor === undefined) {
      const unknown = new WorkflowError("UnknownActor", `Unknown subagent handle: ${handle}.`);
      this.host.failRun(unknown);
      return Promise.reject(unknown);
    }
    const instance: InstanceRef = { ordinal: this.host.nextOrdinal(siteId), siteId };
    const digest = inputHash(prompt);
    const answer = defer<unknown>();
    const recorded = this.host.driver.journal.getNode(this.host.runId, siteId, instance.ordinal);
    if (recorded !== undefined && recorded.inputHash !== digest) {
      const conflict = hashMismatch(instance, recorded.inputHash, digest);
      this.host.failRun(conflict);
      return Promise.reject(conflict);
    }
    const job: Admission = { actor, instance, prompt, digest, spec, answer, recorded };
    if (recorded === undefined) actor.pendingLive.push(() => this.admitLive(job));
    else actor.pendingRecorded.set(recorded.actorSeq ?? 0, () => this.admitRecorded(job));
    this.drainLane(actor);
    this.pumpOne(actor);
    if (recorded === undefined) this.pumpActors();
    return answer.promise;
  }

  private admitLive(job: Admission): void {
    const sequence = job.actor.nextAdmitSeq;
    job.actor.nextAdmitSeq = sequence + 1;
    const imported = job.actor.imported;
    const hit = this.host.importCacheClosed()
      ? imported?.takeIfPure(sequence, job.digest)
      : imported?.take(sequence, job.digest);
    if (hit === undefined) this.openNode(job, sequence);
    else this.deliverImported(job, sequence, hit);
  }

  private admitRecorded(job: Admission): void {
    const row = job.recorded;
    if (row === undefined) return;
    const sequence = row.actorSeq ?? 0;
    const wasLive = this.host.wasLiveBeforeResume(job.instance);
    job.actor.imported?.reconcileRecorded(sequence, row.inputHash, wasLive);
    if (row.status === "running") this.openNode(job, sequence);
    else this.deliverReplay(job, row);
  }

  private openNode(job: Admission, sequence: number): void {
    const node = makeNode(job, sequence);
    this.liveIndex.set(refToString(job.instance), node);
    this.host.driver.journal.putNode(
      askJournalRecord(node, { status: "running" }, this.host.runId),
    );
    job.actor.liveQueue.push(node);
    const head = headOfInstructions(job.prompt);
    recordEvent(this.host, "node-queued", {
      kind: "ask",
      instance: job.instance,
      actor: job.actor.ref,
      actorSeq: sequence,
      ...(head === undefined ? {} : { instructionsHead: head }),
    });
  }

  private deliverImported(job: Admission, sequence: number, entry: ImportedAskEntry): void {
    const journal = this.host.driver.journal;
    journal.putNode(
      importedAskRecord(this.host.runId, job.instance, job.actor.ref, sequence, job.digest, entry),
    );
    recordEvent(this.host, "node-settled", cacheSettlement(job.instance, "ok"));
    job.answer.resolve(entry.result);
  }

  private deliverReplay(job: Admission, row: NodeRecord): void {
    const ok = row.status === "completed";
    const outcome = ok ? "ok" : "failed";
    recordEvent(this.host, "node-settled", cacheSettlement(job.instance, outcome, row.error));
    if (ok) job.answer.resolve(row.result);
    else job.answer.reject(WorkflowError.fromJSON(row.error!));
  }

  submitAttempted(ref: InstanceRef, body: unknown): void {
    handleSubmitAttempted(this.submit, ref, body);
  }

  turnEnded(ref: InstanceRef, text: string): void {
    handleTurnEnded(this.submit, ref, text);
  }

  noteStats(ref: InstanceRef, usage: AskStats): void {
    const node = this.liveIndex.get(refToString(ref));
    if (node !== undefined) node.lastStats = usage;
    else {
      const journal = this.host.driver.journal;
      const completed = journal.getNode(this.host.runId, ref.siteId, ref.ordinal);
      if (completed !== undefined) journal.putNode({ ...completed, stats: usage });
    }
  }

  failed(ref: InstanceRef, error: WorkflowError): void {
    const node = this.liveIndex.get(refToString(ref));
    if (node !== undefined && !node.settled) this.settle(node, { ok: false, error });
  }

  isLive(ref: InstanceRef): boolean {
    const node = this.liveIndex.get(refToString(ref));
    if (node === undefined) return false;
    return !node.settled;
  }

  liveActorName(ref: InstanceRef): string | undefined {
    const node = this.liveIndex.get(refToString(ref));
    if (node === undefined || node.settled) return undefined;
    return node.actor.persona.name;
  }

  abortInFlight(reason: WorkflowError, emit: boolean): void {
    const nodes = [...this.liveIndex.values()];
    this.liveIndex.clear();
    this.occupied = 0;
    for (const node of nodes) {
      if (!node.settled) this.abortNode(node, reason, emit);
    }
  }

  private abortNode(node: AskNode, reason: WorkflowError, emit: boolean): void {
    this.markSettled(node);
    if (node.dispatched) {
      this.host.driver.cancelAsk(node.instance);
    }
    if (emit) {
      recordEvent(this.host, "node-settled", { instance: node.instance, outcome: "cancelled" });
    }
    node.deferred.reject(reason);
  }

  private drainLane(actor: Actor): void {
    for (;;) {
      const cursor = actor.nextAdmitSeq;
      const recorded = actor.pendingRecorded.get(cursor);
      if (recorded !== undefined) {
        actor.pendingRecorded.delete(cursor);
        actor.nextAdmitSeq = cursor + 1;
        recorded();
        continue;
      }
      if (cursor < actor.recordedCount) return;
      const fresh = actor.pendingLive.shift();
      if (fresh === undefined) return;
      fresh();
    }
  }

  private pumpActors(): void {
    for (const actor of this.registrationOrder) this.pumpOne(actor);
  }

  private pumpOne(actor: Actor): void {
    if (this.host.isRunSettled() || actor.current !== undefined) return;
    if (actor.liveQueue.length === 0 || this.occupied >= this.host.caps.maxConcurrency) return;
    const chosen = actor.liveQueue.shift();
    if (chosen === undefined) return;
    actor.current = chosen;
    this.occupied += 1;
    void this.launch(chosen);
  }

  private async launch(node: AskNode): Promise<void> {
    let session: SessionRef;
    try {
      session = await this.sessionFor(node.actor);
    } catch (reason) {
      if (!this.host.isRunSettled() && !node.settled) this.settleMountFailure(node, reason);
      return;
    }
    if (!this.host.isRunSettled() && !node.settled) this.dispatchReady(session, node);
  }

  private settleMountFailure(node: AskNode, reason: unknown): void {
    const message = SESSION_MOUNT_FAILED + describeCause(reason);
    const failure = new WorkflowError("DriverError", message, { cause: reason });
    this.settle(node, { ok: false, error: failure });
  }

  private dispatchReady(session: SessionRef, node: AskNode): void {
    recordEvent(this.host, "node-dispatched", { instance: node.instance });
    node.dispatched = true;
    const { instructions } = node;
    const { typed, schema } = node.spec;
    this.host.driver.startAsk(session, node.instance, { instructions, typed, schema });
  }

  private sessionFor(actor: Actor): Promise<SessionRef> {
    if (actor.sessionPromise === undefined) actor.sessionPromise = this.mount(actor);
    return actor.sessionPromise;
  }

  private async mount(actor: Actor): Promise<SessionRef> {
    const { ref, persona } = actor;
    const transcriptSeed = actor.imported?.seed();
    const mounted = await this.host.driver.createActorSession(ref, persona, transcriptSeed);
    actor.session = mounted;
    this.storeSession(actor, mounted);
    return mounted;
  }

  private storeSession(actor: Actor, mounted: SessionRef): void {
    const journal = this.host.driver.journal;
    const runId = this.host.runId;
    const { ref, name, persona } = actor;
    const prior = journal.getActor(runId, ref.siteId, ref.ordinal);
    journal.putActor({
      runId,
      siteId: ref.siteId,
      ordinal: ref.ordinal,
      name,
      persona,
      sessionId: mounted.id,
      resolvedModel: prior?.resolvedModel,
    });
  }

  private markSettled(node: AskNode): boolean {
    if (node.settled) return false;
    node.settled = true;
    return true;
  }

  private settle(node: AskNode, outcome: Settlement): void {
    if (!this.markSettled(node)) return;
    const terminal = outcome.ok
      ? { status: "completed" as const, result: outcome.result }
      : { status: "failed" as const, error: outcome.error.toJSON() };
    this.host.driver.journal.putNode(askJournalRecord(node, terminal, this.host.runId));
    this.announce(node, outcome);
    this.liveIndex.delete(refToString(node.instance));
    this.releaseSlot(node);
    this.pumpActors();
    if (outcome.ok) node.deferred.resolve(outcome.result);
    else node.deferred.reject(outcome.error);
  }

  private announce(node: AskNode, outcome: Settlement): void {
    const failure = outcome.ok ? undefined : outcome.error.toJSON();
    const { instance } = node;
    recordEvent(this.host, "node-settled", {
      instance,
      outcome: outcome.ok ? "ok" : "failed",
      ...(failure === undefined ? {} : { error: failure }),
    });
  }

  private releaseSlot(node: AskNode): void {
    if (node.actor.current !== node) return;
    node.actor.current = undefined;
    this.occupied -= 1;
  }
}
