// Source-exposed field decisions; public declarations and model prose remain in the entrypoint.
import type { DynamicWorkflowRunDetail, GetWorkflowRunOutput } from "@knorvia/contracts";
import { describeWorkflowScriptPath } from "./workflow-script-path.js";

type Field = readonly [string, "required" | "optional" | "truthy" | "path"];
const HEADER: readonly Field[] = [
  ["runId", "required"],
  ["label", "required"],
  ["labelSource", "required"],
  ["status", "required"],
  ["stopReason", "optional"],
  ["resumedFrom", "optional"],
  ["maxConcurrency", "optional"],
  ["subagentModel", "optional"],
  ["scriptPath", "path"],
  ["supersededBy", "optional"],
  ["ownedByThisSession", "required"],
  ["possiblyInterrupted", "truthy"],
  ["createdAt", "required"],
  ["updatedAt", "required"],
];
const ACTOR: readonly Field[] = [
  ["siteId", "required"],
  ["ordinal", "required"],
  ["name", "optional"],
];
const LOG: readonly Field[] = [
  ["sequence", "required"],
  ["message", "required"],
  ["at", "optional"],
];
const USAGE = [
  "spentTokens",
  "nodesObserved",
  "nodesRunning",
  "nodesCompleted",
  "nodesFailed",
] as const;
function fields(
  source: object,
  schema: readonly Field[],
  cwd?: () => string | undefined,
): [string, unknown][] {
  const entries: [string, unknown][] = [];
  const record = source as Record<string, unknown>;
  for (const [key, mode] of schema) {
    switch (mode) {
      case "required":
        entries.push([key, record[key]]);
        break;
      case "optional":
        if (record[key] !== undefined) entries.push([key, record[key]]);
        break;
      case "truthy":
        if (record[key]) entries.push([key, true]);
        break;
      case "path":
        if (record[key] !== undefined)
          entries.push([key, describeWorkflowScriptPath(record[key] as string, cwd!())]);
        break;
    }
  }
  return entries;
}
type SnapshotFields = Pick<
  GetWorkflowRunOutput,
  | "runId"
  | "label"
  | "labelSource"
  | "status"
  | "stopReason"
  | "resumedFrom"
  | "maxConcurrency"
  | "subagentModel"
  | "scriptPath"
  | "supersededBy"
  | "ownedByThisSession"
  | "possiblyInterrupted"
  | "createdAt"
  | "updatedAt"
  | "generatedAt"
  | "usage"
  | "actors"
  | "logTail"
>;
export function projectGetWorkflowRunSnapshotFields(
  detail: DynamicWorkflowRunDetail,
  generatedAt: number,
  cwd: () => string | undefined,
): SnapshotFields {
  const entries = fields(detail, HEADER, cwd);
  entries.push(["generatedAt", generatedAt]);
  // Each counter re-reads detail.usage: adapter getters can provide successive snapshots.
  entries.push(["usage", Object.fromEntries(USAGE.map((key) => [key, detail.usage[key]]))]);
  entries.push(["actors", detail.actors.map((actor) => Object.fromEntries(fields(actor, ACTOR)))]);
  entries.push(["logTail", detail.logTail.map((entry) => Object.fromEntries(fields(entry, LOG)))]);
  return Object.fromEntries(entries) as SnapshotFields;
}
