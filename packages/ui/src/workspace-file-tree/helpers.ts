// SPDX-License-Identifier: Apache-2.0
// Label policy candidate; short Set/Error/HTML expressions and URI/sort dependencies retained.
import { sortInstalledEditorsForOpenWith } from "@/lib/openWithEditors.js";
import { toFileUrl } from "@/lib/path.js";
import type { WorkspaceFileTreeRow } from "@/workspace-file-tree/model.js";

export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export function replaceSetValue(set: Set<string>, value: string, present: boolean): Set<string> {
  const next = new Set(set);
  if (present) {
    next.add(value);
  } else {
    next.delete(value);
  }
  return next;
}

const fileManagerLabels = [
  { agent: /mac/i, id: "appHeader.openInFinder" },
  { agent: /windows/i, id: "appHeader.openInFileExplorer" },
] as const;

export function getFileManagerLabel(intl: { formatMessage: (desc: { id: string }) => string }) {
  for (const policy of fileManagerLabels) {
    if (typeof navigator !== "undefined" && policy.agent.test(navigator.userAgent)) {
      return intl.formatMessage({ id: policy.id });
    }
  }
  return intl.formatMessage({ id: "appHeader.openInFileManager" });
}

export function isWorkspaceFileTreeHtmlFile(
  row: Pick<WorkspaceFileTreeRow, "path" | "type">,
): boolean {
  if (row.type !== "file") {
    return false;
  }

  return /\.(?:html|htm)$/i.test(row.path);
}

export function createWorkspaceFileTreeHtmlBrowserUrl(
  row: Pick<WorkspaceFileTreeRow, "path" | "type">,
): string | null {
  if (!isWorkspaceFileTreeHtmlFile(row)) {
    return null;
  }

  return toFileUrl(row.path);
}

export const sortInstalledEditorsForFileTree = sortInstalledEditorsForOpenWith;
