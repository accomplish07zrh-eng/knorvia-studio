// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// M0-1 记账第二轮的 Git 与报告解析助手：等价于 git log --follow 的首次加入判定、
// 条件 2 的改名/复制谱系、产品源码范围判定，以及第一轮交还清单的解析。
import { spawn } from "node:child_process";

const TRIGGER_WORDS = [
  "replace",
  "rebuild",
  "rewrite",
  "reimplement",
  "independent",
  "替换",
  "重写",
  "重实现",
  "独立",
];

export function git(cwd, args) {
  return new Promise((accept, reject) => {
    const child = spawn("git", ["-C", cwd, ...args], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out = [];
    const err = [];
    child.on("error", reject);
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.on("close", (code) =>
      code === 0
        ? accept(Buffer.concat(out))
        : reject(new Error(`git ${args[0]} failed (${code}): ${Buffer.concat(err).toString()}`)),
    );
  });
}

// 解析第一轮报告里的交还清单表格：路径、阶段与原因。
export function parseRound1Returns(text) {
  const rows = [];
  let stage = null;
  for (const line of text.split(/\r?\n/)) {
    const heading = /^### 阶段 ([ABC])/.exec(line);
    if (heading) stage = heading[1];
    else if (line.startsWith("### ")) stage = null;
    if (!stage || !line.startsWith("| `")) continue;
    const parts = line.split("|").map((part) => part.trim());
    if (parts.length < 5) continue;
    rows.push({ stage: parts[2], path: parts[1].replace(/^`|`$/g, ""), reason: parts[3] });
  }
  return rows;
}

// 修订后的条件 4 只适用于产品源码：packages/*/src、packages/*/test、
// apps/cli/packages/*/src、apps/cli/packages/*/test 与 scripts/。
export function isProductSource(path) {
  if (path.startsWith("scripts/")) return true;
  const cli = path.startsWith("apps/cli/packages/");
  if (!cli && !path.startsWith("packages/")) return false;
  const rest = cli ? path.slice("apps/cli/packages/".length) : path.slice("packages/".length);
  const parts = rest.split("/");
  return parts.length > 2 && (parts[1] === "src" || parts[1] === "test");
}

// 一次读完历史，之后按 path 取最早记录；等价于 git log --follow --diff-filter=A。
export async function readHistory(repo) {
  const raw = (
    await git(repo, ["log", "--reverse", "--format=C|%H|%cI|%s", "--name-status", "-M"])
  ).toString("utf8");
  const records = new Map();
  const commits = new Map();
  let current = null;
  for (const line of raw.split("\n")) {
    if (!line) continue;
    if (line.startsWith("C|")) {
      const [hash, date, ...rest] = line.slice(2).split("|");
      current = { hash, date, subject: rest.join("|"), files: [] };
      commits.set(hash, current);
      continue;
    }
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const code = line[0];
    const rest = line.slice(tab + 1);
    const [path, from] = code === "R" || code === "C" ? rest.split("\t").reverse() : [rest, null];
    current.files.push(path);
    if (!records.has(path)) records.set(path, []);
    records
      .get(path)
      .push({ code, from, hash: current.hash, date: current.date, subject: current.subject });
  }
  return { records, commits };
}

// 沿改名链回溯到最初的加入提交。
export function lineage(records, path) {
  const chain = [];
  const seen = new Set();
  let cursor = path;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const entries = records.get(cursor);
    if (!entries?.length) break;
    chain.push({ path: cursor, entry: entries[0] });
    cursor = entries[0].code === "R" || entries[0].code === "C" ? entries[0].from : null;
  }
  return chain;
}

export const hasTriggerWord = (text) =>
  TRIGGER_WORDS.some((word) => text.toLowerCase().includes(word.toLowerCase()));
