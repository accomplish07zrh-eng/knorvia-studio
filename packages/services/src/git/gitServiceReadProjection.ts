// Source-exposed replacement of selection structure; compatibility predicates,
// path expressions and public record syntax remain retained mixed expressions.
import { resolve } from "node:path";
import type { GitFileChange } from "@knorvia/shared";
import { isPathInWorkspaceScope, normalizeGitPath, toWorkspaceRelativeGitPath } from "./config.js";
import type {
  GitBranchComparisonSnapshot,
  GitStatusEntry,
  GitStatusSnapshot,
} from "./repo/gitCliTypes.js";

interface StatusDecision {
  matches(entry: GitStatusEntry): boolean;
  section: "staged" | "conflicted" | "untracked" | "unstaged";
  stats: "stagedStats" | "unstagedStats" | "untrackedStats" | null;
  visible?(entry: GitStatusEntry, stat: { added: number; removed: number }): boolean;
}

// First match owns the decision: a suppressed untracked record must not fall
// through to ordinary unstaged stats, and conflicts must never acquire a map.
const STATUS_DECISIONS: Record<"staged" | "unstaged", readonly StatusDecision[]> = {
  staged: [
    {
      matches: (entry) => !(entry.isUntracked || entry.isConflicted || !entry.x || entry.x === "."),
      section: "staged",
      stats: "stagedStats",
    },
  ],
  unstaged: [
    { matches: (entry) => entry.isConflicted, section: "conflicted", stats: null },
    {
      matches: (entry) => entry.isUntracked,
      section: "untracked",
      stats: "untrackedStats",
      // Git's zero-line slash-directory fallback remains reviewable. Ordinary
      // zero-line files remain suppressed even when their y marker is non-dot.
      visible: (entry, stat) => entry.path.endsWith("/") || stat.added > 0 || stat.removed > 0,
    },
    {
      matches: (entry) => Boolean(entry.y && entry.y !== "."),
      section: "unstaged",
      stats: "unstagedStats",
    },
  ],
};

function admitsScope(
  workspace: string,
  change: { path: string; originalPath: string | null },
): boolean {
  return (
    isPathInWorkspaceScope(change.path, workspace) ||
    (change.originalPath ? isPathInWorkspaceScope(change.originalPath, workspace) : false)
  );
}

function projectOrdered<T>(
  inputs: T[],
  select: (input: T) => GitFileChange | null,
): GitFileChange[] {
  return inputs.map(select).filter((record): record is GitFileChange => Boolean(record));
}

function statusRecord(
  snapshot: GitStatusSnapshot,
  entry: GitStatusEntry,
  section: StatusDecision["section"],
  added: number,
  removed: number,
): GitFileChange {
  return {
    path: resolve(snapshot.resolution.repoRoot, ...normalizeGitPath(entry.path).split("/")),
    repoRelativePath: entry.path,
    workspaceRelativePath: toWorkspaceRelativeGitPath(
      entry.path,
      snapshot.summary.workspaceInRepoPath,
    ),
    x: entry.x ?? undefined,
    y: entry.y ?? undefined,
    kind: entry.kind,
    section,
    added,
    removed,
    isStaged: section === "staged",
    isUntracked: section === "untracked",
    isConflicted: section === "conflicted",
  };
}

export function getChangesForSource(
  snapshot: GitStatusSnapshot,
  sourceId: "staged" | "unstaged",
): GitFileChange[] {
  return projectOrdered(snapshot.entries, (entry) => {
    if (!admitsScope(snapshot.summary.workspaceInRepoPath, entry)) return null;
    const decisions = STATUS_DECISIONS[sourceId === "staged" ? "staged" : "unstaged"];
    const decision = decisions.find((candidate) => candidate.matches(entry));
    if (!decision) return null;
    const stat = (decision.stats ? snapshot[decision.stats].get(entry.path) : null) ?? {
      added: 0,
      removed: 0,
    };
    if (decision.visible && !decision.visible(entry, stat)) return null;
    // Read stat values before constructing the record, retaining getter/error order.
    return statusRecord(snapshot, entry, decision.section, stat.added, stat.removed);
  });
}

export function getBranchComparisonChanges(snapshot: GitBranchComparisonSnapshot): GitFileChange[] {
  return projectOrdered(snapshot.changes, (change) => {
    if (!admitsScope(snapshot.resolution.workspaceInRepoPath, change)) return null;
    return {
      path: resolve(snapshot.resolution.repoRoot, ...normalizeGitPath(change.path).split("/")),
      repoRelativePath: change.path,
      workspaceRelativePath: toWorkspaceRelativeGitPath(
        change.path,
        snapshot.resolution.workspaceInRepoPath,
      ),
      kind: change.kind,
      section: "branch",
      added: change.added,
      removed: change.removed,
      isStaged: false,
      isUntracked: false,
      isConflicted: false,
    };
  });
}
