// Source-exposed replacement boundary; inherited declarations/prose remain in the entrypoint.
import {
  ListWorkflowRunsInputSchema,
  type DynamicWorkflowRunListItem,
  type ListWorkflowRunsOutput,
} from "@knorvia/contracts";
import type { ToolHandler } from "../types.js";

type RowKey = keyof DynamicWorkflowRunListItem;
type Field = readonly [RowKey, "value" | "optional" | "truthy"];
// The sequence is observable through adapter getters. Optional fields deliberately read twice.
const ROW_FIELDS: readonly Field[] = [
  ["runId", "value"],
  ["label", "value"],
  ["labelSource", "value"],
  ["status", "value"],
  ["stopReason", "optional"],
  ["resumedFrom", "optional"],
  ["supersededBy", "optional"],
  ["ownedByThisSession", "value"],
  ["possiblyInterrupted", "truthy"],
  ["createdAt", "value"],
  ["updatedAt", "value"],
  ["spentTokens", "value"],
];
function projectRow(item: DynamicWorkflowRunListItem): ListWorkflowRunsOutput["runs"][number] {
  const fields: [string, unknown][] = [];
  for (const [key, admission] of ROW_FIELDS) {
    switch (admission) {
      case "optional":
        if (item[key] !== undefined) fields.push([key, item[key]]);
        break;
      case "truthy":
        if (item[key]) fields.push([key, true]);
        break;
      case "value":
        fields.push([key, item[key]]);
        break;
    }
  }
  return Object.fromEntries(fields) as ListWorkflowRunsOutput["runs"][number];
}

export function createListWorkflowRunsOperation(unavailable: () => unknown): ToolHandler {
  // This returned operation owns the one adapter await; the entrypoint does not await forwarding.
  return async (input, context) => {
    const parsed = ListWorkflowRunsInputSchema.parse(input);
    const port = context.dynamicWorkflowRunPort;
    if (port === undefined || typeof port.listRuns !== "function") return unavailable();
    const result = await port.listRuns({
      cwd: context.workingDirectory,
      limit: parsed.limit,
      ...(parsed.statuses === undefined ? {} : { statuses: parsed.statuses }),
    });
    const output: ListWorkflowRunsOutput = {
      runs: result.runs.map((item) => projectRow(item)),
    };
    if (result.truncated) output.truncated = true;
    return output;
  };
}
