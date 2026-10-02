import type { WorkspaceFileEntry } from "@knorvia/shared";

export const WORKSPACE_FILE_ENTRIES_CHUNK_SIZE = 4_000_000;

function escapeField(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\n/g, "\\n");
}

function unescapeField(value: string): string {
  return value.replace(/\\(.)/g, (_match, character: string) => {
    if (character === "t") return "\t";
    if (character === "n") return "\n";
    return character;
  });
}

export function packWorkspaceFileEntries(entries: WorkspaceFileEntry[]): string {
  const lines: string[] = [];
  for (const entry of entries) {
    lines.push(`${entry.type}\t${escapeField(entry.relativePath)}`);
  }
  return lines.join("\n");
}

export function unpackWorkspaceFileEntries(packed: string, rootPath: string): WorkspaceFileEntry[] {
  if (packed.length === 0) return [];

  const separator = rootPath.includes("\\") ? "\\" : "/";
  const prefix =
    rootPath.endsWith("/") || rootPath.endsWith("\\") ? rootPath : `${rootPath}${separator}`;
  const entries: WorkspaceFileEntry[] = [];

  for (const line of packed.split("\n")) {
    if (line.length === 0) continue;
    const tabAt = line.indexOf("\t");
    if (tabAt === -1) continue;

    const relativePath = unescapeField(line.slice(tabAt + 1));
    const lastSlash = relativePath.lastIndexOf("/");
    const pathPart = separator === "/" ? relativePath : relativePath.split("/").join("\\");
    entries.push({
      name: lastSlash === -1 ? relativePath : relativePath.slice(lastSlash + 1),
      path: `${prefix}${pathPart}`,
      relativePath,
      type: line.slice(0, tabAt) === "directory" ? "directory" : "file",
    });
  }

  return entries;
}
