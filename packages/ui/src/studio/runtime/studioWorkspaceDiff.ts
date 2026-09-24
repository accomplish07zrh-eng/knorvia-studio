import type { StudioWorkspaceChange } from "@knorvia/services";

/** A binary or missing side must never be presented as an empty text file. */
export function studioWorkspaceDiff(change: StudioWorkspaceChange) {
  const canShowText =
    !change.binary &&
    (change.kind === "added" || change.before !== null) &&
    (change.kind === "deleted" || change.after !== null);
  return {
    canShowText,
    canApply: !change.conflict,
    oldFile: canShowText ? { name: change.path, contents: change.before ?? "" } : null,
    newFile: canShowText ? { name: change.path, contents: change.after ?? "" } : null,
  };
}
