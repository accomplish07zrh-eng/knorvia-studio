import type {
  WorkflowEvent,
  WorkflowGraphCollection,
  WorkflowNodeStatus,
  WorkflowRunSnapshot,
} from "@knorvia/contracts";
import { edgeId } from "./graph.js";
import type { AppliedPlannerExpansion, WorkflowGraphSchedulerDeps } from "./types.js";

export class WorkflowSchedulerEventLog {
  readonly #eventPort: WorkflowGraphSchedulerDeps["appendEvent"];
  readonly #graphPort: WorkflowGraphSchedulerDeps["appendGraphRecord"];
  readonly #clock: WorkflowGraphSchedulerDeps["now"];
  readonly #observer: WorkflowGraphSchedulerDeps["onWorkflowEvent"];

  constructor(deps: WorkflowGraphSchedulerDeps) {
    this.#eventPort = deps.appendEvent;
    this.#graphPort = deps.appendGraphRecord;
    this.#clock = deps.now;
    this.#observer = deps.onWorkflowEvent;
  }

  timestamp(): string {
    return this.#clock().toISOString();
  }

  async appendGraphStatus(
    snapshot: WorkflowRunSnapshot,
    nodeId: string,
    phase: string,
    status: WorkflowNodeStatus,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.#graphPort(
      snapshot.runId,
      {
        nodeId,
        phase,
        recordType: "op",
        runId: snapshot.runId,
        status,
        timestamp: this.timestamp(),
        type: "update_status",
      },
      { signal },
    );
  }

  async appendCollectionRecord(
    snapshot: WorkflowRunSnapshot,
    collection: WorkflowGraphCollection,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.#graphPort(
      snapshot.runId,
      {
        collection,
        recordType: "collection",
        runId: snapshot.runId,
        timestamp: this.timestamp(),
      },
      { signal },
    );
  }

  async appendExpansionRecords(
    snapshot: WorkflowRunSnapshot,
    expansion: AppliedPlannerExpansion,
    phase: string,
    signal?: AbortSignal,
  ): Promise<void> {
    for (const node of expansion.addedNodes) {
      await this.#graphPort(
        snapshot.runId,
        {
          node,
          recordType: "node",
          runId: snapshot.runId,
          timestamp: this.timestamp(),
        },
        { signal },
      );
    }

    for (const edge of expansion.addedEdges) {
      await this.#graphPort(
        snapshot.runId,
        {
          edge,
          recordType: "edge",
          runId: snapshot.runId,
          timestamp: this.timestamp(),
        },
        { signal },
      );
    }

    await this.appendCollectionRecord(snapshot, expansion.collection, signal);

    await this.#graphPort(
      snapshot.runId,
      {
        collectionId: expansion.collection.collectionId,
        edgeIds: expansion.addedEdges.map((edge) => edgeId(edge)),
        nodeIds: expansion.addedNodes.map((node) => node.id),
        payload: {
          exhausted: expansion.collection.exhausted,
          plannerRuns: expansion.collection.plannerRuns,
          status: expansion.collection.status,
        },
        phase,
        recordType: "op",
        runId: snapshot.runId,
        timestamp: this.timestamp(),
        type: "graph_expanded",
      },
      { signal },
    );
  }

  async emitEvent(
    snapshot: WorkflowRunSnapshot,
    type: WorkflowEvent["type"],
    options: {
      message?: string;
      nodeId?: string;
      payload?: Record<string, unknown>;
      phase?: string;
      signal?: AbortSignal;
    } = {},
  ): Promise<void> {
    const event: WorkflowEvent = {
      kind: snapshot.kind,
      message: options.message,
      nodeId: options.nodeId,
      payload: options.payload,
      phase: options.phase,
      runId: snapshot.runId,
      timestamp: this.timestamp(),
      type,
    };

    await this.#eventPort(event, { signal: options.signal });
    await this.#observer?.(event);
  }
}
