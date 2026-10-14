// SPDX-License-Identifier: Apache-2.0
// 专家工作流的运行时上下文：持有定义、端口与时钟；快照、图日志、事件与取消逻辑分别委托给
// runtime-context-*.ts。对外仍是同一个类与同一组方法。
import type {
  ExpertWorkflowRunSnapshot,
  WorkflowActivitySnapshot,
  WorkflowArtifact,
  WorkflowDefinition,
  WorkflowEvent,
  WorkflowNodeStatus,
  WorkflowPhaseDefinition,
  WorkflowPhaseSnapshot,
} from "@knorvia/contracts";
import type { WorkflowGraphNodeChange } from "../lifecycle.js";
import { registerRunAbortSignal } from "./runtime-context-abort.js";
import { appendEvent, type WorkflowEventOptions } from "./runtime-context-events.js";
import {
  defaultActivityId,
  defaultClock,
  defaultRunIdFactory,
  resolveDefinition,
} from "./runtime-context-helpers.js";
import {
  appendGraphNodeStatus,
  appendGraphStatus,
  appendLifecycleGraphChanges,
  writeInitialGraph,
} from "./runtime-context-journal.js";
import {
  getPhaseDefinition as getPhaseDefinitionOfRun,
  resolveSnapshot as resolveSnapshotOfRun,
  timestampOf,
} from "./runtime-context-lookup.js";
import { createInitialSnapshot, type InitialSnapshotInput } from "./runtime-context-snapshot.js";
import {
  addArtifact as addArtifactToRun,
  updatePhase as updatePhaseOfRun,
  updateSnapshot as updateSnapshotOfRun,
  upsertActivity as upsertActivityInRun,
  type SnapshotPatch,
} from "./runtime-context-updates.js";
import type { ExpertWorkflowLookupOptions, ExpertWorkflowRuntimeDeps } from "./types.js";

export {
  compactWorkflowPayload,
  dedupeWorkflowNodeChanges,
  lifecyclePayload,
} from "./runtime-context-payloads.js";
export type { InitialSnapshotInput, SnapshotPatch, WorkflowEventOptions };

/** 委托方法的返回类型：日志与事件写入都是异步完成。 */
type Done = Promise<void>;

/** 取消句柄：dispose 释放监听，signal 供内部运行使用。 */
type AbortHandle = { dispose: () => void; signal: AbortSignal };

/** 运行时上下文：定义、端口、时钟与取消注册表的唯一持有者。 */
export class ExpertWorkflowRuntimeContext {
  declare readonly definition: WorkflowDefinition;
  declare readonly phaseDefinitions: Map<string, WorkflowPhaseDefinition>;
  declare readonly agentRunner: ExpertWorkflowRuntimeDeps["agentRunner"];
  declare readonly store: ExpertWorkflowRuntimeDeps["store"];
  declare readonly now: () => Date;
  declare readonly createActivityId: () => string;
  declare readonly createRunId: () => string;
  declare readonly onWorkflowEvent?: (event: WorkflowEvent) => void | Promise<void>;
  declare readonly activeRunAbortControllers: Map<string, AbortController>;

  constructor(runtimeDeps: ExpertWorkflowRuntimeDeps) {
    const definition = resolveDefinition(runtimeDeps);
    const phaseDefinitions = new Map(
      definition.phases.map((entry) => [entry.phase, entry] as const),
    );
    const { agentRunner, createActivityId, createRunId, now, onWorkflowEvent, store } = runtimeDeps;
    this.definition = definition;
    this.phaseDefinitions = phaseDefinitions;
    this.agentRunner = agentRunner;
    this.store = store;
    this.now = now ?? defaultClock;
    this.createActivityId = createActivityId ?? defaultActivityId;
    this.createRunId = createRunId ?? defaultRunIdFactory(definition.kind);
    this.onWorkflowEvent = onWorkflowEvent;
    this.activeRunAbortControllers = new Map<string, AbortController>();
  }

  createInitialSnapshot(request: InitialSnapshotInput): ExpertWorkflowRunSnapshot {
    return createInitialSnapshot(this, request, this.createRunId());
  }

  async writeInitialGraph(target: ExpertWorkflowRunSnapshot, abort?: AbortSignal): Done {
    await writeInitialGraph(this, target, abort);
  }

  async appendGraphStatus(
    target: ExpertWorkflowRunSnapshot,
    section: string,
    nextStatus: WorkflowNodeStatus,
    abort?: AbortSignal,
  ): Done {
    await appendGraphStatus(this, target, section, nextStatus, abort);
  }

  async appendGraphNodeStatus(
    target: ExpertWorkflowRunSnapshot,
    targetId: string,
    nextStatus: WorkflowNodeStatus,
    abort?: AbortSignal,
    section?: string,
  ): Done {
    await appendGraphNodeStatus(this, target, targetId, nextStatus, abort, section);
  }

  async appendEvent(
    runId: string,
    eventType: WorkflowEvent["type"],
    options: WorkflowEventOptions = {},
  ): Done {
    await appendEvent(this, runId, eventType, options);
  }

  async appendLifecycleGraphChanges(
    target: ExpertWorkflowRunSnapshot,
    changes: readonly WorkflowGraphNodeChange[],
    abort?: AbortSignal,
  ): Done {
    await appendLifecycleGraphChanges(this, target, changes, abort);
  }

  updateSnapshot(
    target: ExpertWorkflowRunSnapshot,
    patch: SnapshotPatch,
  ): ExpertWorkflowRunSnapshot {
    return updateSnapshotOfRun(this, target, patch);
  }

  updatePhase(
    target: ExpertWorkflowRunSnapshot,
    section: string,
    changes: Partial<WorkflowPhaseSnapshot>,
  ): ExpertWorkflowRunSnapshot {
    return updatePhaseOfRun(this, target, section, changes);
  }

  addArtifact(
    target: ExpertWorkflowRunSnapshot,
    entry: WorkflowArtifact,
  ): ExpertWorkflowRunSnapshot {
    return addArtifactToRun(this, target, entry);
  }

  upsertActivity(
    target: ExpertWorkflowRunSnapshot,
    activity: WorkflowActivitySnapshot,
  ): ExpertWorkflowRunSnapshot {
    return upsertActivityInRun(this, target, activity);
  }

  async resolveSnapshot(
    input: ExpertWorkflowLookupOptions,
  ): Promise<ExpertWorkflowRunSnapshot | null> {
    return await resolveSnapshotOfRun(this, input);
  }

  getPhaseDefinition(section: string): WorkflowPhaseDefinition {
    return getPhaseDefinitionOfRun(this, section);
  }

  timestamp(): string {
    const clock = this.now;
    return timestampOf(clock);
  }

  registerRunAbortSignal(runId: string, externalSignal: AbortSignal | undefined): AbortHandle {
    return registerRunAbortSignal(this, runId, externalSignal);
  }
}
