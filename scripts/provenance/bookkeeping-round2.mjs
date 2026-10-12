// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// M0-1 记账第二轮：计算并幂等追加 licensing/reviews.json 的来源记录。
// 规则见 docs/knorvia-independent-replacement-plan.md 附录「M0-1 记账第二轮做法」。
//
//   node scripts/provenance/bookkeeping-round2.mjs plan  [--upstream <上游 Git 目录>] [--out <plan.json>]
//   node scripts/provenance/bookkeeping-round2.mjs apply [--upstream <上游 Git 目录>] [--spdx <SPDX text 目录>]
//
// 只追加记录：读取现有 reviews.json，跳过已存在的 path，按原文件缩进风格追加，可重复执行。
// 上游树与 SPDX 正文都在仓库外的缓存目录，不进主仓。已复核的许可判定在
// scripts/provenance/bookkeeping-round2-records.mjs，可用 --spdx 对 SPDX 正文重新比对。
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { OWN_FILES, RECORDS } from "./bookkeeping-round2-records.mjs";
import {
  git,
  hasTriggerWord,
  isProductSource,
  lineage,
  parseRound1Returns,
  readHistory,
} from "./bookkeeping-round2-history.mjs";
import {
  buildUpstreamIndex,
  containment,
  extensionGroup,
  normalizeLines,
  passesLineThreshold,
  readUpstreamTexts,
} from "./bookkeeping-round2-similarity.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPORT_PATH = "docs/knorvia-provenance-bookkeeping-20261010.md";
const REVIEWS_PATH = "licensing/reviews.json";
const FIRST_SNAPSHOT = "7619e41b950bd52073ebf36754146cf25659d9fa";
const DEFAULT_UPSTREAM = "D:/tools.cache/knorvia-provenance/upstream.git";
const REVISION_SENTENCE =
  "Replacement wording in the commit describes the documented work, not this file's origin.";
const BASIS_TAIL =
  "Bookkeeping review only; not a claim of independent replacement of any upstream implementation.";

export function fingerprint(bytes) {
  let normalized = bytes;
  if (!bytes.includes(0)) {
    try {
      const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      normalized = Buffer.from(text.replace(/\r\n/g, "\n"));
    } catch {
      // 无效 UTF-8 按原字节登记。
    }
  }
  return createHash("sha256").update(normalized).digest("hex");
}

export const flat = (text) => text.replace(/\s+/g, " ").trim();

