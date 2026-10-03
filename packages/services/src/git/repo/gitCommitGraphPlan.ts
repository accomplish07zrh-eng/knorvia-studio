// Source-exposed graph contribution: ordered query/outcome/ref/field projection.
// Normalizers, argv, error phrases and record/ref expressions retain compatibility.
import type { GitCommitGraphCommit, GitCommitGraphRef } from "@knorvia/shared";
import type { GitCommandExecutionResult } from "../providers/gitCommandProvider.js";
import type { GitCommitGraphSnapshot, GitResolvedRepository } from "./gitCliTypes.js";

const DEFAULT_GIT_GRAPH_MAX_COUNT = 100;
const MAX_GIT_GRAPH_MAX_COUNT = 200;

interface GraphQueryPlan {
  limit: number;
  args: string[];
}

export function planGitCommitGraphQuery(maxCount?: number, skip?: number): GraphQueryPlan {
  const limit = normalizeGitGraphMaxCount(maxCount);
  const offset = normalizeGitGraphSkip(skip);
  return {
    limit,
    args: [
      "log",
      // --all 会把 refs/knorvia/checkpoints 等内部 hidden refs 拉进 Git Graph。
      // Graph 只展示用户可见历史，因此限定到 HEAD、分支、标签和远端分支。
      "HEAD",
      "--branches",
      "--tags",
      "--remotes",
      "--date-order",
      "--topo-order",
      `--skip=${offset}`,
      `--max-count=${limit + 1}`,
      "--format=%H%x00%P%x00%an%x00%at%x00%s%x00%D%x1e",
    ],
  };
}

const UNBORN_LOG_ERRORS = [
  "does not have any commits yet",
  "your current branch",
  "bad default revision",
  "ambiguous argument 'head'",
];

export function projectGitCommitGraphQuery(
  resolution: GitResolvedRepository,
  plan: GraphQueryPlan,
  result: GitCommandExecutionResult,
  ensureSucceeded: (label: string, result: GitCommandExecutionResult) => unknown,
): GitCommitGraphSnapshot {
  if (result.exitCode !== 0) {
    const stderr = result.stderr.toLowerCase();
    if (UNBORN_LOG_ERRORS.some((phrase) => stderr.includes(phrase)))
      return { resolution, commits: [], hasMore: false };
    ensureSucceeded("git log visible refs", result);
  }
  const commits = projectGraphRecords(result.stdout);
  return {
    resolution,
    commits: commits.slice(0, plan.limit),
    hasMore: commits.length > plan.limit,
  };
}

function normalizeGitGraphMaxCount(maxCount: number | undefined): number {
  if (typeof maxCount !== "number" || !Number.isFinite(maxCount)) {
    return DEFAULT_GIT_GRAPH_MAX_COUNT;
  }

  return Math.min(MAX_GIT_GRAPH_MAX_COUNT, Math.max(1, Math.floor(maxCount)));
}

function normalizeGitGraphSkip(skip: number | undefined): number {
  if (typeof skip !== "number" || !Number.isFinite(skip)) {
    return 0;
  }

  return Math.max(0, Math.floor(skip));
}

interface RefRule {
  matches(ref: string): boolean;
  derive(ref: string): GitCommitGraphRef | null;
}
const REF_RULES: readonly RefRule[] = [
  { matches: (ref) => ref === "HEAD", derive: () => ({ name: "HEAD", kind: "head" }) },
  {
    matches: (ref) => ref.startsWith("tag: "),
    derive: (ref) => {
      const tagRef = ref.slice("tag: ".length).trim();
      const name = tagRef.startsWith("refs/tags/") ? tagRef.slice("refs/tags/".length) : tagRef;
      return name ? { name, kind: "tag" } : null;
    },
  },
  ...(
    [
      ["refs/heads/", "branch"],
      ["refs/remotes/", "remote"],
      ["refs/tags/", "tag"],
    ] as const
  ).map(
    ([prefix, kind]): RefRule => ({
      matches: (ref) => ref.startsWith(prefix),
      derive: (ref) => {
        const name = ref.slice(prefix.length);
        return name ? { name, kind } : null;
      },
    }),
  ),
  {
    matches: () => true,
    derive: (ref) => ({ name: ref, kind: ref.includes("/") ? "remote" : "branch" }),
  },
];

function interpretDecorationRef(rawRef: string): GitCommitGraphRef | null {
  const ref = rawRef.trim();
  if (!ref) return null;
  for (const rule of REF_RULES) if (rule.matches(ref)) return rule.derive(ref);
  return null;
}

function* expandDecoration(decoration: string): Generator<GitCommitGraphRef> {
  if (!decoration) return;
  const headPointer = "HEAD -> ";
  if (decoration.startsWith(headPointer)) {
    yield { name: "HEAD", kind: "head" };
    const pointedRef = interpretDecorationRef(decoration.slice(headPointer.length));
    if (pointedRef) yield pointedRef;
  } else {
    const ref = interpretDecorationRef(decoration);
    if (ref) yield ref;
  }
}

function addGitGraphRef(refs: GitCommitGraphRef[], ref: GitCommitGraphRef): void {
  if (refs.some((candidate) => candidate.kind === ref.kind && candidate.name === ref.name)) {
    return;
  }

  refs.push(ref);
}

function projectGraphRefs(rawDecorations: string): GitCommitGraphRef[] {
  const refs: GitCommitGraphRef[] = [];
  for (const rawDecoration of rawDecorations.split(","))
    for (const ref of expandDecoration(rawDecoration.trim())) addGitGraphRef(refs, ref);
  return refs;
}

interface GraphFields {
  hash: string;
  parents: string | undefined;
  authorName: string | undefined;
  subject: string | undefined;
  decorations: string | undefined;
  timestampSeconds: number;
}
type FieldProjection = {
  [Key in keyof GitCommitGraphCommit]: readonly [
    Key,
    (row: GraphFields) => GitCommitGraphCommit[Key],
  ];
}[keyof GitCommitGraphCommit];
const RECORD_FIELDS: readonly FieldProjection[] = [
  ["hash", (row) => row.hash],
  ["parents", (row) => (row.parents ? row.parents.split(" ").filter(Boolean) : [])],
  ["refs", (row) => projectGraphRefs(row.decorations ?? "")],
  ["subject", (row) => row.subject ?? ""],
  ["authorName", (row) => row.authorName || null],
  [
    "authoredAtMs",
    (row) => (Number.isNaN(row.timestampSeconds) ? null : row.timestampSeconds * 1000),
  ],
];

function projectGraphRecords(stdout: string): GitCommitGraphCommit[] {
  // Trim all records before field projection, preserving the legacy phase order.
  const records = stdout
    .split("\x1e")
    .map((record) => record.trim())
    .filter((record) => record.length > 0);
  const projected = records.map((record): GitCommitGraphCommit | null => {
    const [hash, parents, authorName, authoredAtSeconds, subject, decorations] =
      record.split("\x00");
    if (!hash) return null;
    const timestampSeconds = authoredAtSeconds
      ? Number.parseInt(authoredAtSeconds, 10)
      : Number.NaN;
    const row: GraphFields = { hash, parents, authorName, subject, decorations, timestampSeconds };
    return Object.fromEntries(
      RECORD_FIELDS.map(([key, derive]) => [key, derive(row)]),
    ) as unknown as GitCommitGraphCommit;
  });
  return projected.filter((commit): commit is GitCommitGraphCommit => Boolean(commit));
}
