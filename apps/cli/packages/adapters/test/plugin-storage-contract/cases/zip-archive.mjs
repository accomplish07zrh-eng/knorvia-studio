// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { captureThrow, events, makeCase, pathExists, readText } from "./util.mjs";

const ZIP_BODY = Buffer.from("synthetic-zip-body");
const ZIP_HASH = createHash("sha256").update(ZIP_BODY).digest("hex");
const MiB = 1024 * 1024;

function mode(value) {
  return (value << 16) >>> 0;
}

function file(fileName, text = "x", unixMode = 0o100000) {
  const bytes = Buffer.from(text);
  return {
    fileName,
    externalFileAttributes: mode(unixMode),
    uncompressedSize: bytes.byteLength,
    chunks: [text],
  };
}

function directory(fileName, unixMode = 0o040000) {
  return { fileName, externalFileAttributes: mode(unixMode), uncompressedSize: 0 };
}

function httpSuccess(url = "https://download.invalid/plugin.zip") {
  return { status: 200, url, bodyBase64: ZIP_BODY.toString("base64") };
}

async function resolveHttp(context, entries, input = {}, responses = [httpSuccess(input.url)]) {
  context.world.config.zip = { entries };
  context.world.scripts.http.push(...responses);
  return context.facades["zip-source"].resolveHttpZipSource({
    url: "https://download.invalid/plugin.zip",
    ...input,
  });
}

async function expectZipFailure(context, entries, input, pattern) {
  const error = await captureThrow(() => resolveHttp(context, entries, input));
  context.assert.match(error.message, pattern);
  return error;
}

async function resolveArchive(context, entries, input = {}, response = httpSuccess()) {
  context.world.config.zip = { entries };
  context.world.scripts.http.push(...(Array.isArray(response) ? response : [response]));
  return context.facades["github-archive-source"].resolveGitHubArchiveSource({
    url: "https://github.com/acme/repo.git",
    ...input,
  });
}

