// SPDX-License-Identifier: Apache-2.0
import {
  studioImagePath,
  type StudioWorkspaceChange,
  type StudioWorkspaceImageRequest,
} from "@knorvia/services";
export function studioReviewedImageVersions(
  changes: readonly StudioWorkspaceChange[],
  paths: readonly string[],
): StudioWorkspaceImageRequest[] | undefined {
  const result = changes
    .filter(
      (change) =>
        change.binary &&
        studioImagePath(change.path) &&
        change.version &&
        paths.includes(change.path),
    )
    .map((change) => ({ path: change.path, version: change.version! }));
  return result.length ? result : undefined;
}
