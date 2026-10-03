import { inputHash } from "./hash.js";
import { importedAskRecord, type ImportedActorState } from "./imported-cache.js";
import { askJournalRecord } from "./ask-journal-projection.js";
import { describeCause, hashMismatch, headOfInstructions } from "./scheduler-helpers.js";
import { handleSubmitAttempted, handleTurnEnded, type SubmitSeam } from "./scheduler-submit.js";
import {
  defer,
  type Actor,
  type AskNode,
  type Deferred,
  type SchedulerHost,
} from "./scheduler-types.js";
import type {
  ActorId,
  ActorRef,
  AskSpec,
  AskStats,
  InstanceRef,
  NodeRecord,
  PersonaSpec,
  SessionRef,
} from "./types.js";
import { NUDGE_ATTEMPTS, REPAIR_ATTEMPTS, refToString, WorkflowError } from "./types.js";

export type { SchedulerHost } from "./scheduler-types.js";
export { hashMismatch } from "./scheduler-helpers.js";

interface AskTicket {
  actor: Actor;
  instance: InstanceRef;
  instructions: string;
  hash: string;
  spec: AskSpec;
  answer: Deferred<unknown>;
  replay?: { row: NodeRecord; live: boolean };
}

type Completion = { kind: "ok"; value: unknown } | { kind: "failed"; error: WorkflowError };

/** 摘出一个已可准入的 continuation；调用前提交 hold 游标，支持端口同步重入。 */
function nextAdmission(actor: Actor): (() => void) | undefined {
  const recorded = actor.pendingRecorded.get(actor.nextAdmitSeq);
  if (recorded !== undefined) {
    actor.pendingRecorded.delete(actor.nextAdmitSeq);
    actor.nextAdmitSeq += 1;
    return recorded;
  }
  if (!(actor.nextAdmitSeq >= actor.recordedCount) || actor.pendingLive.length === 0)
    return undefined;
  return actor.pendingLive.shift();
}

export class AskScheduler {
  private readonly byActorId = new Map<ActorId, Actor>();
  private readonly registeredActors: Actor[] = [];
  private readonly inFlight = new Map<string, AskNode>();
  private occupiedSlots = 0;
  private readonly reports: SubmitSeam;

  constructor(private readonly host: SchedulerHost) {
    this.reports = {
      host,
      liveNode: (instance) => this.inFlight.get(refToString(instance)),
      settleOk: (node, value) => this.complete(node, { kind: "ok", value }),
      settleFailed: (node, error) => this.complete(node, { kind: "failed", error }),
    };
  }

  private get journal() {
    return this.host.driver.journal;
  }

  hasActor(id: ActorId): boolean {
    return this.byActorId.has(id);
  }

  registerActor(
    ref: ActorRef,
    id: ActorId,
    name: string | undefined,
    persona: PersonaSpec,
    imported?: ImportedActorState,
  ): Actor {
    const recordedCount = this.journal
      .listNodes(this.host.runId)
      .reduce(
        (count, row) =>
          row.kind === "ask" && row.actorSiteId === ref.siteId && row.actorOrdinal === ref.ordinal
            ? count + 1
            : count,
        0,
      );
    const actor: Actor = {
      ref,
      id,
      persona,
      name,
      recordedCount,
      nextAdmitSeq: 0,
      pendingRecorded: new Map(),
      pendingLive: [],
      liveQueue: [],
    };
    if (imported !== undefined) actor.imported = imported;
    // 沿用恢复修复：journal sessionId 不是 driver 会话表；首个 live 必须真正挂载 driver。
    this.byActorId.set(id, actor);
    this.registeredActors.push(actor);
    return actor;
  }

