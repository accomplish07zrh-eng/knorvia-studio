// Disclosed copied baseline oracle for timing only; never used by production.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import ts from "typescript";
import { resolutionFixture } from "./git-repository-resolution-fixture-fast-20261001.js";

export async function settlementFixture() {
  const f = await resolutionFixture();
  const data = JSON.parse(
    readFileSync(
      new URL("./git-repository-settlement-legacy-fast-20261001.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(data.commit, "d639823cdfe9e8b6523336c6fce47aa3c30b0535");
  assert.equal(
    data.sourceSha256,
    "60476c3332af0e79f67fc19862926217152ff18f10a9acb1d8f4e4360d91f42c",
  );
  assert.equal(data.spans.length, 10);
  for (const x of data.spans)
    assert.equal(createHash("sha256").update(x.text).digest("hex"), x.sha256);
  const span = (name: string) => data.spans.find((x: { name: string }) => x.name === name).text;
  const source = `function createFrozenRepository(commandProvider, stat, readFile) {
    ${["repositoryResolutionRequests", "workspaceRepositoryInfoRequests", "statusRequests"].map((name) => `const ${span(name)};`).join("\n")}
    ${["normalizeWatchPath", "addAutoRefreshWatchPath", "buildAutoRefreshWatchPaths", "reuseInFlightRequest", "invalidate"].map(span).join("\n")}
    return { invalidate, ${span("resolveRepository")}, ${span("getWorkspaceRepositoryInfo")} };
  }`;
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const config = await import(f.url("git/config"));
  const helpers = await import(f.url("git/repo/gitCliHelpers"));
  const fs = await import("node:fs/promises");
  const factory = new Function(
    "isAbsolute",
    "resolve",
    "normalizeWorkspaceInRepoPath",
    "isMissingWorkingDirectoryResult",
    "isNotRepositoryResult",
    "ensureGitCommandSucceeded",
    "DEFAULT_GIT_COMMAND_TIMEOUT_MS",
    compiled + ";return createFrozenRepository;",
  )(
    isAbsolute,
    resolve,
    config.normalizeWorkspaceInRepoPath,
    helpers.isMissingWorkingDirectoryResult,
    helpers.isNotRepositoryResult,
    helpers.ensureGitCommandSucceeded,
    config.DEFAULT_GIT_COMMAND_TIMEOUT_MS,
  );
  const fixture = (legacy: boolean, options: Parameters<typeof f.fixture>[0]) => {
    const s = f.fixture(options);
    if (legacy) Object.assign(s.repo, factory(s.provider, fs.stat, fs.readFile));
    return s;
  };
  return { fixture };
}
