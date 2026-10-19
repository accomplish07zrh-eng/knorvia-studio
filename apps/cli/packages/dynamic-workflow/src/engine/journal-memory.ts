// SPDX-License-Identifier: Apache-2.0
// Knorvia 动态工作流内存事件日志存储实现。
// 贴合 JournalStorePort 规约，通过深拷贝维护存储边界，支持多 run 隔离。

import type {
  ActorRecord,
  JournalStorePort,
  ListEventsOptions,
  NodeRecord,
  RunEvent,
  RunRecord,
  RunSettlementRecord,
  RunStatus,
  StoredEvent,
} from "./types.js";

function compositeKey(site: string, ord: number): string {
  return site + "@" + ord;
}

class RunJournalPartition {
  readonly actors = new Map<string, ActorRecord>();
  readonly nodes = new Map<string, NodeRecord>();
  readonly events: StoredEvent[] = [];

  constructor(public record: RunRecord) {}
}

export class InMemoryJournalStore implements JournalStorePort {
  private readonly partitions = new Map<string, RunJournalPartition>();

  createRun(record: RunRecord): void {
    if (this.partitions.has(record.runId)) {
      throw new Error("journal: run " + record.runId + " already exists");
    }
    this.partitions.set(record.runId, new RunJournalPartition(structuredClone(record)));
  }

  getRun(runId: string): RunRecord | undefined {
    const part = this.partitions.get(runId);
    return part ? structuredClone(part.record) : undefined;
  }

  updateRunStatus(runId: string, status: RunStatus, settlement?: RunSettlementRecord): void {
    const part = this.requirePartition(runId);
    const target = part.record;
    target.status = status;

    if (status === "pending" || status === "running") {
      delete target.failure;
      delete target.result;
      delete target.stopReason;
      delete target.supersededBy;
      return;
    }

    if (settlement?.stopReason !== undefined) {
      target.stopReason = settlement.stopReason;
    } else {
      delete target.stopReason;
    }

    if (settlement?.supersededBy !== undefined) {
      target.supersededBy = settlement.supersededBy;
    } else {
      delete target.supersededBy;
    }

    if (settlement?.failure !== undefined) {
      target.failure = structuredClone(settlement.failure);
    } else {
      delete target.failure;
    }

    if (settlement?.result !== undefined) {
      target.result = structuredClone(settlement.result);
    }
  }

  updateRunUsage(runId: string, spentTokens: number): void {
    const part = this.requirePartition(runId);
    part.record.spentTokens = spentTokens;
  }

  putActor(record: ActorRecord): void {
    const part = this.requirePartition(record.runId);
    part.actors.set(compositeKey(record.siteId, record.ordinal), structuredClone(record));
  }

  getActor(runId: string, siteId: string, ordinal: number): ActorRecord | undefined {
    const part = this.partitions.get(runId);
    const item = part?.actors.get(compositeKey(siteId, ordinal));
    return item ? structuredClone(item) : undefined;
  }

  listActors(runId: string): ActorRecord[] {
    const part = this.partitions.get(runId);
    if (!part) return [];
    return Array.from(part.actors.values(), (a) => structuredClone(a));
  }

  putNode(record: NodeRecord): void {
    const part = this.requirePartition(record.runId);
    part.nodes.set(compositeKey(record.siteId, record.ordinal), structuredClone(record));
  }

  getNode(runId: string, siteId: string, ordinal: number): NodeRecord | undefined {
    const part = this.partitions.get(runId);
    const item = part?.nodes.get(compositeKey(siteId, ordinal));
    return item ? structuredClone(item) : undefined;
  }

  listNodes(runId: string): NodeRecord[] {
    const part = this.partitions.get(runId);
    if (!part) return [];
    return Array.from(part.nodes.values(), (n) => structuredClone(n));
  }

  appendEvent(runId: string, event: RunEvent): StoredEvent {
    const part = this.requirePartition(runId);
    const stored: StoredEvent = {
      sequence: part.events.length,
      event: structuredClone(event),
      timeCreated: Date.now(),
    };
    part.events.push(stored);
    return structuredClone(stored);
  }

  listEvents(runId: string, opts?: ListEventsOptions): StoredEvent[] {
    const part = this.partitions.get(runId);
    if (!part) return [];

    let stream = part.events;
    if (opts?.afterSequence !== undefined) {
      const boundary = opts.afterSequence;
      stream = stream.filter((evt) => evt.sequence > boundary);
    }
    if (opts?.limit !== undefined) {
      const take = opts.limit > 0 ? opts.limit : 0;
      stream = stream.slice(0, take);
    }
    return stream.map((evt) => structuredClone(evt));
  }

  private requirePartition(runId: string): RunJournalPartition {
    const part = this.partitions.get(runId);
    if (!part) {
      throw new Error("journal: unknown run " + runId);
    }
    return part;
  }
}
