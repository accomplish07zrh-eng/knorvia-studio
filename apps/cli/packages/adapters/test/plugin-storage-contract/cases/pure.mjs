// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { at, makeCase, syntheticError, events } from "./util.mjs";

export const pureCases = [
  makeCase("H01", ({ assert, facades }) => {
    const api = facades.helpers;
    const root = process.platform === "win32" ? "C:\\synthetic\\root" : "/synthetic/root";
    assert.equal(api.resolveInside(root, ""), root);
    assert.equal(api.resolveInside(root, "."), root);
    assert.equal(
      api.resolveInside(root, "child"),
      process.platform === "win32" ? `${root}\\child` : `${root}/child`,
    );
  }),
  makeCase("H02", ({ assert, facades }) => {
    const root = process.platform === "win32" ? "C:\\synthetic\\root" : "/synthetic/root";
    const absolute = process.platform === "win32" ? "D:\\outside" : "/outside";
    assert.equal(facades.helpers.resolveInside(root, "../outside"), null);
    assert.equal(facades.helpers.resolveInside(root, absolute), null);
  }),
  makeCase("H03", ({ assert, facades }) => {
    const root = process.platform === "win32" ? "C:\\synthetic\\root" : "/synthetic/root";
    assert.equal(facades.helpers.resolveInside(root, "..safe"), null);
  }),
  makeCase("H04", ({ assert, facades }) => {
    assert.equal(
      facades.helpers.sanitizePluginId("Alpha/Beta Name@market"),
      "Alpha-Beta-Name@market",
    );
  }),
  makeCase("H05", ({ assert, facades }) => {
    assert.equal(facades.helpers.sanitizePluginId("插件"), "--");
  }),
  makeCase("H06", ({ assert, facades }) => {
    const fn = facades.helpers.parsePathList;
    assert.deepEqual(fn("a"), ["a"]);
    assert.deepEqual(fn(""), [""]);
    assert.deepEqual(fn(["a", 1, "", null]), ["a", ""]);
    assert.deepEqual(fn(null), []);
  }),
  makeCase("H07", ({ assert, facades }) => {
    const fn = facades.helpers.isPluginOptionValue;
    for (const value of ["x", 1, false]) assert.equal(fn(value), true);
    for (const value of [null, {}, 1n]) assert.equal(fn(value), false);
  }),
  makeCase("H08", ({ assert, facades }) => {
    const fn = facades.helpers.isRecord;
    assert.equal(fn({}), true);
    assert.equal(fn(new Date("2020-01-01T00:00:00.000Z")), true);
    assert.equal(fn([]), false);
    assert.equal(fn(null), false);
  }),
  makeCase(
    "H09",
    ({ assert, facades, runRoot }) => {
      assert.equal(facades.helpers.directoryExists(`${runRoot}/missing-dir`), false);
      assert.equal(facades.helpers.fileExists(`${runRoot}/missing-file`), false);
      assert.equal(facades.helpers.directoryExists(`${runRoot}/denied-dir`), false);
      assert.equal(facades.helpers.fileExists(`${runRoot}/denied-file`), false);
    },
    {
      world: {
        ioFaults: [
          { op: "statSync", pathSuffix: "denied-dir", always: true, code: "EACCES" },
          { op: "statSync", pathSuffix: "denied-file", always: true, code: "EACCES" },
        ],
      },
    },
  ),
  makeCase(
    "H10",
    (context) => {
      const { assert, facades } = context;
      assert.equal(facades.helpers.isMissingPath(at(context, "missing-enoent")), true);
      assert.equal(facades.helpers.isMissingPath(at(context, "missing-enotdir")), true);
      assert.equal(facades.helpers.isMissingPath(at(context, "missing-eacces")), false);
    },
    {
      world: {
        ioFaults: [
          { op: "statSync", pathSuffix: "missing-enoent", always: true, code: "ENOENT" },
          { op: "statSync", pathSuffix: "missing-enotdir", always: true, code: "ENOTDIR" },
          { op: "statSync", pathSuffix: "missing-eacces", always: true, code: "EACCES" },
        ],
      },
    },
  ),
  makeCase("H11", ({ assert, facades }) => {
    assert.equal(facades.helpers.isNotFoundError(syntheticError("ENOENT")), true);
    assert.equal(facades.helpers.isNotFoundError(syntheticError("ENOTDIR")), false);
  }),
  makeCase("H12", ({ assert, facades }) => {
    assert.doesNotThrow(() => facades.helpers.throwIfAborted(undefined));
    assert.doesNotThrow(() => facades.helpers.throwIfAborted({ signal: { aborted: false } }));
    assert.throws(
      () => facades.helpers.throwIfAborted({ signal: { aborted: true } }),
      (error) => error.name === "Error" && error.message === "Plugin operation cancelled",
    );
  }),
  makeCase("H13", async (context) => {
    const { assert, facades } = context;
    let attempts = 0;
    const result = await facades.helpers.cleanupPluginSourceBestEffort(async () => {
      attempts += 1;
      if (attempts < 3) throw new Error(`cleanup-${attempts}`);
    });
    assert.equal(result, undefined);
    assert.equal(attempts, 3);
    assert.deepEqual(
      events(context, "timer.set").map((item) => item.delay),
      [25, 100],
    );

    attempts = 0;
    const final = await facades.helpers.cleanupPluginSourceBestEffort(async () => {
      attempts += 1;
      throw new Error(`final-${attempts}`);
    });
    assert.equal(final.message, "final-3");
    assert.equal(attempts, 3);
    assert.deepEqual(
      events(context, "timer.set").map((item) => item.delay),
      [25, 100, 25, 100],
    );
  }),
  makeCase("H14", ({ assert, facades }) => {
    const primary = new Error("primary");
    primary.name = "PrimaryName";
    primary.code = "PRIMARY";
    const result = facades.helpers.appendPluginSourceCleanupError(primary, new Error("cleanup"));
    assert.equal(result, primary);
    assert.equal(result.name, "PrimaryName");
    assert.equal(result.code, "PRIMARY");
    assert.equal(result.message, "primary; plugin source cleanup also failed: cleanup");
    const marker = { primary: true };
    assert.equal(facades.helpers.appendPluginSourceCleanupError(marker, new Error("x")), marker);
  }),
  makeCase("L01", ({ assert, facades }) => {
    assert.deepEqual(facades.marketplace.normalizeAuthorValue("  Alice  "), { name: "Alice" });
    assert.equal(facades.marketplace.normalizeAuthorValue("   "), undefined);
  }),
  makeCase("L02", ({ assert, facades }) => {
    const fn = facades.marketplace.normalizeAuthorValue;
    assert.deepEqual(fn({ name: " A " }), { name: "A" });
    assert.deepEqual(fn({ url: " https://a.invalid " }), { url: "https://a.invalid" });
    assert.deepEqual(fn({ name: " A ", url: " https://a.invalid " }), {
      name: "A",
      url: "https://a.invalid",
    });
    assert.equal(fn({ name: 7, url: false }), undefined);
    assert.equal(fn([]), undefined);
  }),
  makeCase("L03", ({ assert, facades }) => {
    assert.deepEqual(
      facades.marketplace.parseEntryStoreListing({
        displayName: " Name ",
        icon: " icon ",
        category: " cat ",
        homepage: " https://h.invalid ",
        termsOfService: " terms ",
        heroImage: " hero ",
      }),
      {
        displayName: " Name ",
        icon: " icon ",
        category: " cat ",
        homepage: " https://h.invalid ",
        termsOfService: " terms ",
        heroImage: " hero ",
      },
    );
  }),
  makeCase("L04", ({ assert, facades }) => {
    assert.equal(facades.marketplace.parseEntryStoreListing({ privacyPolicy: "" }), undefined);
  }),
  makeCase("L05", ({ assert, facades }) => {
    assert.deepEqual(
      facades.marketplace.parseEntryStoreListing({
        displayName_i18n: { en: "Name", empty: "", bad: 1 },
      }),
      {
        displayNameI18n: { en: "Name", empty: "" },
      },
    );
  }),
  makeCase("L06", ({ assert, facades }) => {
    assert.deepEqual(
      facades.marketplace.parseEntryStoreListing({ examplePrompts: [" ask ", "", 7] }),
      {
        examplePrompts: [" ask "],
      },
    );
  }),
  makeCase("L07", ({ assert, facades }) => {
    assert.deepEqual(
      facades.marketplace.parseEntryStoreListing({
        examplePrompts_i18n: { zh: [" 提问 ", "", 7], bad: "x" },
      }),
      {
        examplePromptsI18n: { zh: [" 提问 ", ""] },
      },
    );
  }),
  makeCase("L08", ({ assert, facades }) => {
    for (const value of ["true", 1, false]) {
      assert.equal(
        facades.marketplace.parseEntryStoreListing({ requiresPaidPlan: value }),
        undefined,
      );
    }
    assert.deepEqual(facades.marketplace.parseEntryStoreListing({ requiresPaidPlan: true }), {
      requiresPaidPlan: true,
    });
  }),
  makeCase("L09", ({ assert, facades }) => {
    assert.equal(
      facades.marketplace.parseEntryStoreListing({ unknown: "x", displayName: "" }),
      undefined,
    );
  }),
  makeCase("L10", ({ assert, facades }) => {
    const input = {
      displayName: "  Synthetic Tool  ",
      displayName_i18n: { "zh-CN": " 合成工具 ", empty: "", bad: 7 },
      description_i18n: { en: "Description" },
      icon: " icon.svg ",
      category: "tools",
      homepage: " https://example.invalid ",
      privacyPolicy: "",
      termsOfService: " terms ",
      heroImage: " hero.png ",
      author: { name: " Alice ", url: " https://author.invalid " },
      examplePrompts: ["  ask  ", "", 7],
      examplePrompts_i18n: { "zh-CN": [" 提问 ", "", 7], bad: "not-array" },
      requiresPaidPlan: true,
      unknownField: "ignored",
    };
    assert.deepEqual(facades.marketplace.parseEntryStoreListing(input), {
      displayName: "  Synthetic Tool  ",
      displayNameI18n: { "zh-CN": " 合成工具 ", empty: "" },
      descriptionI18n: { en: "Description" },
      icon: " icon.svg ",
      category: "tools",
      homepage: " https://example.invalid ",
      termsOfService: " terms ",
      heroImage: " hero.png ",
      author: "Alice",
      authorUrl: "https://author.invalid",
      examplePrompts: ["  ask  "],
      examplePromptsI18n: { "zh-CN": [" 提问 ", ""] },
      requiresPaidPlan: true,
    });
  }),
  makeCase("G01", ({ assert, facades }) => {
    const withStatus = new facades["zip-source"].PluginZipDownloadError(
      "x",
      "https://download.invalid",
      404,
    );
    assert.equal(withStatus.name, "PluginZipDownloadError");
    assert.equal(withStatus.message, "x");
    assert.equal(withStatus.url, "https://download.invalid");
    assert.equal(withStatus.status, 404);
    const without = new facades["zip-source"].PluginZipDownloadError(
      "x",
      "https://download.invalid",
    );
    assert.equal(without.status, undefined);
  }),
  makeCase("G02", ({ assert, facades }) => {
    const api = facades["source-errors"];
    const error = api.createGitUnavailableError("https://github.com/acme/p.git");
    assert.equal(api.getPluginSourceDiagnosticCode(error), "plugin_git_unavailable");
    assert.equal(
      api.getPluginSourceDiagnosticCode({ diagnosticCode: "plugin_git_unavailable" }),
      undefined,
    );
  }),
  makeCase("G03", ({ assert, facades }) => {
    const api = facades["source-errors"];
    const error = api.createArchiveFetchError(
      "https://alice:hidden@github.com/acme/p.git",
      new Error("failed https://bob:secret@cdn.invalid/a.zip user:pass@host:repo.git"),
    );
    assert.doesNotMatch(error.message, /alice|hidden|bob|secret|user:pass/u);
    assert.doesNotMatch(error.cause.message, /bob|secret|user:pass/u);
  }),
  makeCase("G04", async (context) => {
    const { assert, facades } = context;
    const primary = new Error("p");
    primary.name = "Stable";
    primary.code = "stable-code";
    let count = 0;
    const cleanup = await facades.helpers.cleanupPluginSourceBestEffort(async () => {
      count += 1;
      throw new Error(`c${count}`);
    });
    const attached = facades.helpers.appendPluginSourceCleanupError(primary, cleanup);
    assert.equal(attached, primary);
    assert.equal(attached.name, "Stable");
    assert.equal(attached.code, "stable-code");
    assert.match(attached.message, /c3/u);
    assert.deepEqual(
      events(context, "timer.set").map((item) => item.delay),
      [25, 100],
    );
  }),
  makeCase("G05", ({ assert, facades }) => {
    const primary = "primary";
    assert.equal(
      facades.helpers.appendPluginSourceCleanupError(primary, new Error("cleanup")),
      primary,
    );
  }),
  makeCase(
    "G06",
    (context) => {
      const { assert, facades } = context;
      const errors = ["ENOENT", "ENOTDIR", "EACCES"].map(syntheticError);
      const paths = ["ENOENT", "ENOTDIR", "EACCES"].map((code) =>
        at(context, `missing-${code.toLowerCase()}`),
      );
      assert.deepEqual(paths.map(facades.helpers.isMissingPath), [true, true, false]);
      assert.deepEqual(errors.map(facades.helpers.isNotFoundError), [true, false, false]);
      assert.deepEqual(errors.map(facades["source-errors"].isCommandUnavailableError), [
        true,
        false,
        false,
      ]);
    },
    {
      world: {
        ioFaults: [
          { op: "statSync", pathSuffix: "missing-enoent", always: true, code: "ENOENT" },
          { op: "statSync", pathSuffix: "missing-enotdir", always: true, code: "ENOTDIR" },
          { op: "statSync", pathSuffix: "missing-eacces", always: true, code: "EACCES" },
        ],
      },
    },
  ),
  makeCase("G07", ({ assert, facades }) => {
    const fn = facades["version-compare"].comparePluginVersions;
    assert.equal(fn({ installed: "1.0.0", latest: "2.0.0" }), "update-available");
    assert.equal(fn({ installed: "2.0.0", latest: "2.0.0" }), "none");
    assert.equal(fn({ installed: "2.0.0", latest: "1.0.0" }), "none");
  }),
  makeCase("G08", ({ assert, facades }) => {
    const fn = facades["version-compare"].comparePluginVersions;
    assert.equal(fn({ installed: "edge", latest: "edge" }), "none");
    assert.equal(fn({ installed: "edge", latest: "other" }), "version-changed");
  }),
  makeCase("G09", ({ assert, facades }) => {
    assert.equal(
      facades["version-compare"].comparePluginUpdate({
        installedVersion: undefined,
        latestVersion: "1.0.0",
        installedSha: "old",
        latestSha: "new",
      }),
      "none",
    );
  }),
  makeCase("G10", ({ assert, facades }) => {
    const fn = facades["version-compare"].comparePluginUpdate;
    assert.equal(
      fn({
        installedVersion: undefined,
        latestVersion: undefined,
        installedSha: undefined,
        latestSha: "a",
      }),
      "version-changed",
    );
    assert.equal(
      fn({
        installedVersion: undefined,
        latestVersion: undefined,
        installedSha: "a",
        latestSha: "a",
      }),
      "none",
    );
    assert.equal(
      fn({
        installedVersion: undefined,
        latestVersion: undefined,
        installedSha: "a",
        latestSha: "b",
      }),
      "update-available",
    );
  }),
  makeCase("G11", ({ assert, facades }) => {
    const fn = facades["version-compare"].comparePluginUpdate;
    assert.equal(
      fn({
        installedVersion: undefined,
        latestVersion: undefined,
        installedSha: "bad",
        latestSha: "",
      }),
      "none",
    );
    assert.equal(
      fn({
        installedVersion: undefined,
        latestVersion: undefined,
        installedSha: "bad",
        latestSha: "not-a-hash",
      }),
      "update-available",
    );
  }),
  makeCase("V301", ({ assert, facades }) => {
    const error = facades["source-errors"].createGitUnavailableError("user:pass@host");
    assert.match(error.message, /source user:pass@host,/u);
  }),
  makeCase("V302", ({ assert, facades }) => {
    const error = facades["source-errors"].createGitUnavailableError("user:pass@host:repo");
    assert.match(error.message, /source user:pass@host:repo,/u);
  }),
  makeCase("V303", ({ assert, facades }) => {
    const error = facades["source-errors"].createGitUnavailableError("git@host:repo");
    assert.match(error.message, /source git@host:repo,/u);
  }),
  makeCase("V304", ({ assert, facades }) => {
    const api = facades["source-errors"];
    assert.match(
      api.createGitUnavailableError("https://alice:secret@host.invalid/repo").message,
      /source https:\/\/host\.invalid\/repo,/u,
    );
    assert.match(
      api.createGitUnavailableError("custom://alice:secret@host.invalid/repo").message,
      /source custom:\/\/host\.invalid\/repo,/u,
    );
  }),
  makeCase("V305", ({ assert, facades }) => {
    const api = facades["source-errors"];
    assert.match(
      api.createGitUnavailableError("custom:alice:secret@host").message,
      /source custom:alice:secret@host,/u,
    );
    assert.match(
      api.createGitUnavailableError("safe", "failed custom:alice:secret@host").message,
      /failed configured Git source/u,
    );
    assert.match(
      api.createArchiveFetchError("safe", new Error("failed user:pass@host")).message,
      /failed configured Git source/u,
    );
  }),
  makeCase("V306", ({ assert, facades }) => {
    assert.match(
      facades["source-errors"].createGitUnavailableError("1user:pass@host").message,
      /source configured Git source,/u,
    );
  }),
  makeCase("U05", ({ assert, facades }) => {
    const api = facades["source-errors"];
    const base = "https://github.com/acme/p.git";
    const noReason = api.createGitUnavailableError(base);
    assert.equal(noReason.name, "PluginSourceMaterializationError");
    assert.equal(api.getPluginSourceDiagnosticCode(noReason), "plugin_git_unavailable");
    assert.doesNotMatch(api.createGitUnavailableError(base, "").message, /\(\)/u);
    assert.match(
      api.createGitUnavailableError(base, "synthetic").message,
      / \(synthetic\), but git/u,
    );
  }),
  makeCase("U04", ({ assert, facades }) => {
    const cause = new Error("failed https://bob:secret@cdn.invalid/a.zip user:pass@host:repo.git");
    const error = facades["source-errors"].createArchiveFetchError(
      "https://alice:hidden@github.com/acme/p.git",
      cause,
    );
    assert.doesNotMatch(error.message, /alice|hidden|bob|secret|user:pass/u);
    assert.doesNotMatch(error.cause.message, /bob|secret|user:pass/u);
    assert.notEqual(error.cause, cause);
  }),
  makeCase("U06", ({ assert, facades }) => {
    const api = facades["source-errors"];
    assert.doesNotMatch(
      api.createGitUnavailableError("https://alice:secret@host.invalid/p").message,
      /alice|secret/u,
    );
    assert.match(api.createGitUnavailableError("user:pass@host").message, /user:pass@host/u);
    assert.match(
      api.createGitUnavailableError("1user:pass@host").message,
      /configured Git source/u,
    );
  }),
  makeCase("U07", ({ assert, facades }) => {
    const cause = new Error("failed https://bob:secret@cdn.invalid/a.zip");
    const error = facades["source-errors"].createArchiveFetchError(
      "https://alice:hidden@github.com/acme/p.git",
      cause,
    );
    assert.notEqual(error.cause, cause);
    assert.equal(error.cause.name, "Error");
    assert.doesNotMatch(error.cause.message, /bob|secret/u);
    assert.equal(
      facades["source-errors"].getPluginSourceDiagnosticCode(error),
      "plugin_archive_fetch_failed",
    );
  }),
  makeCase("U08", ({ assert, facades }) => {
    const error = facades["source-errors"].createArchiveFetchError(
      "https://github.com/acme/p.git",
      404,
    );
    assert.match(error.message, /: 404$/u);
    assert.equal(error.cause, undefined);
  }),
  makeCase("U09", ({ assert, facades }) => {
    const error = facades["source-errors"].createGitUnavailableError(
      "https://oauth2:token@host.invalid/p.git?access_token=q#fragment",
    );
    assert.doesNotMatch(error.message, /oauth2:token/u);
    assert.match(error.message, /\?access_token=q#fragment/u);
  }),
  makeCase("S08", ({ assert, facades }) => {
    const source = {
      source: "url",
      type: "zip",
      url: "https://download.invalid/a.zip",
      sha256: "zip-pin",
      sha: "sha-pin",
      commit: "commit-pin",
    };
    assert.equal(facades.marketplace.readPluginSourceIdentityPin(source), "zip-pin");
  }),
  makeCase("S09", ({ assert, facades }) => {
    const source = {
      source: "url",
      type: "zip",
      url: "https://download.invalid/a.zip",
      sha256: "",
      sha: "sha-pin",
      commit: "commit-pin",
    };
    assert.equal(facades["zip-source"].readZipPluginSourceSha256(source), "");
    assert.equal(facades.marketplace.readPluginSourceIdentityPin(source), "sha-pin");
  }),
  makeCase("S10", ({ assert, facades }) => {
    assert.equal(
      facades.marketplace.readPluginSourceIdentityPin({
        source: "git",
        url: "x",
        sha: "",
        commit: "c",
      }),
      "",
    );
  }),
  makeCase("P06", ({ assert, facades }) => {
    // The strict tsc probe is a mandatory runner preflight and is recorded in
    // the suite summary. This per-world assertion remains a distinct runtime
    // facade smoke; it is not used as a substitute for declaration checking.
    for (const [name, module] of Object.entries(facades)) {
      assert.equal(typeof module, "object", `${name} facade loads`);
    }
  }),
];

// Matrix aliases whose assertions are fully covered by the exact public cases above.