  admitAsk(
    siteId: string,
    actorId: ActorId,
    instructions: string,
    spec: AskSpec,
  ): Promise<unknown> {
    const actor = this.byActorId.get(actorId)!;
    const instance: InstanceRef = { siteId, ordinal: this.host.nextOrdinal(siteId) };
    const hash = inputHash(instructions);
    const answer = defer<unknown>();
    const row = this.journal.getNode(this.host.runId, siteId, instance.ordinal);
    if (row !== undefined && row.inputHash !== hash) {
      const error = hashMismatch(instance, row.inputHash, hash);
      this.host.failRun(error);
      return Promise.reject(error);
    }

    const ticket: AskTicket = { actor, instance, instructions, hash, spec, answer };
    if (row === undefined) {
      actor.pendingLive.push(() => this.release(ticket, actor.nextAdmitSeq++));
    } else {
      const sequence = row.actorSeq ?? 0;
      ticket.replay = { row, live: row.status === "running" };
      actor.pendingRecorded.set(sequence, () => this.release(ticket, sequence));
    }
    for (let admit = nextAdmission(actor); admit !== undefined; admit = nextAdmission(actor))
      admit();
    this.pump(actor);
    if (row === undefined) this.pumpRegistered();
    return answer.promise;
  }

  private release(ticket: AskTicket, sequence: number): void {
    const { actor, instance, answer, hash } = ticket;
    const replay = ticket.replay;
    if (replay !== undefined) {
      actor.imported?.reconcileRecorded(
        sequence,
        replay.row.inputHash,
        this.host.wasLiveBeforeResume(instance),
      );
      if (!replay.live) {
        if (replay.row.status === "completed") {
          this.host.record({ type: "node-settled", instance, outcome: "ok", cached: true });
          answer.resolve(replay.row.result);
        } else {
          this.host.record({
            type: "node-settled",
            instance,
            outcome: "failed",
            cached: true,
            error: replay.row.error,
          });
          answer.reject(WorkflowError.fromJSON(replay.row.error!));
        }
        return;
      }
    } else {
      const entry = this.host.importCacheClosed()
        ? actor.imported?.takeIfPure(sequence, hash)
        : actor.imported?.take(sequence, hash);
      if (entry !== undefined) {
        this.journal.putNode(
          importedAskRecord(this.host.runId, instance, actor.ref, sequence, hash, entry),
        );
        this.host.record({ type: "node-settled", instance, outcome: "ok", cached: true });
        answer.resolve(entry.result);
        return;
      }
    }

    const node: AskNode = {
      instance,
      actor,
      actorSeq: sequence,
      instructions: ticket.instructions,
      hash,
      spec: ticket.spec,
      deferred: answer,
      repairsRemaining: REPAIR_ATTEMPTS,
      nudgesRemaining: NUDGE_ATTEMPTS,
      settled: false,
      dispatched: false,
    };
    this.inFlight.set(refToString(instance), node);
    this.journal.putNode(askJournalRecord(node, { status: "running" }, this.host.runId));
    actor.liveQueue.push(node);
    const instructionsHead = headOfInstructions(ticket.instructions);
    this.host.record({
      type: "node-queued",
      instance,
      kind: "ask",
      actor: actor.ref,
      actorSeq: sequence,
      ...(instructionsHead === undefined ? {} : { instructionsHead }),
    });
    // 准入只排队，不改变工作区；import cache 的关门仍由既有 mutating/world-run owner 决定。
  }

  submitAttempted(instance: InstanceRef, payload: unknown): void {
    handleSubmitAttempted(this.reports, instance, payload);
  }

  turnEnded(instance: InstanceRef, finalText: string): void {
    handleTurnEnded(this.reports, instance, finalText);
  }

  noteStats(instance: InstanceRef, stats: AskStats): void {
    const node = this.inFlight.get(refToString(instance));
    if (node !== undefined) node.lastStats = stats;
    else {
      const row = this.journal.getNode(this.host.runId, instance.siteId, instance.ordinal);
      // 沿用 typed-submit 的 late stats 修复：回填整条既有行，保留结果与转录边界。
      if (row !== undefined) this.journal.putNode({ ...row, stats });
    }
  }

  failed(instance: InstanceRef, error: WorkflowError): void {
    const node = this.inFlight.get(refToString(instance));
    if (node !== undefined && !node.settled) this.complete(node, { kind: "failed", error });
  }

