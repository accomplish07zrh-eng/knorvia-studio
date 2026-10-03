// SPDX-License-Identifier: Apache-2.0
// Candidate authored from the lane behavior contract; source-exposed, pending review.
import { getPathLeaf } from "@/lib/path.js";

export function workspaceFilePathKey(value: string): string {
  const slashPath = value.split("\\").join("/");
  let end = slashPath.length;
  while (end > 0 && slashPath[end - 1] === "/") end -= 1;
  return slashPath.slice(0, end);
}

export function areWorkspaceFilePathsEqual(leftPath: string, rightPath: string): boolean {
  return workspaceFilePathKey(leftPath) === workspaceFilePathKey(rightPath);
}

export function isWorkspaceFilePathInside(workspacePath: string, filePath: string): boolean {
  const root = workspaceFilePathKey(workspacePath);
  const candidate = workspaceFilePathKey(filePath);
  if (candidate === root) return true;
  return candidate.slice(0, root.length + 1) === root + "/";
}

function relativeLocation(workspacePath: string, candidatePath: string) {
  const root = workspaceFilePathKey(workspacePath);
  const candidate = workspaceFilePathKey(candidatePath);
  if (candidate === root || candidate.slice(0, root.length + 1) !== root + "/") return null;
  return {
    segments: candidate
      .slice(root.length + 1)
      .split("/")
      .filter((segment) => segment.length > 0),
    base: workspacePath.replace(/[\\/]+$/, ""),
    separator: candidatePath.includes("\\") && !candidatePath.includes("/") ? "\\" : "/",
  };
}

export function getWorkspaceFileRelativePath(workspacePath: string, filePath: string): string {
  const root = workspaceFilePathKey(workspacePath);
  const candidate = workspaceFilePathKey(filePath);
  if (candidate === root) return ".";
  return candidate.slice(0, root.length + 1) === root + "/"
    ? candidate.slice(root.length + 1)
    : getPathLeaf(filePath);
}

export function getWorkspaceFileAncestorDirectories(
  workspacePath: string,
  filePath: string,
): string[] {
  const location = relativeLocation(workspacePath, filePath);
  if (!location) return [];
  const result: string[] = [];
  for (let length = 1; length < location.segments.length; length += 1) {
    result.push(
      location.base +
        location.separator +
        location.segments.slice(0, length).join(location.separator),
    );
  }
  return result;
}

export function getWorkspaceFileDirectoryChildDepth(
  workspacePath: string,
  directoryPath: string,
): number {
  return relativeLocation(workspacePath, directoryPath)?.segments.length ?? 0;
}

export function getWorkspaceFileParentDirectory(
  workspacePath: string,
  directoryPath: string,
): string | null {
  const location = relativeLocation(workspacePath, directoryPath);
  if (!location) return null;
  const parent = location.segments.slice(0, -1);
  return parent.length === 0
    ? location.base
    : location.base + location.separator + parent.join(location.separator);
}
