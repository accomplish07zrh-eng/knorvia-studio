// SPDX-License-Identifier: Apache-2.0

import type { ArtifactContentOp, ArtifactPresetOp } from "../facade/registry.js";
import { runLaunchedEvent, type RunLaunchConfig } from "./engine-launch.js";
import {
  declarePresetArtifact,
  publishContentArtifact,
  rememberArtifactRow,
} from "./engine-artifacts.js";
import { publishReport } from "./engine-report.js";
import { settleCompleted, settleFailed, settleStopped } from "./engine-settlement.js";
import type { ArtifactIdState, EngineState, RunSettlement } from "./engine-state.js";
import { closeImportCache, readWorld, recoverImportClosure } from "./engine-world.js";
import { ImportedWorldQueue, matchImportedActor } from "./imported-cache.js";
import { AskScheduler, type SchedulerHost } from "./scheduler.js";
import type {
  ActorId,
  ActorRef,
  ArtifactRef,
  AskProgress,
  AskSpec,
  AskStats,
  AskWaitInfo,
  Caps,
  ConcurrencyChange,
  ImportedRunCache,
  InstanceRef,
  JournalStorePort,
  PersonaSpec,
  RunEvent,
  RunRecord,
  RunStallInfo,
  RunStatus,
  RunStopReason,
  ValidateFn,
  WorkflowDriver,
  WorkflowHostApi,
  WorkflowReportSink,
  WorldReadOp,
} from "./types.js";
import { refToString, WorkflowError } from "./types.js";

/** 建 run 第一世随行落库的元数据；键与 RunRecord 一一同名。 */
type RunSeed = Pick<
  RunRecord,
  | "scriptText"
  | "name"
  | "scriptHash"
  | "args"
  | "parentSessionId"
  | "cwd"
  | "toolCallId"
  | "resumedFrom"
>;

/** 引擎构造配置：接线 + 建 run 元数据 + 导入表与用量起点。 */
export type EngineConfig = {
  readonly runId: string;
  readonly driver: WorkflowDriver;
  readonly caps: Caps;
  readonly askSpecs: ReadonlyMap<string, AskSpec>;
  readonly validate: ValidateFn;
  readonly launch?: RunLaunchConfig;
  readonly inheritedTokens?: number;
  readonly importedCache?: ImportedRunCache;
} & RunSeed;

export type { RunSettlement } from "./engine-state.js";

const SEED_FIELDS =
  "scriptText args name scriptHash parentSessionId cwd toolCallId resumedFrom".split(
    " ",
  ) as (keyof RunSeed)[];

function copySeedMetadata(target: RunRecord, source: EngineConfig): void {
  for (const field of SEED_FIELDS)
    if (source[field] !== undefined)
      (target as unknown as Record<string, unknown>)[field] = source[field];
}

type BirthEvent = Extract<RunEvent, { type: "actor-created" | "node-queued" | "node-settled" }>;

class PhaseLedger {
  private readonly siteCounters = new Map<string, number>();
  private readonly roundCounters = new Map<string, number>();
  private readonly birthRecord = new Map<string, string>();
  private current?: string;

  open(rawName: string): { name: string; ordinal: number } | undefined {
    const name = rawName.trim();
    if (name.length === 0) return undefined;
    const ordinal = (this.roundCounters.get(name) ?? 0) + 1;
    this.roundCounters.set(name, ordinal);
    this.current = name;
    return { name, ordinal };
  }

  mint(siteId: string): number {
    const ordinal = (this.siteCounters.get(siteId) ?? 0) + 1;
    this.siteCounters.set(siteId, ordinal);
    const head = this.current;
    if (head !== undefined) this.birthRecord.set(refToString({ ordinal, siteId }), head);
    return ordinal;
  }

  stamp(event: RunEvent): RunEvent {
    const eligible =
      event.type === "actor-created" ||
      event.type === "node-queued" ||
      (event.type === "node-settled" && event.cached === true);
    return eligible ? this.withBirthPhase(event as BirthEvent) : event;
  }

