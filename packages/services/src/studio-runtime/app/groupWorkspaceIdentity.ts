import type { StudioGroupDefinition } from "../workflowTypes.js";
import { studioProjectKey } from "../domain/projectIdentity.js";
import type { StudioClock, StudioRepository } from "./storePort.js";

function identity(group: StudioGroupDefinition): string {
  return JSON.stringify([
    group.workspacePath ? studioProjectKey(group.workspacePath) : "",
    group.workspaceMode,
  ]);
}

/** Called inside admission's transaction, then frozen on each accepted run. */
export function recordGroupWorkspaceGeneration(
  db: StudioRepository,
  clock: StudioClock,
  group: StudioGroupDefinition,
  previous: StudioGroupDefinition | undefined,
): string {
  const nextIdentity = identity(group);
  const saved = db.read<{ identity: string; generation: string }>("group-workspace", group.id);
  const changed = saved
    ? !previous || saved.identity !== nextIdentity
    : !!previous && identity(previous) !== nextIdentity;
  // The empty generation preserves pre-existing directories and native sessions until changed.
  const generation = changed ? clock.id() : (saved?.generation ?? "");
  if (!saved || changed)
    db.write("group-workspace", group.id, { identity: nextIdentity, generation }, group.id);
  return generation;
}