export async function buildPlan({ repo, upstreamDir, spdxDir }) {
  const records = RECORDS;
  const rows = parseRound1Returns(await readFile(resolve(repo, REPORT_PATH), "utf8"));
  const condition4Only = rows.filter((row) => row.reason.startsWith("首次加入提交含替换字样："));
  const candidates = condition4Only.filter((row) => !isProductSource(row.path));
  const { records: history, commits } = await readHistory(repo);
  const baseline = JSON.parse(
    await readFile(resolve(repo, "licensing/upstream-baseline.json"), "utf8"),
  );
  const upstreamPaths = new Set(baseline.files.map((entry) => entry.path));
  const texts = await readUpstreamTexts(upstreamDir, baseline);
  const groups = buildUpstreamIndex(texts);
  const notes = { condition4Only: condition4Only.length, candidates: candidates.length };
  notes.waivedProductSource = condition4Only.length - candidates.length;
  const plan = { item1: [], item2: [], item3: [], item4: [], item5: [], returned: [], notes };

  const describe = async (path) => {
    const bytes = await readFile(resolve(repo, path));
    const lines = normalizeLines(bytes.toString("utf8"));
    const simulation = containment(lines, groups.get(extensionGroup(path)) ?? new Map());
    const chain = lineage(history, path);
    const first = chain.length ? chain[chain.length - 1].entry : null;
    const renamed = chain.length > 1;
    return {
      path,
      normalizedSha256: fingerprint(bytes),
      firstAdd: first,
      renamed,
      renameSource: renamed ? chain[0].entry.from : null,
      renameSourceInBaseline: renamed ? upstreamPaths.has(chain[0].entry.from) : false,
      containment: simulation.ratio,
      longestRun: simulation.run,
      upstreamFile: simulation.file >= 0 ? texts[simulation.file].path : null,
      normalizedLines: lines.length,
      binary: bytes.includes(0),
      specs: (commits.get(first?.hash)?.files ?? []).filter(
        (p) => p.startsWith("specs/") && p.endsWith(".md"),
      ),
    };
  };

  const basisFor = (entry, extra) =>
    `Created by Knorvia commit ${entry.firstAdd.hash.slice(0, 8)} (${entry.firstAdd.date.slice(0, 10)}) ` +
    `after the first snapshot 7619e41; not renamed or copied from an upstream path. ` +
    `Max normalized-line containment against fixed upstream 872ad960 is ${entry.containment.toFixed(2)} ` +
    `(${entry.upstreamFile ?? "none"}), longest identical run ${entry.longestRun} lines, below the 0.2 / 8-line ` +
    `thresholds. ${BASIS_TAIL}${extra ? ` ${extra}` : ""}`;

  const originalRecord = (entry, extra) => ({
    path: entry.path,
    normalizedSha256: entry.normalizedSha256,
    decision: "original",
    license: "Apache-2.0",
    basis: basisFor(entry, extra),
    evidence: [
      `git:${entry.firstAdd.hash}`,
      "licensing/upstream-baseline.json",
      ...[...new Set(entry.specs)].sort(),
    ],
  });

  const rejection = (entry) => {
    if (!entry.firstAdd || entry.firstAdd.hash === FIRST_SNAPSHOT)
      return { path: entry.path, reason: "首次加入即首快照 7619e41，条件 1 不通过" };
    if (entry.renamed && entry.renameSourceInBaseline)
      return {
        path: entry.path,
        reason: `从上游路径 ${entry.renameSource} 改名或复制，条件 2 不通过`,
      };
    if (!passesLineThreshold(entry))
      return {
        path: entry.path,
        reason:
          `条件 3 不通过：包含率 ${entry.containment.toFixed(4)}（最相似 ${entry.upstreamFile ?? "none"}），` +
          `最长连续段 ${entry.longestRun} 行`,
      };
    return null;
  };

  // 第 1 类：第一轮只因条件 4 被交还、且不在修订后范围内的文档与证据。
  for (const candidate of candidates) {
    const entry = await describe(candidate.path);
    const reason = rejection(entry);
    if (reason) plan.returned.push(reason);
    else plan.item1.push(originalRecord(entry, REVISION_SENTENCE));
  }

  // 第 2 类：缺少 Publisher-declared license / Evidence 头部行的 third-party/upstream/*.txt。
  if (spdxDir) await verifySpdx(repo, records, spdxDir);
  const missingHeader = rows
    .filter((row) => row.stage === "A" && row.reason.startsWith("缺少 Publisher-declared license"))
    .map((row) => row.path);
  notes.missingHeaderTargets = missingHeader.length;
  for (const path of missingHeader) {
    const id = records.spdxExactMatches[path];
    if (!id) {
      plan.returned.push({
        path,
        reason: `正文与 SPDX ${records.spdxTag} 的许可正文不完全一致，继续交还`,
      });
      continue;
    }
    plan.item2.push({
      path,
      normalizedSha256: fingerprint(await readFile(resolve(repo, path))),
      decision: "third-party",
      license: id,
      basis:
        "Retained third-party licence text for a pinned upstream component; the file carries no " +
        "Publisher-declared license / Evidence header. Its body, with whitespace collapsed and leading and " +
        `trailing blank lines removed, is identical to the SPDX license text ${id} from spdx/license-list-data ` +
        `${records.spdxTag} (text/${id}.txt). ${BASIS_TAIL}`,
      evidence: [
        `https://github.com/spdx/license-list-data/blob/${records.spdxTag}/text/${id}.txt`,
        "third-party/inventory.json",
      ],
    });
  }

  // 第 3 类：只声明公有领域的 7-Zip / LZMA SDK 正文快照。
  const nativeSearch = JSON.parse(
    await readFile(resolve(repo, "third-party/native-search/sources.json"), "utf8"),
  );
  const members = new Map();
  for (const component of nativeSearch.components)
    for (const notice of component.notices ?? []) {
      if (!members.has(notice.file)) members.set(notice.file, []);
      members
        .get(notice.file)
        .push({ component: component.id, version: component.version, member: notice.member });
    }
  const publicDomain = [];
  for (const path of [...members.keys()].sort()) {
    if (!path.startsWith("third-party/native-search/licenses/")) continue;
    if (!members.get(path).some((entry) => entry.component === "ugrep")) continue;
    if (!/public domain/i.test(flat(await readFile(resolve(repo, path), "utf8")))) continue;
    publicDomain.push(path);
  }
  for (const path of publicDomain) {
    const member = members.get(path)[0];
    plan.item3.push({
      path,
      normalizedSha256: fingerprint(await readFile(resolve(repo, path))),
      decision: "third-party",
      license: "LicenseRef-Public-Domain",
      basis:
        `Retained third-party notice snapshot extracted from ${member.member} of the ugrep ${member.version} ` +
        "source archive, bound by third-party/native-search/sources.json. The body only declares public domain " +
        "(Igor Pavlov, 7-Zip LZMA SDK) and names no SPDX license identifier, so the recorded license is " +
        `LicenseRef-Public-Domain. ${BASIS_TAIL}`,
      evidence: ["third-party/native-search/sources.json"],
    });
  }

  // 第 4 类：third-party/ 下未审查的文件。目标 = 当前报告里 third-party/ 的 unreviewed
  // 并集已复核清单，避免重新生成 current-files.json 之后漏掉已经处理过的路径。
  const current = JSON.parse(await readFile(resolve(repo, "licensing/current-files.json"), "utf8"));
  const unreviewed = new Set([
    ...current.files
      .filter(
        (file) => file.classification === "unreviewed" && file.path.startsWith("third-party/"),
      )
      .map((file) => file.path),
    ...Object.keys(records.upstreamNoticeLicenses),
    ...records.item4OriginalCandidates,
    records.lobeIconsLicense.path,
  ]);
  notes.unreviewedThirdParty = unreviewed.size;
  for (const path of [...unreviewed].sort()) {
    const entry = await describe(path);
    const notice = records.upstreamNoticeLicenses[path];
    if (notice) {
      plan.item4.push({
        path,
        normalizedSha256: entry.normalizedSha256,
        decision: "third-party",
        license: notice.license,
        basis:
          `Retained third-party notice snapshot for ${notice.component}, bound by ${notice.evidence[0]}. ` +
          `The body reproduces the ${notice.license} terms; the file was not renamed or copied from an upstream ` +
          `implementation path and is registered as third-party material, not as an original work. ${BASIS_TAIL}`,
        evidence: [...notice.evidence],
      });
      continue;
    }
    if (path === records.lobeIconsLicense.path) {
      plan.item4.push({
        path,
        normalizedSha256: entry.normalizedSha256,
        decision: "third-party",
        license: records.lobeIconsLicense.license,
        basis:
          "Retained third-party licence text for the lobe-icons asset set (LobeHub), shipped into the desktop " +
          "application by packages/desktop/electron-builder.config.js. The body is the MIT licence text with " +
          `"Copyright (c) 2023 LobeHub". Registered third-party with license ${records.lobeIconsLicense.license}. ` +
          BASIS_TAIL,
        evidence: [...records.lobeIconsLicense.evidence],
      });
      continue;
    }
    const reason = rejection(entry);
    if (reason) {
      plan.returned.push(reason);
      continue;
    }
    const waived =
      hasTriggerWord(entry.firstAdd.subject) ||
      (
        await Promise.all(
          entry.specs.map(async (spec) => {
            try {
              const content = (
                await git(repo, ["show", `${entry.firstAdd.hash}:${spec}`])
              ).toString("utf8");
              return hasTriggerWord(content);
            } catch {
              return false;
            }
          }),
        )
      ).some(Boolean);
    plan.item4.push(originalRecord(entry, waived ? REVISION_SENTENCE : ""));
  }

  // 第 5 类：本轮新增的记账工具文件（自登记，license 按各文件头 SPDX）。
  for (const own of OWN_FILES) {
    const bytes = await readFile(resolve(repo, own.path));
    plan.item5.push({
      path: own.path,
      normalizedSha256: fingerprint(bytes),
      decision: "original",
      license: own.license,
      basis: own.basis,
      evidence: [...own.evidence],
    });
  }

  plan.records = [...plan.item1, ...plan.item2, ...plan.item3, ...plan.item4, ...plan.item5];
  const seen = new Set();
  for (const record of plan.records) {
    if (seen.has(record.path)) throw new Error(`Duplicate planned record: ${record.path}`);
    seen.add(record.path);
  }
  notes.records = plan.records.length;
  notes.returned = plan.returned.length;
  return plan;
}