  decorateStop(error: WorkflowError): WorkflowError {
    const details = error.providerStop;
    if (details === undefined || details.subagent === undefined || details.phase !== undefined)
      return error;
    const birthPhase = this.birthRecord.get(details.subagent);
    if (birthPhase === undefined) return error;
    const cause = (error as { cause?: unknown }).cause;
    return new WorkflowError(error.code, error.message, {
      cause,
      providerStop: { ...details, phase: birthPhase },
    });
  }

  private withBirthPhase(event: BirthEvent): RunEvent {
    const ref = event.type === "actor-created" ? event.actor : event.instance;
    const phaseName = this.birthRecord.get(refToString(ref));
    if (phaseName === undefined) return event;
    return { ...event, phaseName };
  }
}

class NameClaims {
  private readonly owner = new Map<string, string>();

  take(effective: string | undefined, id: string, onDup: (error: WorkflowError) => void): void {
    if (effective === undefined || effective === "") return;
    const previous = this.owner.get(effective);
    if (previous !== undefined) {
      const duplicate = new WorkflowError(
        "DuplicateActorName",
        `Subagent name "${effective}" is used twice in this run (${previous} and ${id}). A named subagent is the identity an amended re-run matches its cache by, so names must be unique; give this one its own name or drop the name to make it anonymous.`,
      );
      onDup(duplicate);
      throw duplicate;
    }
    this.owner.set(effective, id);
  }
}

/** run 运行态；EngineState 与 SchedulerHost 的唯一实现，结算标志与导入门各只有一个所有者。 */
class RunContext implements EngineState, SchedulerHost {
  readonly runId: string;
  readonly driver: WorkflowDriver;
  readonly journal: JournalStorePort;
  readonly caps: Caps;
  readonly validate: ValidateFn;
  readonly importedCache: ImportedRunCache | undefined;
  readonly importedWorld: ImportedWorldQueue;
  readonly artifacts = new Map<string, ArtifactIdState>();
  readonly completion: Promise<RunSettlement>;

  tokensSpent = 0;
  failure?: WorkflowError;
  asks?: AskScheduler;
  private publishedReports = 0;
  private cacheClosed = false;
  private crashLive: ReadonlySet<string> = new Set();
  private done = false;
  private resolveCompletion!: (value: RunSettlement) => void;
  private readonly options: EngineConfig;
  private readonly phases: PhaseLedger;

  constructor(options: EngineConfig, phases: PhaseLedger) {
    this.options = options;
    this.phases = phases;
    this.runId = options.runId;
    this.driver = options.driver;
    this.journal = options.driver.journal;
    this.caps = options.caps;
    this.validate = options.validate;
    this.importedCache = options.importedCache;
    this.importedWorld = new ImportedWorldQueue(options.importedCache?.world ?? new Map());
    this.completion = new Promise<RunSettlement>((resolve) => {
      this.resolveCompletion = resolve;
    });
  }

  prepareRun(): boolean {
    const existing = this.journal.getRun(this.runId);
    if (existing === undefined) {
      this.openFresh();
      return false;
    }
    this.restore(existing);
    return true;
  }

  startRun(resumed: boolean, launch: RunLaunchConfig | undefined): void {
    this.record({ caps: this.caps, runId: this.runId, type: "run-started" });
    if (!resumed && launch !== undefined) this.record(runLaunchedEvent(launch, this.options));
    if (this.tokensSpent > 0) this.record({ spentTokens: this.tokensSpent, type: "usage-updated" });
  }

  addUsage(tokens: number): number {
    this.tokensSpent += tokens;
    this.journal.updateRunUsage(this.runId, this.tokensSpent);
    return this.tokensSpent;
  }

  readonly isRunSettled = (): boolean => this.done;

  readonly runError = (): WorkflowError =>
    this.failure ?? new WorkflowError("Cancelled", "Run already settled.");

  readonly failRun = (error: WorkflowError): void => settleFailed(this, error);

  record(event: RunEvent): void {
    const stamped = this.phases.stamp(event);
    this.driver.journal.appendEvent(this.runId, stamped);
    this.options.driver.emit(stamped);
  }

  readonly nextOrdinal = (siteId: string): number => this.phases.mint(siteId);

  readonly reportCount = (): number => this.publishedReports;

  countReport(): void {
    this.publishedReports += 1;
  }

  readonly importClosed = (): boolean => this.cacheClosed;

  closeImport(): void {
    this.cacheClosed = true;
  }

