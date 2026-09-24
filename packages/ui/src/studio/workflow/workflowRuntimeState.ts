import type { StudioTimeline } from "@knorvia/services";
import type { StudioWorkflow } from "./types.js";

/** Derive badges from persisted facts only, never infer running nodes from graph position. */
export function workflowNodeStates(workflow: StudioWorkflow, timeline?: StudioTimeline) {
  const states = new Map<string, string>();
  const runs = timeline?.runs
    .filter((item) => item.kind === "workflow")
    .sort((a, b) => b.createdAt - a.createdAt);
  const run = runs?.find((item) => ["running", "waiting"].includes(item.state)) ?? runs?.[0];
  if (!run) return states;
  const active = ["running", "waiting"].includes(run.state);
  for (const node of workflow.nodes) {
    const cached = run.checkpoint.values[JSON.stringify(["workflow-node", node.id])];
    if (cached) {
      try {
        const result = JSON.parse(cached) as { status?: string };
        if (
          result.status &&
          ["succeeded", "skipped", "failed", "denied", "cancelled", "interrupted"].includes(
            result.status,
          )
        )
          states.set(node.id, result.status);
      } catch {
        /* A malformed cache is not evidence of progress. */
      }
    }
    const attempts = Object.entries(run.checkpoint.steps)
      .filter(([id]) => id.startsWith(`workflow:${node.id}:attempt:`))
      .sort(([a], [b]) => Number(b.split(":").at(-1)) - Number(a.split(":").at(-1)));
    if (attempts[0]) states.set(node.id, attempts[0][1].status);
    const turn = timeline?.turns?.find(
      (item) =>
        item.runId === run.id &&
        item.attempt === run.attempt &&
        item.stepId.startsWith(`workflow:${node.id}:attempt:`) &&
        item.state === "running",
    );
    if (active && turn) states.set(node.id, "running");
    if (
      active &&
      timeline?.interactions.some(
        (item) =>
          item.runId === run.id &&
          item.status === "pending" &&
          (item.turnId === turn?.id ||
            item.turnId ===
              `${run.id}:attempt:${run.attempt}:confirm:workflow:${node.id}:approval`),
      )
    )
      states.set(node.id, "waiting");
  }
  return states;
}
