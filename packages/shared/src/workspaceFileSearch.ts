import type { WorkspaceFileEntry } from "@knorvia/shared";

export const WORKSPACE_FILE_SEARCH_DISPLAY_CAP = 1000;

export interface WorkspaceFileSearchCandidate {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  type: WorkspaceFileEntry["type"];
  lowercaseName: string;
  lowercaseRelativePath: string;
  lowercasePath: string;
}

export interface FilterWorkspaceFileSearchCandidatesOptions {
  limit?: number;
  requireQuery?: boolean;
}

interface ScoredCandidate {
  candidate: WorkspaceFileSearchCandidate;
  index: number;
  score: number;
}

export function hasWorkspaceFileSearchQuery(query: string): boolean {
  return query.trim().length > 0;
}

export function mapWorkspaceFileEntriesToSearchCandidates(
  entries: WorkspaceFileEntry[],
): WorkspaceFileSearchCandidate[] {
  return entries.map((entry) => {
    const lowercaseRelativePath = entry.relativePath.trim().toLowerCase();

    return {
      id: entry.relativePath,
      name: entry.name,
      path: entry.path,
      relativePath: entry.relativePath,
      type: entry.type,
      lowercaseName: entry.name.trim().toLowerCase(),
      lowercaseRelativePath,
      lowercasePath: entry.path.trim().toLowerCase(),
    };
  });
}

export function scoreWorkspaceFileFuzzyMatch(text: string, query: string): number | null {
  const normalizedText = text.trim().toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedText.length === 0) {
    return null;
  }
  if (normalizedQuery.length === 0) {
    return 0;
  }
  if (normalizedText.startsWith(normalizedQuery)) {
    return normalizedText.length - normalizedQuery.length;
  }

  const substringIndex = normalizedText.indexOf(normalizedQuery);
  if (substringIndex >= 0) {
    return 100 + substringIndex;
  }

  let score = 200;
  let searchStart = 0;
  for (const character of normalizedQuery) {
    const found = normalizedText.indexOf(character, searchStart);
    if (found === -1) {
      return null;
    }
    score += found - searchStart;
    searchStart = found + 1;
  }

  return score + normalizedText.length - normalizedQuery.length;
}

function scoreNormalizedFuzzyMatch(text: string, query: string): number | null {
  if (text.length === 0) {
    return null;
  }
  if (text.startsWith(query)) {
    return text.length - query.length;
  }

  const substringIndex = text.indexOf(query);
  if (substringIndex >= 0) {
    return 100 + substringIndex;
  }

  let score = 200;
  let searchStart = 0;
  for (const character of query) {
    const found = text.indexOf(character, searchStart);
    if (found === -1) {
      return null;
    }
    score += found - searchStart;
    searchStart = found + 1;
  }

  return score + text.length - query.length;
}

export function getWorkspaceFileSearchCandidateScore(
  candidate: WorkspaceFileSearchCandidate,
  query: string,
): number | null {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return 0;
  }

  const nameScore = scoreNormalizedFuzzyMatch(candidate.lowercaseName, normalizedQuery);
  const relativePathScore = scoreNormalizedFuzzyMatch(
    candidate.lowercaseRelativePath,
    normalizedQuery,
  );
  const pathScore = scoreNormalizedFuzzyMatch(candidate.lowercasePath, normalizedQuery);
  const keywordScore = Math.min(
    relativePathScore !== null ? relativePathScore + 300 : Infinity,
    pathScore !== null ? pathScore + 300 : Infinity,
  );
  const bestScore = Math.min(
    nameScore ?? Infinity,
    relativePathScore !== null ? relativePathScore + 25 : Infinity,
    keywordScore,
  );

  return Number.isFinite(bestScore) ? bestScore : null;
}

function applyLimit<T>(items: T[], limit?: number): T[] {
  if (!Number.isFinite(limit)) {
    return items;
  }

  const safeLimit = Math.max(0, Math.trunc(limit ?? 0));
  return items.slice(0, safeLimit);
}

function sortDefaultCandidates(
  candidates: WorkspaceFileSearchCandidate[],
): WorkspaceFileSearchCandidate[] {
  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      priority: candidate.type === "directory" ? 1 : 0,
    }))
    .sort((left, right) => left.priority - right.priority || left.index - right.index)
    .map(({ candidate }) => candidate);
}

function compareScoredCandidates(left: ScoredCandidate, right: ScoredCandidate): number {
  if (left.score !== right.score) {
    return left.score - right.score;
  }
  if (left.index !== right.index) {
    return left.index - right.index;
  }
  return left.candidate.name.localeCompare(right.candidate.name);
}

function findInsertionIndex(bestMatches: ScoredCandidate[], scored: ScoredCandidate): number {
  let low = 0;
  let high = bestMatches.length;

  while (low < high) {
    const middle = (low + high) >>> 1;
    const middleItem = bestMatches[middle];
    if (middleItem !== undefined && compareScoredCandidates(scored, middleItem) < 0) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }

  return low === bestMatches.length ? -1 : low;
}

export function filterWorkspaceFileSearchCandidates(
  candidates: WorkspaceFileSearchCandidate[],
  query: string,
  options: FilterWorkspaceFileSearchCandidatesOptions = {},
): WorkspaceFileSearchCandidate[] {
  const effectiveLimit = options.limit ?? WORKSPACE_FILE_SEARCH_DISPLAY_CAP;
  const normalizedQuery = query.trim();

  if (normalizedQuery.length === 0) {
    return options.requireQuery
      ? []
      : applyLimit(sortDefaultCandidates(candidates), effectiveLimit);
  }

  const bestMatches: ScoredCandidate[] = [];
  for (const [index, candidate] of candidates.entries()) {
    const score = getWorkspaceFileSearchCandidateScore(candidate, normalizedQuery);
    if (score === null) {
      continue;
    }

    const scored = { candidate, index, score };
    const worst = bestMatches[bestMatches.length - 1];
    if (
      worst !== undefined &&
      bestMatches.length >= effectiveLimit &&
      compareScoredCandidates(scored, worst) >= 0
    ) {
      continue;
    }

    const insertionIndex = findInsertionIndex(bestMatches, scored);
    if (insertionIndex === -1) {
      if (bestMatches.length < effectiveLimit) {
        bestMatches.push(scored);
      }
      continue;
    }

    bestMatches.splice(insertionIndex, 0, scored);
    if (bestMatches.length > effectiveLimit) {
      bestMatches.pop();
    }
  }

  return bestMatches.map(({ candidate }) => candidate);
}
