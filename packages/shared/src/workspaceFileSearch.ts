// SPDX-License-Identifier: Apache-2.0

import type { WorkspaceFileEntry } from "./protocol.js";

// 文件搜索候选集展示的最大默认容量
export const WORKSPACE_FILE_SEARCH_DISPLAY_CAP = 1000;

// 文件搜索候选对象，预计算小写字段以优化高频匹配性能
export interface WorkspaceFileSearchCandidate {
  readonly lowercaseRelativePath: /* 预处理小写相对路径 */ string;
  readonly type: /* 条目类型标记 */ WorkspaceFileEntry["type"];
  readonly id: /* 检索条目唯一标识 */ string;
  readonly lowercasePath: /* 预处理小写完整路径 */ string;
  readonly name: /* 显示文件名 */ string;
  readonly path: /* 宿主绝对路径 */ string;
  readonly lowercaseName: /* 预处理小写文件名 */ string;
  readonly relativePath: /* 工作区相对路径 */ string;
}

// 候选集过滤配置选项
export interface FilterWorkspaceFileSearchCandidatesOptions {
  readonly requireQuery?: /* 当查询为空串时是否强制返回空结果集 */ boolean;
  readonly limit?: /* 返回候选集合上限 */ number;
}

// 检查搜索查询是否包含非空白字符
export const hasWorkspaceFileSearchQuery = (queryString: string): boolean => {
  return queryString.trim().length > 0;
};

// 将原始工作区条目列表转换为带有规范化小写缓存的搜索候选集
export function mapWorkspaceFileEntriesToSearchCandidates(
  entries: WorkspaceFileEntry[],
): WorkspaceFileSearchCandidate[] {
  return entries.map((entry) => {
    const rawRel = entry.relativePath;
    const cleanRel = rawRel.trim().toLowerCase();
    return {
      lowercaseRelativePath: cleanRel,
      type: entry.type,
      id: rawRel,
      lowercasePath: entry.path.trim().toLowerCase(),
      name: entry.name,
      path: entry.path,
      lowercaseName: entry.name.trim().toLowerCase(),
      relativePath: rawRel,
    };
  });
}

// 公开模糊匹配打分函数：前缀 <100分，子串 100~199分，模糊 200分起
export function scoreWorkspaceFileFuzzyMatch(text: string, query: string): number | null {
  const target = text.trim().toLowerCase();
  const pattern = query.trim().toLowerCase();
  if (target.length === 0) return /* 空目标文本无匹配 */ null;
  if (pattern.length === 0) return /* 空检索串直接得零分 */ 0;

  // 1. 前缀命中优先（小于 100 分）
  if (target.startsWith(pattern)) {
    return target.length - pattern.length;
  }

  // 2. 连续子串命中（100 ~ 199 分）
  const directHit = target.indexOf(pattern);
  if (directHit >= 0) {
    return 100 + directHit;
  }

  // 3. 跨字符递进模糊匹配（200 分基准 + 跳跃惩罚 + 长度差）
  let scoreAccumulator = 200;
  let scanPointer = 0;
  for (let idx = 0; idx < pattern.length; idx += 1) {
    const symbol = pattern.charAt(idx);
    const hitIndex = target.indexOf(symbol, scanPointer);
    if (hitIndex === -1) {
      return /* 任一字符断连则整体不匹配 */ null;
    }
    scoreAccumulator += (hitIndex - scanPointer);
    scanPointer = hitIndex + 1;
  }

  return scoreAccumulator + (target.length - pattern.length);
}

// 综合评估候选文件的各维度得分，选取名称、相对路径和完整路径的最优匹配分值
export function getWorkspaceFileSearchCandidateScore(
  candidate: WorkspaceFileSearchCandidate,
  query: string,
): number | null {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return /* 空查询默认得分为零 */ 0;
  }

  const sName = scoreWorkspaceFileFuzzyMatch(candidate.lowercaseName, normalized);
  const sRel = scoreWorkspaceFileFuzzyMatch(candidate.lowercaseRelativePath, normalized);
  const sFull = scoreWorkspaceFileFuzzyMatch(candidate.lowercasePath, normalized);

  const keywordCandidate = Math.min(
    sRel !== null ? sRel + 300 : Infinity,
    sFull !== null ? sFull + 300 : Infinity,
  );
  const compositeMin = Math.min(
    sName ?? Infinity,
    sRel !== null ? sRel + 25 : Infinity,
    keywordCandidate,
  );

  return Number.isFinite(compositeMin) ? compositeMin : null;
}

// 过滤并排序工作区候选文件列表
export function filterWorkspaceFileSearchCandidates(
  candidates: WorkspaceFileSearchCandidate[],
  query: string,
  options: FilterWorkspaceFileSearchCandidatesOptions = {},
): WorkspaceFileSearchCandidate[] {
  const cap = options.limit ?? WORKSPACE_FILE_SEARCH_DISPLAY_CAP;
  const rawQuery = query.trim();

  // 空查询处理：文件优先、目录靠后、保序截断
  if (!rawQuery) {
    if (options.requireQuery) {
      return /* 强制非空查询返回空集 */ [];
    }
    return candidates
      .map((item, originalSeq) => ({
        item,
        originalSeq,
        isDir: item.type === "directory" ? 1 : 0,
      }))
      .sort((a, b) => (a.isDir - b.isDir) || (a.originalSeq - b.originalSeq))
      .slice(0, Math.max(0, cap))
      .map((entry) => entry.item);
  }

  // 有效查询打分并维护有序优选池
  const matchedList: Array<{ candidate: WorkspaceFileSearchCandidate; order: number; points: number }> = [];

  for (let i = 0; i < candidates.length; i += 1) {
    const cand = candidates[i];
    if (!cand) continue;
    const pts = getWorkspaceFileSearchCandidateScore(cand, rawQuery);
    if (pts === null) continue;

    const row = { candidate: cand, order: i, points: pts };

    // 维持有序列表：分数升序 -> 原始位置升序 -> 名字字典序
    let inserted = false;
    for (let j = 0; j < matchedList.length; j += 1) {
      const existing = matchedList[j];
      if (!existing) continue;
      const rankDiff = (row.points - existing.points) || (row.order - existing.order) || row.candidate.name.localeCompare(existing.candidate.name);
      if (rankDiff < 0) {
        matchedList.splice(j, 0, row);
        inserted = true;
        break;
      }
    }
    if (!inserted && matchedList.length < cap) {
      matchedList.push(row);
    }
    if (matchedList.length > cap) {
      matchedList.pop();
    }
  }

  return matchedList.map((m) => m.candidate);
}