  markSettled(failure?: WorkflowError): void {
    this.done = true;
    if (failure !== undefined) this.failure = failure;
  }

  readonly abortInFlight = (error: WorkflowError, emitCancelled: boolean): void =>
    this.asks?.abortInFlight(error, emitCancelled);

  readonly resolveSettled = (settlement: RunSettlement): void => this.resolveCompletion(settlement);

  readonly importCacheClosed = (): boolean => this.cacheClosed;

  readonly wasLiveBeforeResume = (instance: InstanceRef): boolean =>
    this.crashLive.has(refToString(instance));

  private openFresh(): void {
    const inherited = this.options.inheritedTokens ?? 0;
    this.tokensSpent = Number.isFinite(inherited) ? Math.max(0, Math.floor(inherited)) : 0;
    const row: RunRecord = {
      runId: this.runId,
      caps: this.caps,
      spentTokens: this.tokensSpent,
      status: "running" as const,
    };
    copySeedMetadata(row, this.options);
    this.journal.createRun(row);
  }

  private restore(existing: RunRecord): void {
    this.verifyScriptPin(existing.scriptHash);
    for (const node of this.journal.listNodes(this.runId)) {
      if (node.kind === "report") this.publishedReports += 1;
      else if (node.kind === "artifact" && node.status === "completed")
        rememberArtifactRow(this, node.artifactId, node.result);
    }
    this.tokensSpent = existing.spentTokens;
    if (this.options.importedCache !== undefined) {
      const closure = recoverImportClosure(this.journal, this.runId);
      this.crashLive = closure.live;
      this.cacheClosed = closure.closed;
    }
    this.journal.updateRunStatus(this.runId, "running");
  }

  private verifyScriptPin(recorded: string | undefined): void {
    const supplied = this.options.scriptHash;
    if (recorded === undefined || supplied === undefined || recorded === supplied) return;
    const message = `Cannot resume run ${this.runId}: its script changed (recorded hash ${recorded}, got ${supplied}). Resume needs the byte-identical script; to run a revised script, start a new run with resume_from instead.`;
    throw new WorkflowError("ScriptHashMismatch", message, {
      mismatch: { expected: recorded, got: supplied },
    });
  }
}

export class WorkflowEngine implements WorkflowHostApi, WorkflowReportSink {
  private readonly options: EngineConfig;
  private readonly phases = new PhaseLedger();
  private readonly names = new NameClaims();
  private readonly asks: AskScheduler;
  private readonly seam: RunContext;

  constructor(options: EngineConfig) {
    this.options = options;
    this.seam = new RunContext(options, this.phases);
    this.asks = new AskScheduler(this.seam);
    this.seam.asks = this.asks;
    const resumed = this.seam.prepareRun();
    this.seam.startRun(resumed, options.launch);
  }

  get settled() {
    return this.seam.completion;
  }

  readonly status = (): RunStatus => this.seam.journal.getRun(this.seam.runId)?.status ?? "running";

  createActor(site: string, displayName?: string, persona?: string | PersonaSpec): ActorId {
    this.ensureOpen("createActor");
    const reference: ActorRef = { siteId: site, ordinal: this.seam.nextOrdinal(site) };
    const handle = refToString(reference);
    let spec: PersonaSpec;
    if (persona === undefined) spec = {};
    else if (typeof persona === "string") spec = { system: persona };
    else spec = { ...persona };
    if (spec.name === undefined && displayName !== undefined) spec.name = displayName;
    this.names.take(spec.name, handle, (error) => this.seam.failRun(error));
    const imported = matchImportedActor(this.options.importedCache, spec);
    this.asks.registerActor(reference, handle, displayName, spec, imported);
    const stored = this.seam.journal.getActor(this.seam.runId, site, reference.ordinal);
    this.seam.journal.putActor({
      runId: this.seam.runId,
      siteId: site,
      ordinal: reference.ordinal,
      name: displayName,
      persona: spec,
      sessionId: stored?.sessionId,
      resolvedModel: stored?.resolvedModel,
    });
    this.seam.record({ type: "actor-created", actor: reference, name: displayName, persona: spec });
    return handle;
  }