export const zipArchiveCases = [
  makeCase("F01", async (context) => {
    for (const status of [301, 302, 303, 307, 308]) {
      const root = await resolveHttp(context, [file("only.txt")], {}, [
        { status, headers: { location: "/next.zip" }, url: "https://download.invalid/plugin.zip" },
        httpSuccess("https://download.invalid/next.zip"),
      ]);
      context.assert.equal(await pathExists(join(root.path, "only.txt")), true);
      await root.cleanup();
    }
    const before = events(context, "http.request").length;
    const ordinary = await captureThrow(() =>
      resolveHttp(context, [file("only.txt")], {}, [
        {
          status: 300,
          headers: { location: "/not-followed.zip" },
          url: "https://download.invalid/plugin.zip",
        },
      ]),
    );
    context.assert.equal(ordinary.status, 300);
    context.assert.equal(events(context, "http.request").length, before + 1);
  }),
  makeCase("F02", async (context) => {
    const redirects = Array.from({ length: 6 }, (_, index) => ({
      status: 302,
      headers: { location: `/hop-${index + 1}.zip` },
      url: `https://download.invalid/hop-${index}.zip`,
    }));
    const error = await captureThrow(() => resolveHttp(context, [file("only.txt")], {}, redirects));
    context.assert.match(error.message, /redirect/iu);
    context.assert.equal(events(context, "http.request").length, 6);
  }),
  makeCase("F03", async (context) => {
    const root = await resolveHttp(
      context,
      [file("only.txt")],
      { headers: { "X-Synthetic": "value" } },
      [
        {
          status: 302,
          headers: { location: "/same.zip" },
          url: "https://download.invalid/plugin.zip",
        },
        {
          status: 302,
          headers: { location: "https://cdn.invalid/final.zip" },
          url: "https://download.invalid/same.zip",
        },
        httpSuccess("https://cdn.invalid/final.zip"),
      ],
    );
    const requests = events(context, "http.request").map((entry) => entry.request.headers);
    context.assert.equal(requests[0]["X-Synthetic"] ?? requests[0]["x-synthetic"], "value");
    context.assert.equal(requests[1]["X-Synthetic"] ?? requests[1]["x-synthetic"], "value");
    context.assert.ok(
      requests[2] === undefined ||
        requests[2] === "<undefined>" ||
        (typeof requests[2] === "object" &&
          requests[2] !== null &&
          Object.keys(requests[2]).length === 0),
    );
    await root.cleanup();
  }),
  makeCase("F04", async (context) => {
    for (const name of ["Authorization", "cOoKiE", "Proxy-Authorization", "SET-cookie"]) {
      const before = events(context, "http.request").length;
      const error = await captureThrow(() =>
        context.facades["zip-source"].resolveHttpZipSource({
          url: "https://download.invalid/plugin.zip",
          headers: { [name]: "secret" },
        }),
      );
      context.assert.match(error.message, /header/iu);
      context.assert.equal(events(context, "http.request").length, before);
    }
    const root = await resolveHttp(context, [file("only.txt")], {
      headers: { Authorizationish: "ok" },
    });
    await root.cleanup();
  }),
  makeCase("F05", async (context) => {
    for (const url of [
      "https://download.invalid/plugin.zip",
      "http://localhost/plugin.zip",
      "http://127.0.0.1/plugin.zip",
      "http://127.255.0.1/plugin.zip",
      "http://[::1]/plugin.zip",
    ]) {
      const root = await resolveHttp(context, [file("only.txt")], { url }, [httpSuccess(url)]);
      await root.cleanup();
    }
    for (const url of [
      "http://example.invalid/a.zip",
      "http://127.0.0.999/a.zip",
      "ftp://localhost/a.zip",
    ]) {
      const error = await captureThrow(() =>
        context.facades["zip-source"].resolveHttpZipSource({ url }),
      );
      context.assert.match(error.message, /https|protocol|loopback|url/iu);
    }
  }),
  makeCase("F06", async (context) => {
    const root = await resolveHttp(context, [file("only.txt")]);
    const request = events(context, "http.request")[0].request;
    const adapterOptions =
      events(context, "http.adapter.construct").at(-1)?.options ??
      events(context, "http.createWebFetchAdapter").at(-1)?.options ??
      {};
    context.assert.equal(request.maxResponseBytes ?? adapterOptions.maxResponseBytes, 200 * MiB);
    context.assert.equal(request.timeoutMs ?? adapterOptions.timeoutMs, 180000);
    await root.cleanup();
    context.world.scripts.http.push({
      error: { httpPortCode: "too_large", message: "Synthetic too large" },
    });
    const error = await captureThrow(() =>
      context.facades["zip-source"].resolveHttpZipSource({
        url: "https://download.invalid/large.zip",
      }),
    );
    context.assert.match(error.message, /too large/iu);
  }),
  makeCase(
    "F07",
    async (context) => {
      const declaredTooLarge = { ...file("huge.bin"), uncompressedSize: 50 * MiB + 1 };
      await expectZipFailure(context, [declaredTooLarge], {}, /50|large|size|limit/iu);
      const tooMany = Array.from({ length: 20001 }, (_, index) => directory(`d${index}/`));
      await expectZipFailure(context, tooMany, {}, /20.?000|entry|limit|many/iu);
      const entryBoundary = Array.from({ length: 20000 }, () => directory("same/"));
      const entryBoundaryRoot = await resolveHttp(context, entryBoundary);
      await entryBoundaryRoot.cleanup();
      const actualSingleOverflow = {
        fileName: "actual-large.bin",
        externalFileAttributes: mode(0o100000),
        uncompressedSize: 1,
        repeat: { count: 51, bytes: MiB },
      };
      await expectZipFailure(context, [actualSingleOverflow], {}, /50|large|size|limit/iu);
      const singleBoundary = {
        fileName: "single-boundary.bin",
        externalFileAttributes: mode(0o100000),
        uncompressedSize: 50 * MiB,
        repeat: { count: 50, bytes: MiB },
      };
      const singleRoot = await resolveHttp(context, [singleBoundary]);
      await singleRoot.cleanup();
      const totalBoundary = Array.from({ length: 500 }, (_, index) => ({
        fileName: `total/f${index}.bin`,
        externalFileAttributes: mode(0o100000),
        uncompressedSize: MiB,
        repeat: { count: 1, bytes: MiB },
      }));
      const totalRoot = await resolveHttp(context, totalBoundary);
      await totalRoot.cleanup();
      const totalOverflow = [
        ...totalBoundary,
        {
          fileName: "total/overflow.bin",
          externalFileAttributes: mode(0o100000),
          uncompressedSize: MiB,
          repeat: { count: 1, bytes: MiB },
        },
      ];
      await expectZipFailure(context, totalOverflow, {}, /500|large|size|limit/iu);
    },
    { timeoutMs: 120000, world: { virtualizeWritesAtBytes: 1 } },
  ),
  makeCase("F08", async (context) => {
    const regularSlash = await resolveHttp(context, [directory("dir/", 0o100000)]);
    context.assert.equal(basename(regularSlash.path), "dir");
    context.assert.equal(await pathExists(regularSlash.path), true);
    await regularSlash.cleanup();
    const directoryNoSlash = await resolveHttp(context, [directory("dir", 0o040000)]);
    context.assert.equal(basename(directoryNoSlash.path), "dir");
    context.assert.equal(await pathExists(directoryNoSlash.path), true);
    await directoryNoSlash.cleanup();
    await expectZipFailure(
      context,
      [{ ...file("secret"), generalPurposeBitFlag: 1 }],
      {},
      /encrypt/iu,
    );
    await expectZipFailure(context, [file("link", "x", 0o120000)], {}, /symbolic|symlink/iu);
    await expectZipFailure(context, [file("fifo", "x", 0o010000)], {}, /special|unsupported/iu);
  }),
  makeCase("F09", async (context) => {
    const attacks = ["", "/abs", "C:/drive", "a\\b", "a//b", "a/./b", "a/../b", "nul\0x"];
    for (const fileName of attacks) {
      const error = await captureThrow(() => resolveHttp(context, [file(fileName)]));
      context.assert.match(error.message, /path|entry|unsafe|invalid|empty/iu, fileName);
    }
  }),
  makeCase("F10", async (context) => {
    const upper = ZIP_HASH.toUpperCase();
    const root = await resolveHttp(context, [file("only.txt")], { sha256: upper });
    await root.cleanup();
    const error = await captureThrow(() =>
      resolveHttp(context, [file("only.txt")], { sha256: "a".repeat(64) }),
    );
    context.assert.match(error.message, /sha|hash|integrity/iu);
  }),
  makeCase("F11", async (context) => {
    const invalid = [
      "http://github.com/acme/repo",
      "https://alice@github.com/acme/repo",
      "https://github.com/acme/repo?q=1",
      "https://github.com/acme/repo#x",
      "https://example.invalid/acme/repo",
      "https://github.com/acme/repo/extra",
      "https://github.com/acme!/repo",
    ];
    for (const url of invalid) {
      const error = await captureThrow(() =>
        context.facades["github-archive-source"].resolveGitHubArchiveSource({ url }),
      );
      context.assert.equal(
        context.facades["github-archive-source"].shouldFallbackGitHubArchiveToGit(error),
        true,
        url,
      );
    }
  }),
  makeCase("F12", async (context) => {
    for (const status of [401, 403, 404]) {
      const error = await captureThrow(() =>
        resolveArchive(
          context,
          [file("root/a")],
          {},
          { status, url: "https://api.github.invalid/archive" },
        ),
      );
      context.assert.equal(
        context.facades["github-archive-source"].shouldFallbackGitHubArchiveToGit(error),
        true,
      );
    }
    for (const entry of [file("root/link", "x", 0o120000), file("root/fifo", "x", 0o010000)]) {
      const error = await captureThrow(() => resolveArchive(context, [entry]));
      context.assert.equal(
        context.facades["github-archive-source"].shouldFallbackGitHubArchiveToGit(error),
        true,
      );
    }
  }),
  makeCase("F13", async (context) => {
    const scenarios = [
      async () =>
        resolveArchive(
          context,
          [file("root/a")],
          {},
          { status: 500, url: "https://api.github.invalid/archive" },
        ),
      async () => {
        context.world.scripts.http.push({
          error: { httpPortCode: "timeout", message: "Synthetic timeout" },
        });
        return context.facades["github-archive-source"].resolveGitHubArchiveSource({
          url: "https://github.com/acme/repo",
        });
      },
      async () => resolveArchive(context, [{ ...file("root/secret"), generalPurposeBitFlag: 1 }]),
      async () =>
        resolveArchive(context, [{ ...file("root/huge"), uncompressedSize: 50 * MiB + 1 }]),
    ];
    for (const scenario of scenarios) {
      const error = await captureThrow(scenario);
      context.assert.equal(
        context.facades["github-archive-source"].shouldFallbackGitHubArchiveToGit(error),
        false,
      );
    }
  }),
  makeCase(
    "U01",
    async (context) => {
      context.world.scripts.http.push({
        status: 404,
        url: "https://alice:secret@download.invalid/a.zip",
      });
      const error = await captureThrow(() =>
        context.facades["zip-source"].resolveHttpZipSource({
          url: "https://alice:secret@download.invalid/a.zip",
        }),
      );
      context.assert.equal(error.name, "PluginZipDownloadError");
      context.assert.equal(error.status, 404);
      context.assert.equal(error.url, "https://download.invalid/a.zip");
    },
    { policy: "required-improvement", requiredOldFailure: true },
  ),
  makeCase(
    "U02",
    async (context) => {
      context.world.scripts.http.push(
        {
          status: 302,
          headers: { location: "https://bob:hidden@cdn.invalid/a.zip" },
          url: "https://download.invalid/a.zip",
        },
        { status: 403, url: "https://bob:hidden@cdn.invalid/a.zip" },
      );
      const error = await captureThrow(() =>
        context.facades["zip-source"].resolveHttpZipSource({
          url: "https://download.invalid/a.zip",
        }),
      );
      context.assert.equal(error.url, "https://cdn.invalid/a.zip");
    },
    { policy: "required-improvement", requiredOldFailure: true },
  ),
  makeCase("U03", ({ assert, facades }) => {
    const error = new facades["zip-source"].PluginZipDownloadError("x", "https://download.invalid");
    assert.equal(error.status, undefined);
  }),
  makeCase("Z01", async (context) => {
    const root = await resolveHttp(context, [directory("dir/", 0o100000)]);
    context.assert.equal(basename(root.path), "dir");
    context.assert.equal(await pathExists(root.path), true);
    await root.cleanup();
  }),
  makeCase("Z02", async (context) => {
    const root = await resolveHttp(context, [directory("dir", 0o040000)]);
    context.assert.equal(basename(root.path), "dir");
    context.assert.equal(await pathExists(root.path), true);
    await root.cleanup();
  }),
  makeCase("Z03", async (context) => {
    const root = await resolveHttp(context, [directory("dir/", 0), file("file", "x", 0)]);
    context.assert.equal(await pathExists(join(root.path, "dir")), true);
    context.assert.equal(await readText({ ...context, runRoot: root.path }, "file"), "x");
    await root.cleanup();
  }),
  makeCase("Z04", async (context) => {
    const error = await captureThrow(() =>
      resolveArchive(context, [file("root/link", "x", 0o120000)]),
    );
    context.assert.equal(
      context.facades["github-archive-source"].shouldFallbackGitHubArchiveToGit(error),
      true,
    );
  }),
  makeCase("Z05", async (context) => {
    const error = await captureThrow(() =>
      resolveArchive(context, [file("root/fifo", "x", 0o010000)]),
    );
    context.assert.equal(
      context.facades["github-archive-source"].shouldFallbackGitHubArchiveToGit(error),
      true,
    );
  }),
  makeCase("Z06", async (context) => {
    const error = await captureThrow(() =>
      resolveArchive(context, [{ ...file("root/secret"), generalPurposeBitFlag: 1 }]),
    );
    context.assert.equal(
      context.facades["github-archive-source"].shouldFallbackGitHubArchiveToGit(error),
      false,
    );
  }),
  makeCase("Z07", async (context) => {
    const root = await resolveHttp(context, [file("only.txt")], {
      requireSingleRoot: true,
      stripRoot: true,
    });
    context.assert.equal(await pathExists(join(root.path, "only.txt")), true);
    await root.cleanup();
  }),
  makeCase("Z08", async (context) => {
    const root = await resolveHttp(context, [file("root/a"), file("root/b")], {
      requireSingleRoot: true,
      stripRoot: true,
    });
    context.assert.equal(basename(root.path), "root");
    await root.cleanup();
  }),
  makeCase("Z09", async (context) => {
    await expectZipFailure(
      context,
      [file("a.txt"), file("b.txt")],
      { requireSingleRoot: true },
      /single|root|segment|top/iu,
    );
  }),
  makeCase("Z10", async (context) => {
    const root = await resolveHttp(context, [file("root/a")], {
      path: "root",
      requireSingleRoot: true,
    });
    context.assert.equal(basename(root.path), "root");
    await root.cleanup();
    await expectZipFailure(
      context,
      [file("root/a")],
      { path: "missing", requireSingleRoot: true },
      /path|directory|missing/iu,
    );
  }),
  makeCase("Z11", async (context) => {
    const error = await captureThrow(() =>
      resolveArchive(context, [
        file("root/other/.gitattributes", "*.bin filter=lfs"),
        file("root/a"),
      ]),
    );
    context.assert.equal(
      context.facades["github-archive-source"].shouldFallbackGitHubArchiveToGit(error),
      true,
    );
  }),
  makeCase("Z12", async (context) => {
    for (const entryName of [
      "root/packages/.gitattributes",
      "root/packages/p/assets/.gitattributes",
    ]) {
      const error = await captureThrow(() =>
        resolveArchive(context, [file(entryName, "*.bin filter=lfs"), file("root/packages/p/a")], {
          path: "packages/p",
        }),
      );
      context.assert.equal(
        context.facades["github-archive-source"].shouldFallbackGitHubArchiveToGit(error),
        true,
      );
    }
  }),
  makeCase("Z13", async (context) => {
    context.world.config.ioFaults = [
      {
        op: "readFile",
        pathSuffix: ".gitattributes",
        always: true,
        code: "EACCES",
        message: "Synthetic attributes read failure",
      },
    ];
    const readError = await captureThrow(() =>
      resolveArchive(
        context,
        [file("root/.gitattributes", "*.bin text"), file("root/packages/p/a")],
        { path: "packages/p" },
      ),
    );
    context.assert.equal(
      context.facades["github-archive-source"].shouldFallbackGitHubArchiveToGit(readError),
      false,
    );

    context.world.config.ioFaults = [];
    const statusError = await captureThrow(() =>
      resolveArchive(
        context,
        [file("root/a")],
        {},
        { status: 500, url: "https://api.github.invalid/archive" },
      ),
    );
    context.assert.equal(
      context.facades["github-archive-source"].shouldFallbackGitHubArchiveToGit(statusError),
      false,
    );

    context.world.scripts.http.push({
      error: { httpPortCode: "timeout", message: "Synthetic timeout" },
    });
    const timeoutError = await captureThrow(() =>
      context.facades["github-archive-source"].resolveGitHubArchiveSource({
        url: "https://github.com/acme/repo.git",
      }),
    );
    context.assert.equal(
      context.facades["github-archive-source"].shouldFallbackGitHubArchiveToGit(timeoutError),
      false,
    );
  }),
  makeCase("Z14", async (context) => {
    const error = await captureThrow(() =>
      resolveArchive(context, [file("root/.gitmodules", ""), file("root/a")]),
    );
    context.assert.equal(
      context.facades["github-archive-source"].shouldFallbackGitHubArchiveToGit(error),
      true,
    );
  }),
  makeCase("P03", async (context) => {
    const root = await resolveHttp(context, [file("only.txt")]);
    const request = events(context, "http.request")[0].request;
    const adapterOptions =
      events(context, "http.adapter.construct").at(-1)?.options ??
      events(context, "http.createWebFetchAdapter").at(-1)?.options ??
      {};
    context.assert.equal(request.timeoutMs ?? adapterOptions.timeoutMs, 180000);
    context.assert.equal(request.maxResponseBytes ?? adapterOptions.maxResponseBytes, 200 * MiB);
    await root.cleanup();
  }),
  makeCase("P05", async (context) => {
    const root = await resolveHttp(context, [file("only.txt")], {}, [
      { ...httpSuccess(), bytes: 200 * MiB },
    ]);
    await root.cleanup();
    context.world.scripts.http.push({
      error: { httpPortCode: "too_large", message: "200 MiB + 1" },
    });
    const error = await captureThrow(() =>
      context.facades["zip-source"].resolveHttpZipSource({
        url: "https://download.invalid/over.zip",
      }),
    );
    context.assert.match(error.message, /200 MiB \+ 1/u);
  }),
  makeCase("P07", async (context) => {
    const root = await resolveHttp(context, [file("only.txt", "ab")]);
    context.assert.ok(events(context, "zip.readEntry").length >= 1);
    context.assert.equal(events(context, "zip.open")[0].options.lazyEntries, true);
    context.assert.equal(events(context, "zip.open")[0].options.validateEntrySizes, true);
    await root.cleanup();
  }),
  makeCase("P08", async (context) => {
    const error = await captureThrow(() =>
      resolveArchive(context, [
        file("root/assets/.gitattributes", "filter=lfs"),
        file("root/README", "x"),
      ]),
    );
    context.assert.equal(
      context.facades["github-archive-source"].shouldFallbackGitHubArchiveToGit(error),
      true,
    );
    context.assert.ok(events(context, "fs.readdir").length > 0);
  }),
  makeCase("N01", async (context) => {
    for (const pin of [undefined, "   "]) {
      const before = events(context, "http.request").length;
      const root = await resolveArchive(
        context,
        [file("repo-root/a")],
        pin === undefined ? {} : { pin },
      );
      const request = events(context, "http.request")[before].request;
      context.assert.match(request.url, /\/zipball\/HEAD$/u);
      context.assert.deepEqual(request.headers, {
        Accept: "application/vnd.github+json",
        "User-Agent": "Knorvia Studio-Plugin-Installer",
      });
      context.assert.equal(basename(root.path), "repo-root");
      await root.cleanup();
    }
  }),
  makeCase("N02", async (context) => {
    const root = await resolveArchive(context, [file("repo-root/a")], {}, [
      {
        status: 302,
        headers: { location: "/repos/acme/repo/zipball/final" },
        url: "https://api.github.com/repos/acme/repo/zipball/HEAD",
      },
      httpSuccess("https://api.github.com/repos/acme/repo/zipball/final"),
    ]);
    const requests = events(context, "http.request")
      .slice(-2)
      .map((entry) => entry.request);
    context.assert.deepEqual(requests[1].headers, requests[0].headers);
    await root.cleanup();
  }),
  makeCase("N03", async (context) => {
    const root = await resolveArchive(context, [file("repo-root/a")], {}, [
      {
        status: 302,
        headers: { location: "https://cdn.invalid/repo.zip" },
        url: "https://api.github.com/repos/acme/repo/zipball/HEAD",
      },
      httpSuccess("https://cdn.invalid/repo.zip"),
    ]);
    const requests = events(context, "http.request")
      .slice(-2)
      .map((entry) => entry.request);
    context.assert.ok(
      requests[1].headers === undefined ||
        requests[1].headers === "<undefined>" ||
        (typeof requests[1].headers === "object" &&
          requests[1].headers !== null &&
          Object.keys(requests[1].headers).length === 0),
    );
    await root.cleanup();
  }),
  makeCase("R01", async (context) => {
    const api = context.facades["github-archive-source"];
    const ZipError = context.facades["zip-source"].PluginZipDownloadError;
    const privateError = await captureThrow(() =>
      api.resolveGitHubArchiveSource({ url: "ssh://git@github.com/o/r" }),
    );
    context.assert.equal(api.shouldFallbackGitHubArchiveToGit(privateError), true);
    const attached = context.facades.helpers.appendPluginSourceCleanupError(
      privateError,
      new Error("cleanup"),
    );
    context.assert.equal(attached, privateError);
    context.assert.equal(api.shouldFallbackGitHubArchiveToGit(attached), true);

    for (const status of [401, 403, 404]) {
      context.assert.equal(
        api.shouldFallbackGitHubArchiveToGit(
          new ZipError("synthetic", "https://example.invalid/x.zip", status),
        ),
        true,
      );
    }
    for (const status of [400, 429, 500]) {
      context.assert.equal(
        api.shouldFallbackGitHubArchiveToGit(
          new ZipError("synthetic", "https://example.invalid/x.zip", status),
        ),
        false,
      );
    }
    context.assert.equal(
      api.shouldFallbackGitHubArchiveToGit(
        new Error("Plugin zip entry symlinks are not supported: link"),
      ),
      true,
    );
    context.assert.equal(
      api.shouldFallbackGitHubArchiveToGit("Unsupported plugin zip entry type: device"),
      true,
    );
    context.assert.equal(
      api.shouldFallbackGitHubArchiveToGit(
        Object.assign(
          new Error(
            "GitHub Archive requires system Git fallback: repository declares Git submodules",
          ),
          { name: "GitHubArchiveRequiresGitError" },
        ),
      ),
      false,
    );
    context.assert.equal(
      api.shouldFallbackGitHubArchiveToGit({
        name: "GitHubArchiveRequiresGitError",
        message: privateError.message,
      }),
      false,
    );
    for (const error of [
      new Error("repository declares Git submodules"),
      new Error("repository declares Git LFS filters"),
      new Error("Synthetic timeout"),
      new Error("Synthetic network failure"),
      new Error("ZIP limit exceeded"),
      new Error("SHA mismatch"),
      new Error("ZIP root missing"),
      new Error("ZIP path missing"),
    ])
      context.assert.equal(api.shouldFallbackGitHubArchiveToGit(error), false);
  }),
];
