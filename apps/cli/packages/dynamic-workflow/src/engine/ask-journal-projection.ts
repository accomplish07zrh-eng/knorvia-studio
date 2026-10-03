import type { AskNode } from "./scheduler-types.js";
import type { NodeRecord } from "./types.js";

type JournalOutcome =
  | { status: "running" }
  | { status: "completed"; result: unknown }
  | { status: "failed"; error: NodeRecord["error"] };

/** running 与终态使用同一身份投影；字段/键次序是已有 journal 的兼容资料。 */
export function askJournalRecord(
  node: AskNode,
  outcome: JournalOutcome,
  runId: string,
): NodeRecord {
  const row: NodeRecord = {
    runId,
    siteId: node.instance.siteId,
    ordinal: node.instance.ordinal,
    kind: "ask",
    actorSiteId: node.actor.ref.siteId,
    actorOrdinal: node.actor.ref.ordinal,
    actorSeq: node.actorSeq,
    inputHash: node.hash,
    status: outcome.status,
  };
  if (outcome.status !== "running") {
    Object.assign(row, outcome);
    if (node.lastStats !== undefined) row.stats = node.lastStats;
  }
  return row;
}
