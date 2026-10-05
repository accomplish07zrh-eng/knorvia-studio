import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkReleaseUpdate, selectReleaseInstaller } from "../src/main/releaseUpdateCheck.js";
import { createReleaseUpdateInstaller } from "../src/main/releaseUpdateInstall.js";

// specs/knorvia-release-update-install.md
const base = "https://github.com/accomplish07zrh-eng/knorvia-studio/releases/download/v0.9.0";
const installerName = "Knorvia-Studio-0.9.0-win-x64-setup.exe";
const windowsInstalled = { platform: "win32", arch: "x64", packaged: true, portable: false };
const record = (assets: Array<{ name: string; url: string }>) => ({
  tag_name: "v0.9.0",
  html_url: "https://github.com/accomplish07zrh-eng/knorvia-studio/releases/tag/v0.9.0",
  prerelease: false,
  assets: assets.map(({ name, url }) => ({ name, browser_download_url: url, size: 12 })),
});
const fullRecord = record([
  { name: installerName, url: `${base}/${installerName}` },
  { name: `${installerName}.sha256`, url: `${base}/${installerName}.sha256` },
  { name: "Knorvia-Studio-0.9.0-win-x64-portable.zip", url: `${base}/portable.zip` },
]);

test("only packaged Windows installs get an installer; hosts are allow-listed", () => {
  assert.equal(
    selectReleaseInstaller(fullRecord, "0.9.0", windowsInstalled)?.fileName,
    installerName,
  );
  for (const target of [
    { ...windowsInstalled, portable: true },
    { ...windowsInstalled, packaged: false },
    { ...windowsInstalled, platform: "linux" },
    { ...windowsInstalled, platform: "darwin" },
    undefined,
  ])
    assert.equal(selectReleaseInstaller(fullRecord, "0.9.0", target), undefined);
  const hostile = record([
    { name: installerName, url: `https://evil.example/${installerName}` },
    { name: `${installerName}.sha256`, url: `${base}/${installerName}.sha256` },
  ]);
  assert.equal(selectReleaseInstaller(hostile, "0.9.0", windowsInstalled), undefined);
  assert.equal(
    selectReleaseInstaller(
      record([{ name: installerName, url: `${base}/x` }]),
      "0.9.0",
      windowsInstalled,
    ),
    undefined,
    "installer without checksum is not installable",
  );
});

test("available result reports installable without exposing download URLs in the public shape", async () => {
  const detail = await checkReleaseUpdate({
    getSettings: async () => ({ releaseInfoUrl: "" }),
    currentVersion: "0.8.3",
    installerTarget: windowsInstalled,
    fetchImpl: (async () => new Response(JSON.stringify(fullRecord))) as typeof fetch,
  });
  assert.equal(detail.status, "available");
  assert.equal(detail.status === "available" && detail.installable, true);
  assert.equal(detail.installer?.url, `${base}/${installerName}`);
});

function fakeFetch(payload: Uint8Array, checksum: string, calls: string[]) {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith(".sha256")) return new Response(`${checksum}  ${installerName}\n`);
    // 模拟 GitHub 302 到资产存储主机。
    if (url.startsWith("https://github.com/"))
      return new Response(null, {
        status: 302,
        headers: { location: "https://objects.githubusercontent.com/asset?id=1" },
      });
    return new Response(payload, { headers: { "content-length": String(payload.byteLength) } });
  }) as typeof fetch;
}

async function setup(checksumOverride?: string) {
  const dir = await mkdtemp(join(tmpdir(), "knorvia-update-test-"));
  const payload = new TextEncoder().encode("fake installer bytes");
  const checksum = checksumOverride ?? createHash("sha256").update(payload).digest("hex");
  const launched: string[] = [];
  const calls: string[] = [];
  let quits = 0;
  const install = createReleaseUpdateInstaller({
    check: () =>
      checkReleaseUpdate({
        getSettings: async () => ({ releaseInfoUrl: "" }),
        currentVersion: "0.8.3",
        installerTarget: windowsInstalled,
        fetchImpl: (async () => new Response(JSON.stringify(fullRecord))) as typeof fetch,
      }),
    downloadDir: dir,
    fetchImpl: fakeFetch(payload, checksum, calls),
    launch: async (path) => {
      launched.push(path);
    },
    quit: () => {
      quits++;
    },
  });
  return { dir, payload, install, launched, calls, quits: () => quits };
}

test("verified installer is launched and the app quits", async () => {
  const ctx = await setup();
  try {
    const result = await ctx.install();
    assert.deepEqual(result, { status: "started", version: "0.9.0" });
    assert.equal(ctx.launched.length, 1);
    assert.deepEqual(await readFile(ctx.launched[0]!), Buffer.from(ctx.payload));
    assert.equal(ctx.quits(), 1);
    assert.ok(ctx.calls.some((url) => url.startsWith("https://objects.githubusercontent.com/")));
  } finally {
    await rm(ctx.dir, { recursive: true, force: true });
  }
});

test("checksum mismatch never launches, keeps the app running and deletes the download", async () => {
  const ctx = await setup("0".repeat(64));
  try {
    const result = await ctx.install();
    assert.deepEqual(result, { status: "failed", reason: "checksum" });
    assert.equal(ctx.launched.length, 0);
    assert.equal(ctx.quits(), 0);
    assert.equal(existsSync(join(ctx.dir, installerName)), false);
  } finally {
    await rm(ctx.dir, { recursive: true, force: true });
  }
});

test("concurrent install requests are rejected as busy", async () => {
  const ctx = await setup();
  try {
    const [first, second] = await Promise.all([ctx.install(), ctx.install()]);
    assert.equal(first.status, "started");
    assert.deepEqual(second, { status: "failed", reason: "busy" });
  } finally {
    await rm(ctx.dir, { recursive: true, force: true });
  }
});

test("redirects to hosts outside the allow-list fail as download errors", async () => {
  const dir = await mkdtemp(join(tmpdir(), "knorvia-update-test-"));
  try {
    const install = createReleaseUpdateInstaller({
      check: () =>
        checkReleaseUpdate({
          getSettings: async () => ({ releaseInfoUrl: "" }),
          currentVersion: "0.8.3",
          installerTarget: windowsInstalled,
          fetchImpl: (async () => new Response(JSON.stringify(fullRecord))) as typeof fetch,
        }),
      downloadDir: dir,
      fetchImpl: (async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://evil.example/payload.exe" },
        })) as typeof fetch,
      launch: async () => assert.fail("must not launch"),
      quit: () => assert.fail("must not quit"),
    });
    assert.deepEqual(await install(), { status: "failed", reason: "download" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("portable or up-to-date installs never download", async () => {
  const dir = await mkdtemp(join(tmpdir(), "knorvia-update-test-"));
  try {
    for (const [currentVersion, target, reason] of [
      ["0.8.3", { ...windowsInstalled, portable: true }, "unsupported"],
      ["0.9.0", windowsInstalled, "no-update"],
    ] as const) {
      const install = createReleaseUpdateInstaller({
        check: () =>
          checkReleaseUpdate({
            getSettings: async () => ({ releaseInfoUrl: "" }),
            currentVersion,
            installerTarget: target,
            fetchImpl: (async () => new Response(JSON.stringify(fullRecord))) as typeof fetch,
          }),
        downloadDir: dir,
        fetchImpl: (async () => assert.fail("must not download")) as typeof fetch,
        launch: async () => assert.fail("must not launch"),
        quit: () => assert.fail("must not quit"),
      });
      assert.deepEqual(await install(), { status: "failed", reason });
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
