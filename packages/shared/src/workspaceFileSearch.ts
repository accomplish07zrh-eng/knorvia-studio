// SPDX-License-Identifier: Apache-2.0

import type { WorkspaceFileEntry } from "./protocol.js";
import type {
  FilterWorkspaceFileSearchCandidatesOptions,
  WorkspaceFileSearchCandidate,
} from "./workspace-file-search-types.js";

export type {
  FilterWorkspaceFileSearchCandidatesOptions,
  WorkspaceFileSearchCandidate,
} from "./workspace-file-search-types.js";

// 搜索候选结果列表的最大展示上限
export const WORKSPACE_FILE_SEARCH_DISPLAY_CAP = 1000;

// 检查检索词是否包含实际字符
export const hasWorkspaceFileSearchQuery = (searchQuery: string): boolean => {
  return searchQuery.trim().length > 0;
};

// 内部排序辅助结构
interface ScoredSearchMatch {
  readonly item: WorkspaceFileSearchCandidate;
  readonly matchScore: number;
  readonly arrivalIndex: number;
}

function createSearchCandidate(entry: WorkspaceFileEntry): WorkspaceFileSearchCandidate {
  const rel = entry.relativePath;
  const fileName = entry.name;
  const absPath = entry.path;

  return {
    id: rel,
    name: fileName,
    path: absPath,
    relativePath: rel,
    type: entry.type,
    lowercaseName: fileName.trim().toLowerCase(),
    lowercaseRelativePath: rel.trim().toLowerCase(),
    lowercasePath: absPath.trim().toLowerCase(),
  };
}

// 批量将工作区文件条目转换为带有预处理小写缓存的搜索候选集
export const mapWorkspaceFileEntriesToSearchCandidates = (
  rawEntries: WorkspaceFileEntry[],
): WorkspaceFileSearchCandidate[] => {
  return rawEntries.map(createSearchCandidate);
};

// 递进查找散列字符子序列并累计位置跳跃惩罚
function computeSubsequenceJumpPenalty(haystack: string, needle: string): number | null {
  let penaltySum = 0;
  let searchOffset = 0;

  for (let i = 0; i < needle.length; i += 1) {
    const symbol = needle.charAt(i);
    const pos = haystack.indexOf(symbol, searchOffset);
    if (pos < 0) {
      return null;
    }
    penaltySum += pos - searchOffset;
    searchOffset = pos + 1;
  }

  return penaltySum;
}

// 计算文本与查询词之间的三阶模糊匹配分值
export const scoreWorkspaceFileFuzzyMatch = (rawText: string, rawQuery: string): number | null => {
  const normText = rawText.trim().toLowerCase();
  const normQuery = rawQuery.trim().toLowerCase();

  if (!normText) return null;
  if (!normQuery) return 0;

  // 1. 前缀完全匹配优先，分值为长度差（< 100）
  if (normText.startsWith(normQuery)) {
    return normText.length - normQuery.length;
  }

  // 2. 连续子串匹配，分值为 100 + 出现位点（100 ~ 199）
  const directIndex = normText.indexOf(normQuery);
  if (directIndex >= 0) {
    return 100 + directIndex;
  }

  // 3. 散列字符子序列匹配，分值 200 起
  const jumpPenalty = computeSubsequenceJumpPenalty(normText, normQuery);
  if (jumpPenalty === null) {
    return null;
  }

  return 200 + jumpPenalty + (normText.length - normQuery.length);
};

// 综合文件名、相对路径及绝对路径三项指标计算候选条目最佳得分
export const getWorkspaceFileSearchCandidateScore = (
  targetCandidate: WorkspaceFileSearchCandidate,
  rawQuery: string,
): number | null => {
  const cleanQuery = rawQuery.trim().toLowerCase();
  if (!cleanQuery) {
    return 0;
  }

  const nameMatch = scoreWorkspaceFileFuzzyMatch(targetCandidate.lowercaseName, cleanQuery);
  const relMatch = scoreWorkspaceFileFuzzyMatch(targetCandidate.lowercaseRelativePath, cleanQuery);
  const fullMatch = scoreWorkspaceFileFuzzyMatch(targetCandidate.lowercasePath, cleanQuery);

  const keywordCandidate = Math.min(
    relMatch !== null ? relMatch + 300 : Infinity,
    fullMatch !== null ? fullMatch + 300 : Infinity,
  );

  const overallBest = Math.min(
    nameMatch ?? Infinity,
    relMatch !== null ? relMatch + 25 : Infinity,
    keywordCandidate,
  );

  return Number.isFinite(overallBest) ? overallBest : null;
};

// 过滤并稳定排序工作区候选文件
export const filterWorkspaceFileSearchCandidates = (
  candidateList: WorkspaceFileSearchCandidate[],
  searchPattern: string,
  filterOptions: FilterWorkspaceFileSearchCandidatesOptions = {},
): WorkspaceFileSearchCandidate[] => {
  const limitCap = filterOptions.limit ?? WORKSPACE_FILE_SEARCH_DISPLAY_CAP;
  const trimmed = searchPattern.trim();

  // 空搜索词场景：文件优先于目录，同类保留原顺序
  if (!trimmed) {
    if (filterOptions.requireQuery) {
      return [];
    }
    return candidateList
      .slice()
      .sort((a, b) => {
        const aPriority = a.type === "directory" ? 1 : 0;
        const bPriority = b.type === "directory" ? 1 : 0;
        return aPriority - bPriority;
      })
      .slice(0, Math.max(0, limitCap));
  }

  // 单次遍历收集所有匹配项并打分
  const scoredEntries: ScoredSearchMatch[] = [];

  for (let idx = 0; idx < candidateList.length; idx += 1) {
    const cand = candidateList[idx];
    if (!cand) continue;
    const scoreVal = getWorkspaceFileSearchCandidateScore(cand, trimmed);
    if (scoreVal !== null) {
      scoredEntries.push({ item: cand, matchScore: scoreVal, arrivalIndex: idx });
    }
  }

  // 稳定排序：得分升序 -> 出现次序升序 -> 字典序
  scoredEntries.sort((x, y) => {
    if (x.matchScore !== y.matchScore) return x.matchScore - y.matchScore;
    if (x.arrivalIndex !== y.arrivalIndex) return x.arrivalIndex - y.arrivalIndex;
    return x.item.name.localeCompare(y.item.name);
  });

  return scoredEntries.slice(0, Math.max(0, limitCap)).map((entry) => entry.item);
};
