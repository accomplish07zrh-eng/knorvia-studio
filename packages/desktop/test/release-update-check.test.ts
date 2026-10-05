import assert from "node:assert/strict";
import { mock, test } from "node:test";
import {
  appSettingsPatchSchema,
  KNORVIA_OFFICIAL_RELEASE_INFO_URL,
  validReleaseInfoUrl,
} from "@knorvia/shared";
import {
  checkReleaseUpdate,
  FIRST_RELEASE_CHECK_DELAY_MS,
  RELEASE_CHECK_INTERVAL_MS,
  scheduleReleaseUpdateChecks,
} from "../src/main/releaseUpdateCheck.js";

const source = "http://127.0.0.1:40888/releases/latest";
const currentVersion = "0.8.0-preview.1";
const release = (version: string, prerelease = false) =>
  new Response(
    JSON.stringify({
      tag_name: `studio-${version}`,
      html_url: "https://example.test/release",
      prerelease,
    }),
    {
      headers: { "content-type": "application/json" },
    },
  );

test("blank source uses the official GitHub releases and disabled checks make no request", async () => {
  const urls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return release("0.8.1");
  }) as typeof fetch;
  const official = await checkReleaseUpdate({
    getSettings: async () => ({ releaseInfoUrl: "" }),
    currentVersion,
    fetchImpl,
  });
  assert.equal(official.status, "available");
  assert.deepEqual(urls, [KNORVIA_OFFICIAL_RELEASE_INFO_URL]);
  const disabled = await checkReleaseUpdate({
    getSettings: async () => ({ releaseInfoUrl: source, releaseChecksEnabled: false }),
    currentVersion,
    fetchImpl,
  });
  assert.equal(disabled.status, "disabled");
  assert.equal(urls.length, 1);
});

test("release source rejects credentials, unsafe schemes and non-loopback HTTP", () => {
  for (const value of [
    "http://example.test/latest",
    "https://user:pass@example.test/latest",
    "https://example.test/latest#secret",
    "https://example.test/latest?api_key=fake",
    "file:///tmp/release.json",
  ]) {
    assert.equal(validReleaseInfoUrl(value), false);
    assert.equal(appSettingsPatchSchema.safeParse({ releaseInfoUrl: value }).success, false);
  }
  assert.equal(validReleaseInfoUrl(source), true);
  assert.equal(appSettingsPatchSchema.safeParse({ releaseInfoUrl: source }).success, true);
});

test("newer stable release is available and older release is up to date", async () => {
  const seen: RequestInit[] = [];
  const available = await checkReleaseUpdate({
    getSettings: async () => ({ releaseInfoUrl: source }),
    currentVersion,
    fetchImpl: (async (_url, init) => {
      seen.push(init ?? {});
      return release("0.8.0");
    }) as typeof fetch,
  });
  assert.deepEqual(available, {
    status: "available",
    currentVersion,
    latestVersion: "0.8.0",
    releaseUrl: "https://example.test/release",
    // 未提供安装目标（非 Windows 安装版）时不可一键安装。
    installable: false,
  });
  assert.equal(seen[0]?.credentials, "omit");
  assert.equal(seen[0]?.method, "GET");
  const current = await checkReleaseUpdate({
    getSettings: async () => ({ releaseInfoUrl: source }),
    currentVersion: "0.8.0",
    fetchImpl: (async () => release("0.8.0")) as typeof fetch,
  });
  assert.equal(current.status, "up-to-date");
});

test("stable installations do not show a newer preview while preview installations can", async () => {
  const fetchImpl = (async () => release("0.9.0-preview.1", true)) as typeof fetch;
  const stable = await checkReleaseUpdate({
    getSettings: async () => ({ releaseInfoUrl: source }),
    currentVersion: "0.8.0",
    fetchImpl,
  });
  const preview = await checkReleaseUpdate({
    getSettings: async () => ({ releaseInfoUrl: source }),
    currentVersion,
    fetchImpl,
  });
  assert.equal(stable.status, "no-compatible-release");
  assert.equal(preview.status, "available");
});

test("scheduled checks wait 30 seconds, repeat after 24 hours and stop cleanly", async () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const results: string[] = [];
  try {
    const stop = scheduleReleaseUpdateChecks(
      async () => ({ status: "unconfigured", currentVersion }),
      (result) => results.push(result.status),
    );
    mock.timers.tick(FIRST_RELEASE_CHECK_DELAY_MS - 1);
    await Promise.resolve();
    assert.equal(results.length, 0);
    mock.timers.tick(1);
    await Promise.resolve();
    assert.equal(results.length, 1);
    mock.timers.tick(RELEASE_CHECK_INTERVAL_MS);
    await Promise.resolve();
    assert.equal(results.length, 2);
    stop();
    mock.timers.tick(RELEASE_CHECK_INTERVAL_MS);
    await Promise.resolve();
    assert.equal(results.length, 2);
  } finally {
    mock.timers.reset();
  }
});

test("HTTP errors, malformed JSON, offline and timeout are failures", async () => {
  const settings = async () => ({ releaseInfoUrl: source });
  for (const status of [404, 429]) {
    const result = await checkReleaseUpdate({
      getSettings: settings,
      currentVersion,
      fetchImpl: (async () => new Response("", { status })) as typeof fetch,
    });
    assert.deepEqual(result, {
      status: "failed",
      currentVersion,
      reason: "http",
      httpStatus: status,
    });
  }
  for (const body of ["not-json", JSON.stringify({ tag_name: "not-semver" })]) {
    const result = await checkReleaseUpdate({
      getSettings: settings,
      currentVersion,
      fetchImpl: (async () => new Response(body)) as typeof fetch,
    });
    assert.equal(result.status, "failed");
    if (result.status === "failed") assert.equal(result.reason, "invalid-response");
  }
  const offline = await checkReleaseUpdate({
    getSettings: settings,
    currentVersion,
    fetchImpl: (async () => {
      throw new Error("fixture offline");
    }) as typeof fetch,
  });
  assert.equal(offline.status, "failed");
  if (offline.status === "failed") assert.equal(offline.reason, "offline");
  const timeout = await checkReleaseUpdate({
    getSettings: settings,
    currentVersion,
    timeoutMs: 1,
    fetchImpl: ((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("fixture timeout")));
      })) as typeof fetch,
  });
  assert.equal(timeout.status, "failed");
  if (timeout.status === "failed") assert.equal(timeout.reason, "timeout");
});
