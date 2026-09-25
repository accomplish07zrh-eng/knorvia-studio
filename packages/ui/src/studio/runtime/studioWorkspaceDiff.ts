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

/** 可应用路径的纯选择器：冲突或不可应用的变更永远不进入批量应用。 */
export function studioReviewApplicablePaths(changes: readonly StudioWorkspaceChange[]): string[] {
  return changes
    .filter((change) => studioWorkspaceDiff(change).canApply)
    .map((change) => change.path);
}

/** 重新读取后把选择集收敛到当前仍可应用、且仍然存在的路径。 */
export function studioReviewSelection(
  changes: readonly StudioWorkspaceChange[],
  selected: readonly string[],
): string[] {
  const chosen = new Set(selected);
  return studioReviewApplicablePaths(changes).filter((path) => chosen.has(path));
}
