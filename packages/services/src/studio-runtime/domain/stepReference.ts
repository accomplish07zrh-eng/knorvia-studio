import type { StudioStepResult } from "../workflowTypes.js";

/** Paths come from the Host snapshot, not a member's claimed destination. */
export function studioStepReference(result: StudioStepResult | undefined): string {
  if (!result) return "";
  if (!result.workspacePath) return result.text;
  return `${result.text}\n\nHost-observed upstream workspace: ${result.workspacePath}\n${result.changesSummary ?? "Inspect the actual upstream files if needed."}\nUpstream files are read-only references: copy needed files into your own workspace before editing; do not modify another member's workspace or the source project.`;
}
