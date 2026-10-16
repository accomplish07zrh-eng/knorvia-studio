// SPDX-License-Identifier: Apache-2.0

import type { WorkspaceFileEntry } from "./protocol.js";

// 路径身份来自工作区条目；折叠文本是打分前算好的小写缓存。
const IDENTITY_KEYS = ["id", "name", "path", "relativePath"] as const;
const FOLDED_TEXT_KEYS = ["lowercaseName", "lowercaseRelativePath", "lowercasePath"] as const;

type EntryKind = WorkspaceFileEntry["type"];

type CandidateIdentity = Record<(typeof IDENTITY_KEYS)[number], string> & {
  type: EntryKind;
};

type CandidateFoldedText = Record<(typeof FOLDED_TEXT_KEYS)[number], string>;

export type WorkspaceFileSearchCandidate = CandidateIdentity & CandidateFoldedText;

// limit 缺省走展示上限；requireQuery 为真时空白查询直接空列表。
export type FilterWorkspaceFileSearchCandidatesOptions = {
  limit?: number;
  requireQuery?: boolean;
};
