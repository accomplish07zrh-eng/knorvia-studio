import type { GitChangeKind, GitHeadRefType } from "@knorvia/shared";
import type { GitLineStat, GitStatusEntry } from "./gitCliTypes.js";
import { normalizeGitPath } from "#src/git/config.js";

function kindForStatus(status: string): GitChangeKind {
  if (status === "A" || status === "?") return "added";
  if (status === "D") return "deleted";
  if (status === "R" || status === "C") return "renamed";
  return "modified";
}

export function parseStatusPorcelain(stdout: string): {
  branchName: string | null;
  trackingBranchName: string | null;
  headRefType: GitHeadRefType;
  ahead: number;
  behind: number;
  entries: GitStatusEntry[];
} {
  const parsed: ReturnType<typeof parseStatusPorcelain> = {
    branchName: null,
    trackingBranchName: null,
    headRefType: "branch",
    ahead: 0,
    behind: 0,
    entries: [],
  };
  const records = stdout.split("\0").filter((record) => record.length > 0).values();
  for (const record of records) {
    if (record.startsWith("# branch.head ")) {
      const head = record.slice("# branch.head ".length);
      parsed.branchName = head === "(detached)" ? null : head;
      parsed.headRefType = head === "(detached)" ? "detached" : "branch";
      continue;
    }
    if (record.startsWith("# branch.upstream ")) {
      parsed.trackingBranchName = record.slice("# branch.upstream ".length);
      continue;
    }
    if (record.startsWith("# branch.ab ")) {
      const counts = record.slice("# branch.ab ".length);
      parsed.ahead = parseInt(/\+(\d+)/.exec(counts)?.[1] ?? "0", 10);
      parsed.behind = parseInt(/-(\d+)/.exec(counts)?.[1] ?? "0", 10);
      continue;
    }
    if (record.startsWith("# ")) continue;
    if (record.startsWith("? ")) {
      parsed.entries.push({
        path: normalizeGitPath(record.slice(2)),
        originalPath: null,
        kind: "added",
        x: null,
        y: "?",
        isUntracked: true,
        isConflicted: false,
      });
      continue;
    }
    let match: RegExpExecArray | null = null;
    let kind: GitChangeKind | undefined;
    let originalPath: string | null = null;
    let isConflicted = false;
    if (record.startsWith("1 ")) {
      match = /^1 ([^ ]{2}) [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ (.+)$/.exec(record);
      if (!match) continue;
    } else if (record.startsWith("2 ")) {
      match = /^2 ([^ ]{2}) [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ (.+)$/.exec(record);
      if (!match) continue;
      const original = records.next();
      originalPath = !original.done && original.value ? normalizeGitPath(original.value) : null;
      kind = "renamed";
    } else if (record.startsWith("u ")) {
      match = /^u ([^ ]{2}) [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ (.+)$/.exec(record);
      if (!match) continue;
      kind = "modified";
      isConflicted = true;
    } else {
      continue;
    }
    const [, status, path] = match;
    if (status === undefined || status.length !== 2 || path === undefined) continue;
    const x = status.charAt(0);
    const y = status.charAt(1);
    parsed.entries.push({
      path: normalizeGitPath(path),
      originalPath,
      kind: kind ?? kindForStatus(x !== "." ? x : y),
      x,
      y,
      isUntracked: false,
      isConflicted,
    });
  }
  return parsed;
}

export function inferKindFromNumstat(stat: GitLineStat): GitChangeKind {
  if (stat.kind) return stat.kind;
  if (stat.added > 0 && stat.removed === 0) return "added";
  if (stat.removed > 0 && stat.added === 0) return "deleted";
  return "modified";
}

export function parseNumstat(stdout: string): Map<string, GitLineStat> {
  const stats = new Map<string, GitLineStat>();
  const records = stdout.split("\0").values();
  for (const record of records) {
    if (!record) continue;
    const [addedText, removedText, ...pathParts] = record.split("\t");
    if (addedText === undefined || removedText === undefined || pathParts.length === 0) continue;
    const parsedAdded = parseInt(addedText, 10);
    const parsedRemoved = parseInt(removedText, 10);
    const added = Number.isNaN(parsedAdded) ? 0 : parsedAdded;
    const removed = Number.isNaN(parsedRemoved) ? 0 : parsedRemoved;
    const path = pathParts.join("\t");
    if (path) {
      stats.set(normalizeGitPath(path), { added, removed });
    } else {
      const original = records.next();
      const renamed = records.next();
      if (!renamed.done && renamed.value)
        stats.set(normalizeGitPath(renamed.value), {
          added,
          removed,
          kind: "renamed",
          originalPath: normalizeGitPath(original.done ? "" : original.value),
        });
    }
  }
  return stats;
}