  isLive(instance: InstanceRef): boolean {
    const node = this.inFlight.get(refToString(instance));
    return node !== undefined && !node.settled;
  }

  liveActorName(instance: InstanceRef): string | undefined {
    const node = this.inFlight.get(refToString(instance));
    return node !== undefined && !node.settled ? node.actor.persona.name : undefined;
  }

  abortInFlight(error: WorkflowError, emitCancelled: boolean): void {
    for (const node of this.inFlight.values()) {
      if (node.settled) continue;
      node.settled = true;
      if (node.dispatched) this.host.driver.cancelAsk(node.instance);
      if (emitCancelled)
        this.host.record({ type: "node-settled", instance: node.instance, outcome: "cancelled" });
      node.deferred.reject(error);
    }
    this.inFlight.clear();
    this.occupiedSlots = 0;
  }

  private pumpRegistered(): void {
    for (const actor of this.registeredActors) this.pump(actor);
  }

  private pump(actor: Actor): void {
    if (this.host.isRunSettled()) return;
    if (actor.current !== undefined) return;
    if (actor.liveQueue.length === 0) return;
    if (this.occupiedSlots >= this.host.caps.maxConcurrency) return;
    actor.current = actor.liveQueue.shift()!;
    this.occupiedSlots += 1;
    void this.dispatch(actor.current);
  }

  private async dispatch(node: AskNode): Promise<void> {
    let session: SessionRef;
    try {
      session = await this.sessionFor(node.actor);
    } catch (cause) {
      if (!this.host.isRunSettled() && !node.settled) {
        this.complete(node, {
          kind: "failed",
          error: new WorkflowError(
            "DriverError",
            "Failed to create the subagent session: " + describeCause(cause),
            { cause },
          ),
        });
      }
      return;
    }
    if (this.host.isRunSettled() || node.settled) return;
    this.host.record({ type: "node-dispatched", instance: node.instance });
    node.dispatched = true;
    this.host.driver.startAsk(session, node.instance, {
      instructions: node.instructions,
      typed: node.spec.typed,
      schema: node.spec.schema,
    });
  }

  private sessionFor(actor: Actor): Promise<SessionRef> {
    if (actor.sessionPromise !== undefined) return actor.sessionPromise;
    const seed = actor.imported?.seed();
    const mounted = this.host.driver
      .createActorSession(actor.ref, actor.persona, seed)
      .then((session) => {
        actor.session = session;
        // driver 写的模型 pin 必须先读回；putActor 是覆盖行，不能以旧 journal 资料抹去它。
        const resolvedModel = this.journal.getActor(
          this.host.runId,
          actor.ref.siteId,
          actor.ref.ordinal,
        )?.resolvedModel;
        this.journal.putActor({
          runId: this.host.runId,
          siteId: actor.ref.siteId,
          ordinal: actor.ref.ordinal,
          name: actor.name,
          persona: actor.persona,
          sessionId: session.id,
          resolvedModel,
        });
        return session;
      });
    actor.sessionPromise = mounted;
    return mounted;
  }

  private complete(node: AskNode, completion: Completion): void {
    if (node.settled) return;
    node.settled = true;
    this.journal.putNode(
      askJournalRecord(
        node,
        completion.kind === "ok"
          ? { status: "completed", result: completion.value }
          : { status: "failed", error: completion.error.toJSON() },
        this.host.runId,
      ),
    );
    this.host.record(
      completion.kind === "ok"
        ? { type: "node-settled", instance: node.instance, outcome: "ok" }
        : {
            type: "node-settled",
            instance: node.instance,
            outcome: "failed",
            error: completion.error.toJSON(),
          },
    );
    this.inFlight.delete(refToString(node.instance));
    if (node.actor.current === node) {
      node.actor.current = undefined;
      this.occupiedSlots -= 1;
    }
    this.pumpRegistered();
    if (completion.kind === "ok") node.deferred.resolve(completion.value);
    else node.deferred.reject(completion.error);
  }
}
