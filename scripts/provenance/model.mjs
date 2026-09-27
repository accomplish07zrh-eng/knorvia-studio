// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { createHash } from "node:crypto";

export const BASELINE_COMMIT = "872ad960de7ec172591f7e1952f7849229f94521";
export const BASELINE_SOURCE = "https://github.com/zai-org/ZCode";
export const REPORT_PATH = "licensing/current-files.json";

export function fingerprint(bytes) {
  let normalized = bytes;
  let encoding = "binary";
  if (!bytes.includes(0)) {
    try {
      const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      normalized = Buffer.from(text.replace(/\r\n/g, "\n"));
      encoding = "utf8-lf";
    } catch {
      // 无效 UTF-8 必须按原字节审计，不能用替代字符造成摘要碰撞。
    }
  }
  const hash = (data) => createHash("sha256").update(data).digest("hex");
  return { sha256: hash(bytes), normalizedSha256: hash(normalized), encoding, bytes: bytes.length };
}

export function currentPath(path) {
  return path.replace(/^apps\/zcode-cli\//, "apps/cli/");
}

export function assertRelativePath(path) {
  if (
    typeof path !== "string" ||
    !path ||
    path.includes("\\") ||
    path.includes("\0") ||
    /^[a-z]:/i.test(path) ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`Invalid repository-relative path: ${JSON.stringify(path)}`);
  }
  return path;
}

export function createIndexes(baseline, reviews, thirdParty) {
  if (baseline.schemaVersion !== 1 || baseline.commit !== BASELINE_COMMIT) {
    throw new Error("Unexpected upstream baseline: review its identity before changing the pin");
  }
  if (reviews.schemaVersion !== 1 || !Array.isArray(reviews.files)) {
    throw new Error("Invalid provenance reviews");
  }
  const byPath = new Map();
  const byDigest = new Map();
  for (const entry of baseline.files) {
    assertRelativePath(entry.path);
    if (!/^[a-f0-9]{64}$/.test(entry.normalizedSha256) || byPath.has(currentPath(entry.path))) {
      throw new Error(`Invalid or duplicate baseline record: ${entry.path}`);
    }
    byPath.set(currentPath(entry.path), entry);
    const key = `${entry.kind}:${entry.normalizedSha256}`;
    const matches = byDigest.get(key) ?? [];
    matches.push(entry);
    byDigest.set(key, matches);
  }
  const reviewed = new Map();
  for (const entry of reviews.files) {
    assertRelativePath(entry.path);
    if (
      reviewed.has(entry.path) ||
      !["original", "independent-replacement", "third-party"].includes(entry.decision) ||
      !/^[a-f0-9]{64}$/.test(entry.normalizedSha256) ||
      !entry.license ||
      !entry.basis?.trim() ||
      !Array.isArray(entry.evidence) ||
      !entry.evidence.length ||
      entry.evidence.some((value) => typeof value !== "string" || !value.trim())
    ) {
      throw new Error(`Invalid or duplicate provenance review: ${entry.path}`);
    }
    reviewed.set(entry.path, entry);
  }
  return { byPath, byDigest, reviewed, copied: thirdParty.copied ?? [] };
}

function thirdPartyReferences(file, copied) {
  return copied.flatMap((component) => {
    const exact = component.files?.find((entry) => currentPath(entry.file) === file.path);
    const inScope = component.roots?.some((root) => {
      const path = currentPath(root);
      return file.path === path || file.path.startsWith(`${path}/`);
    });
    if (!exact && !inScope) return [];
    return [
      {
        id: component.id,
        license: component.license,
        source: component.source,
        scope:
          component.scope ?? "Existing copied-source declaration; full authorship needs review.",
        recordedContentMatches: exact ? exact.sha256 === file.normalizedSha256 : null,
      },
    ];
  });
}

export function classify(file, indexes) {
  const samePath = indexes.byPath.get(file.path);
  const identical = indexes.byDigest.get(`${file.kind}:${file.normalizedSha256}`) ?? [];
  const match = identical.find((entry) => entry === samePath) ?? identical[0];
  const upstream = match ?? samePath;
  const upstreamRelation = match ? "unchanged" : samePath ? "modified" : "not-matched";
  const review = indexes.reviewed.get(file.path);
  const reviewStale = !!review && review.normalizedSha256 !== file.normalizedSha256;
  // 名称替换、目录改名和复制不产生原创权利；相同上游字节与原创决定冲突时必须拒绝。
  const reviewConflict =
    !!match && ["original", "independent-replacement"].includes(review?.decision);
  const reviewAccepted = !!review && !reviewStale && !reviewConflict;
  return {
    ...file,
    classification: reviewAccepted
      ? review.decision
      : upstream
        ? `upstream-${upstreamRelation}`
        : "unreviewed",
    upstream: upstream
      ? {
          relation: upstreamRelation,
          path: upstream.path,
          blob: upstream.blob,
          normalizedSha256: upstream.normalizedSha256,
          contentMatchedPaths: identical.map((entry) => entry.path),
        }
      : null,
    license: reviewAccepted ? review.license : "NOASSERTION",
    defaultLicense: "Apache-2.0; explicit file/component licenses continue to apply",
    thirdParty: thirdPartyReferences(file, indexes.copied),
    review: review
      ? {
          status: reviewStale ? "stale" : reviewConflict ? "conflict" : "accepted",
          decision: review.decision,
          basis: review.basis,
          evidence: review.evidence,
        }
      : null,
  };
}

export function createReport(files, baseline, reviews, thirdParty) {
  const indexes = createIndexes(baseline, reviews, thirdParty);
  const records = files.map((file) => classify(file, indexes));
  const present = new Set(files.map((file) => file.path));
  const missingReviews = [...indexes.reviewed.keys()].filter((path) => !present.has(path));
  records.push({
    path: REPORT_PATH,
    kind: "generated-report",
    classification: "generated-report",
    reason: "Self-hash excluded; generated from the other listed files and review inputs.",
  });
  records.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const counts = {};
  for (const record of records)
    counts[record.classification] = (counts[record.classification] ?? 0) + 1;
  return {
    schemaVersion: 1,
    baseline: { source: BASELINE_SOURCE, commit: baseline.commit },
    scope:
      "Existing tracked and non-ignored untracked files; deleted files absent; symlinks not followed; no source contents. Not an authorship certification or a runtime dependency closure.",
    summary: {
      total: records.length,
      classifications: counts,
      reviewProblems:
        records.filter((file) => file.review && file.review.status !== "accepted").length +
        missingReviews.length,
      missingReviews,
    },
    files: records,
  };
}

export function serializeReport(report) {
  const { files, ...header } = report;
  return `${JSON.stringify(header, null, 2).slice(0, -2)},\n  "files": [\n${files.map((file) => `    ${JSON.stringify(file)}`).join(",\n")}\n  ]\n}\n`;
}

export function equivalentReports(left, right) {
  // Git 的文本检出可归一换行；核验跨平台内容时使用归一摘要，报告仍保留采集时的原字节证据。
  const canonical = (report) => ({
    ...report,
    files: report.files.map((entry) =>
      entry.encoding === "utf8-lf"
        ? { ...entry, sha256: entry.normalizedSha256, bytes: null }
        : entry,
    ),
  });
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}
