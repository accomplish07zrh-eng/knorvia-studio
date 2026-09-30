// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { createHash } from "node:crypto";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const packageKey = (item) => `${item.name}@${item.version}`;

/** 从已经整体校验的文档提取原字节，再按各原 notice 摘要独立核验，不重建版权文本。 */
export function retainedNoticeBlocks(bytes) {
  const text = bytes.toString("latin1");
  const blocks = new Map();
  for (const match of text.matchAll(/^### Notice ([a-f0-9]{64})\r?$/gm)) {
    const startMarker = text.indexOf("\n\n````text\n", match.index + match[0].length);
    if (startMarker < 0) throw new Error("Missing retained notice text block");
    const start = startMarker + "\n\n````text\n".length;
    const end = text.indexOf("\n````", start);
    if (end < 0) throw new Error("Unclosed retained notice text block");
    const original = bytes.subarray(start, end);
    if (hash(original) !== match[1] || blocks.has(match[1]))
      throw new Error(`Retained notice digest mismatch or duplicate: ${match[1]}`);
    const references = bytes
      .subarray(match.index + match[0].length, startMarker)
      .toString("utf8")
      .split("\n")
      .filter((line) => line.startsWith("- "));
    blocks.set(match[1], { bytes: original, references });
  }
  return blocks;
}

export function retainNpmNoticeUnion(current, historical, blocks) {
  const records = new Map();
  for (const item of historical) {
    const key = packageKey(item);
    if (records.has(key)) throw new Error(`Duplicate historical package: ${key}`);
    // 派生清单可被改写，键存在不能证明历史来源；原 notice 必须绑定精确版本及出处。
    if (
      !/^(?:@[^/@\s]+\/)?[^/@\s]+@\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(key) ||
      !Array.isArray(item.notices) ||
      !item.notices.length
    )
      throw new Error(`Unverified historical package notice: ${key}`);
    const notices = item.notices.map((notice) => {
      const retained = blocks.get(notice.sha256);
      if (!retained) throw new Error(`Missing retained publisher notice: ${key} ${notice.sha256}`);
      if (
        typeof notice.member !== "string" ||
        !notice.member.trim() ||
        !retained.references.includes(`- ${key}: ${notice.member}`)
      )
        throw new Error(`Historical notice owner/source mismatch: ${key}`);
      return { member: notice.member, bytes: retained.bytes };
    });
    records.set(key, { ...item, notices, coverage: "retained-prior-declaration" });
  }
  const seen = new Set();
  for (const item of current) {
    const key = packageKey(item);
    if (seen.has(key)) throw new Error(`Duplicate current package: ${key}`);
    seen.add(key);
    const previous = records.get(key);
    const notices = [...(previous?.notices ?? [])];
    for (const notice of item.notices)
      if (
        !notices.some(
          (old) => old.member === notice.member && hash(old.bytes) === hash(notice.bytes),
        )
      )
        notices.push(notice);
    records.set(key, { ...previous, ...item, notices, coverage: "current-production" });
  }
  return [...records.values()];
}