// 重新比对 SPDX 固定 tag 的正文，确认已复核的判定没有漂移。
async function verifySpdx(repo, records, spdxDir) {
  const catalog = new Map();
  for (const name of await readdir(spdxDir)) {
    if (!name.endsWith(".txt")) continue;
    catalog.set(flat(await readFile(join(spdxDir, name), "utf8")), name.slice(0, -4));
  }
  for (const [path, expected] of Object.entries(records.spdxExactMatches)) {
    const id = catalog.get(flat(await readFile(resolve(repo, path), "utf8")));
    if (id !== expected)
      throw new Error(`SPDX comparison changed for ${path}: ${id ?? "no match"}`);
  }
}

export function mergeReviews(raw, newRecords) {
  const data = JSON.parse(raw);
  if (data.schemaVersion !== 1 || !Array.isArray(data.files))
    throw new Error("Invalid provenance reviews");
  const existing = new Set(data.files.map((entry) => entry.path));
  const added = newRecords.filter((record) => !existing.has(record.path));
  if (!added.length) return { text: raw, added: 0 };
  const marker = raw.lastIndexOf("\n  ]\n}");
  if (marker < 0) throw new Error("Unexpected reviews.json layout");
  const blocks = added.map((record) =>
    JSON.stringify(record, null, 2)
      .split("\n")
      .map((line) => `    ${line}`)
      .join("\n"),
  );
  const text = `${raw.slice(0, marker)},\n${blocks.join(",\n")}\n  ]\n}\n`;
  if (JSON.parse(text).files.length !== data.files.length + added.length)
    throw new Error("Merge lost records");
  return { text, added: added.length };
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]).toLowerCase() === resolve(fileURLToPath(import.meta.url)).toLowerCase();
if (invokedDirectly) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      upstream: { type: "string" },
      spdx: { type: "string" },
      out: { type: "string" },
      help: { type: "boolean" },
    },
  });
  const command = positionals[0];
  if (values.help || !["plan", "apply"].includes(command)) {
    console.log(
      "Usage: node scripts/provenance/bookkeeping-round2.mjs <plan|apply> [--upstream <dir>] [--spdx <dir>] [--out <file>]",
    );
  } else {
    const plan = await buildPlan({
      repo: root,
      upstreamDir: values.upstream ?? DEFAULT_UPSTREAM,
      spdxDir: values.spdx,
    });
    if (values.out) await writeFile(resolve(values.out), JSON.stringify(plan, null, 1));
    if (command === "plan") {
      console.log(JSON.stringify(plan.notes, null, 2));
      for (const item of plan.returned) console.log(`  - ${item.path}: ${item.reason}`);
    } else {
      const raw = await readFile(resolve(root, REVIEWS_PATH), "utf8");
      const { text, added } = mergeReviews(raw, plan.records);
      if (added) await writeFile(resolve(root, REVIEWS_PATH), text);
      console.log(JSON.stringify({ ...plan.notes, appended: added }, null, 2));
    }
  }
}
