// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// M0-1 记账第二轮的相似度实现：与第一轮报告第 4 节同一算法。
// 只比较文本文件：规范化后统计候选行被同一个上游文件包含的比例，以及最长连续相同段。
import { spawn } from "node:child_process";

export const UPSTREAM_COMMIT = "872ad960de7ec172591f7e1952f7849229f94521";
const POSTING_STRIDE = 4194304;
const PUNCT_ONLY = /^[\s{}()[\];,]*$/;
const SCRIPT_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts"]);

export function normalizeLines(text) {
  const out = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line || PUNCT_ONLY.test(line)) continue;
    if (line.startsWith("import ")) continue;
    if (line.startsWith("export * from") || line.startsWith("export {")) continue;
    out.push(line);
  }
  return out;
}

export function extensionGroup(path) {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "(none)";
  const ext = base.slice(dot + 1).toLowerCase();
  return SCRIPT_EXTENSIONS.has(ext) ? "ts" : ext;
}

// 只读固定上游提交里的文本文件（encoding 为 utf8-lf 的条目）。
export async function readUpstreamTexts(upstreamDir, baseline) {
  if (baseline.commit !== UPSTREAM_COMMIT) throw new Error("Upstream baseline pin changed");
  const wanted = baseline.files.filter((entry) => entry.encoding === "utf8-lf");
  const ids = [...new Set(wanted.map((entry) => entry.blob))];
  const chunks = [];
  const errors = [];
  const child = spawn("git", ["-C", upstreamDir, "cat-file", "--batch"], {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => chunks.push(chunk));
  child.stderr.on("data", (chunk) => errors.push(chunk));
  const done = new Promise((accept, reject) => {
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? accept()
        : reject(new Error(`upstream cat-file failed: ${Buffer.concat(errors)}`)),
    );
  });
  child.stdin.end(`${ids.join("\n")}\n`);
  await done;
  const data = Buffer.concat(chunks);
  const byBlob = new Map();
  let cursor = 0;
  for (const id of ids) {
    const newline = data.indexOf(10, cursor);
    const [actual, type, length] = data.toString("utf8", cursor, newline).split(" ");
    if (actual !== id || type !== "blob") throw new Error(`Invalid upstream object stream: ${id}`);
    const size = Number(length);
    byBlob.set(id, data.subarray(newline + 1, newline + 1 + size));
    cursor = newline + size + 2;
  }
  return wanted.map((entry) => ({ path: entry.path, bytes: byBlob.get(entry.blob) }));
}

export function buildUpstreamIndex(texts) {
  const groups = new Map();
  for (const [index, entry] of texts.entries()) {
    const group = extensionGroup(entry.path);
    if (!groups.has(group)) groups.set(group, new Map());
    const postings = groups.get(group);
    entry.lines = normalizeLines(entry.bytes.toString("utf8"));
    for (const [position, line] of entry.lines.entries()) {
      let list = postings.get(line);
      if (!list) postings.set(line, (list = []));
      list.push(index * POSTING_STRIDE + position);
    }
  }
  return groups;
}

export function containment(candidateLines, index) {
  const counts = new Map();
  const diagonals = new Map();
  const runs = new Map();
  const touched = new Set();
  for (const [position, line] of candidateLines.entries()) {
    const postings = index.get(line);
    if (!postings) continue;
    touched.clear();
    for (const encoded of postings) {
      const file = Math.floor(encoded / POSTING_STRIDE);
      const offset = encoded % POSTING_STRIDE;
      // 每个候选行对每个上游文件只计一次，重复行不能让包含率超过 1。
      if (!touched.has(file)) {
        touched.add(file);
        counts.set(file, (counts.get(file) ?? 0) + 1);
      }
      const key = `${file}:${offset - position}`;
      const previous = diagonals.get(key);
      const run = previous && previous.end === position - 1 ? previous.length + 1 : 1;
      diagonals.set(key, { end: position, length: run });
      if (run > (runs.get(file) ?? 0)) runs.set(file, run);
    }
  }
  let best = -1;
  let bestCount = 0;
  for (const [file, count] of counts) {
    const longer = best >= 0 && (runs.get(file) ?? 0) > (runs.get(best) ?? 0);
    if (count > bestCount || (count === bestCount && longer)) {
      best = file;
      bestCount = count;
    }
  }
  const total = candidateLines.length;
  return {
    ratio: total ? bestCount / total : 0,
    run: best < 0 ? 0 : (runs.get(best) ?? 0),
    file: best,
  };
}

// 门槛：规范化行数 ≥ 10 时包含率 < 0.2 且最长连续段 < 8；< 10 行时包含率必须为 0。
export function passesLineThreshold(entry) {
  if (entry.binary) return true;
  if (entry.normalizedLines < 10) return entry.containment === 0;
  return entry.containment < 0.2 && entry.longestRun < 8;
}
