// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { readBaselineRepository, readCurrentFiles } from "./git.mjs";
import { createReport, equivalentReports, REPORT_PATH, serializeReport } from "./model.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const { values } = parseArgs({
  options: {
    "baseline-repo": { type: "string" },
    check: { type: "boolean" },
    help: { type: "boolean" },
  },
});
if (values.help) {
  console.log(
    "Provenance: node scripts/provenance/cli.mjs [--check] [--baseline-repo <external Git directory>]",
  );
} else {
  if (values["baseline-repo"]) {
    if (values.check) throw new Error("--check cannot regenerate the baseline");
    const baseline = await readBaselineRepository(resolve(values["baseline-repo"]));
    await writeFile(resolve(root, "licensing/upstream-baseline.json"), serializeReport(baseline));
    console.log(`Pinned upstream fingerprint inventory: ${baseline.files.length} files`);
  }
  const load = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
  const [files, baseline, reviews, thirdParty] = await Promise.all([
    readCurrentFiles(root),
    load("licensing/upstream-baseline.json"),
    load("licensing/reviews.json"),
    load("third-party/inventory.json"),
  ]);
  const report = createReport(files, baseline, reviews, thirdParty);
  const serialized = serializeReport(report);
  if (values.check) {
    const existing = await readFile(resolve(root, REPORT_PATH), "utf8");
    if (!equivalentReports(JSON.parse(existing), report)) {
      throw new Error("Provenance inventory is stale; review changed files and regenerate it");
    }
  } else {
    await writeFile(resolve(root, REPORT_PATH), serialized);
  }
  console.log(JSON.stringify(report.summary, null, 2));
  if (report.summary.reviewProblems) process.exitCode = 1;
}