  ask(site: string, handle: ActorId, prompt: string): Promise<unknown> {
    if (this.seam.isRunSettled()) return Promise.reject(this.seam.runError());
    if (!this.asks.hasActor(handle)) {
      const unknown = new WorkflowError("UnknownActor", `Unknown subagent handle: ${handle}.`);
      this.seam.failRun(unknown);
      return Promise.reject(unknown);
    }
    const spec = this.options.askSpecs.get(site);
    if (spec === undefined) {
      const missing = new WorkflowError(
        "MissingAskSpec",
        `Ask site ${site} has no spec: askSpecs is incomplete (compile output mismatch).`,
      );
      this.seam.failRun(missing);
      return Promise.reject(missing);
    }
    return this.asks.admitAsk(site, handle, prompt, spec);
  }

  worldRead(site: string, operation: WorldReadOp, input: unknown[]): Promise<unknown> {
    return readWorld(this.seam, site, operation, input);
  }

  log(text: string): void {
    if (!this.seam.isRunSettled()) this.seam.record({ message: text, type: "log" });
  }

  enterPhase(rawName: string): void {
    if (this.seam.isRunSettled()) return;
    const entered = this.phases.open(rawName);
    if (entered !== undefined)
      this.seam.record({ name: entered.name, ordinal: entered.ordinal, type: "phase-entered" });
  }

  report(site: string, payload: unknown, artifactId?: string): void {
    publishReport(this.seam, site, payload, artifactId);
  }

  publishArtifact(site: string, op: ArtifactContentOp, args: unknown[]): Promise<ArtifactRef> {
    return publishContentArtifact(this.seam, site, op, args);
  }

  declareArtifact(site: string, op: ArtifactPresetOp, args: unknown[]): void {
    declarePresetArtifact(this.seam, site, op, args);
  }

  complete(value: unknown): void {
    settleCompleted(this.seam, value);
  }

  stop(reason: RunStopReason, failure?: WorkflowError, successor?: string): void {
    settleStopped(this.seam, reason, failure, successor);
  }

  fail(failure: WorkflowError): void {
    this.seam.failRun(failure);
  }

  askSubmitAttempted(instance: InstanceRef, payload: unknown): void {
    this.asks.submitAttempted(instance, payload);
  }

  askTurnEnded(instance: InstanceRef, finalText: string): void {
    this.asks.turnEnded(instance, finalText);
  }

  askProgress(instance: InstanceRef, progress: AskProgress): void {
    if (!this.seam.isRunSettled())
      this.seam.record({ instance, type: "node-progress", ...progress });
  }

  askStats(instance: InstanceRef, stats: AskStats): void {
    this.asks.noteStats(instance, stats);
    const total = this.seam.addUsage(stats.tokens);
    if (!this.seam.isRunSettled()) this.seam.record({ spentTokens: total, type: "usage-updated" });
  }

  askFailed(instance: InstanceRef, failure: WorkflowError): void {
    this.asks.failed(instance, failure);
  }

  stopRun(failure: WorkflowError): void {
    this.stop("provider", this.phases.decorateStop(failure));
  }

  runStalled(stall: RunStallInfo): void {
    if (!this.seam.isRunSettled()) this.seam.record({ type: "run-stalled", ...stall });
  }

  askWaiting(instance: InstanceRef, info: AskWaitInfo): void {
    if (!this.seam.isRunSettled() && this.asks.isLive(instance))
      this.seam.record({ instance, type: "node-waiting", ...info });
  }

  askExecuting(instance: InstanceRef): void {
    if (!this.seam.isRunSettled() && this.asks.isLive(instance))
      this.seam.record({ instance, type: "node-executing" });
  }

  askMutating(instance: InstanceRef): void {
    if (this.seam.isRunSettled() || !this.asks.isLive(instance)) return;
    closeImportCache(this.seam, instance, "mutating-tool", this.asks.liveActorName(instance));
  }

  concurrencyChanged(change: ConcurrencyChange): void {
    if (!this.seam.isRunSettled()) this.seam.record({ type: "concurrency-changed", ...change });
  }

  private ensureOpen(action: string): void {
    if (!this.seam.isRunSettled()) return;
    if (this.seam.failure !== undefined) throw this.seam.failure;
    throw new WorkflowError("Cancelled", `Run already settled; ${action} is no longer accepted.`);
  }
}
