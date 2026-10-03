// SPDX-License-Identifier: Apache-2.0
// Compatibility entrypoint and preview shapes remain source-exposed and pending review.
import { getPathLeaf } from "@/lib/path.js";
import { inferImageMediaType, inferMediaPreview, type CodeViewerSource } from "@/lib/codeViewer.js";

export type {
  WorkspaceFileGitStatus, WorkspaceFileTreeNode, WorkspaceFileTreeRow,
} from "@/workspace-file-tree/treeProjectionTypes.js";
export {
  areWorkspaceFilePathsEqual,
  getWorkspaceFileAncestorDirectories,
  getWorkspaceFileDirectoryChildDepth,
  getWorkspaceFileParentDirectory,
  getWorkspaceFileRelativePath,
  isWorkspaceFilePathInside,
} from "@/workspace-file-tree/pathProjection.js";
export {
  addDeletedGitStatusRowsToWorkspaceFileTree,
  buildWorkspaceFileGitStatusByPath,
  buildWorkspaceFileIgnoredPathSet,
  getWorkspaceDirectoryGitStatuses,
  getWorkspaceFileGitStatus,
  isWorkspaceFileGitIgnored,
  isWorkspaceFileTreeDeletedFile,
  isWorkspaceFileTreeGitStatusAvailable,
} from "@/workspace-file-tree/gitProjection.js";
export {
  filterWorkspaceFileTreeRows,
  flattenWorkspaceFileTreeRows,
  isWorkspaceFileTreeAutoFlattenableDirectory,
} from "@/workspace-file-tree/rowProjection.js";

export function createCodeViewerSourceForWorkspaceFile(path: string): CodeViewerSource {
  const title = getPathLeaf(path);
  const mediaType = inferImageMediaType(path);
  if (mediaType && mediaType !== "image/svg+xml") return { type: "image", title, path, mediaType };
  const media = inferMediaPreview(path);
  return media ? { type: "media", title, path, ...media } : { type: "file", title, path };
}
