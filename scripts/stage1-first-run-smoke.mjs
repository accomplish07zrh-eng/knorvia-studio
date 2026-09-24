#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { _electron } from "playwright-core";

const executable = resolve(process.argv[2] ?? "");
if (!existsSync(executable)) throw new Error(`Packaged executable missing: ${executable}`);
if (existsSync(join(dirname(executable), "resources", "knorvia-portable.json"))) {
  throw new Error("Run this smoke test only on an unmarked, isolated installer build");
}

const root = await mkdtemp(join(tmpdir(), "knorvia-first-run-smoke-"));
if (dirname(resolve(root)) !== resolve(tmpdir()) || !/^knorvia-first-run-smoke-[\w-]+$/.test(basename(root))) {
  throw new Error(`Unexpected smoke-test directory: ${root}`);
}
const settingsPath = (profile) => join(profile, ".knorvia-studio", "v2", "setting.json");
const profiles = {
  fresh: join(root, "fresh"),
  interrupted: join(root, "interrupted"),
  provider: join(root, "provider"),
  cli: join(root, "cli"),
  legacy: join(root, "legacy"),
};

async function launch(profile) {
  await mkdir(profile, { recursive: true });
  const app = await _electron.launch({
    executablePath: executable,
    env: {
      ...process.env,
      KNORVIA_ENV: "production",
      KNORVIA_DATA_BASE_DIR: profile,
      KNORVIA_HOME: join(profile, ".knorvia-studio"),
      KNORVIA_STORAGE_DIR: join(profile, ".knorvia-studio"),
    },
    timeout: 90000,
  });
  const page = await app.firstWindow({ timeout: 90000 });
  page.setDefaultTimeout(60000);
  return { app, page };
}

async function finishOccupation(page) {
  const onboarding = page.getByTestId("onboarding-page");
  await onboarding.waitFor();
  for (let step = 0; step < 3; step++) {
    await onboarding.getByRole("button", { name: /^(跳过|Skip)$/i }).click();
  }
  await onboarding.waitFor({ state: "hidden" });
}

async function withApp(profile, action) {
  const { app, page } = await launch(profile);
  try {
    return await action(page);
  } finally {
    await app.close();
  }
}

try {
  await withApp(profiles.fresh, async (page) => {
    await finishOccupation(page);
    const guide = page.getByTestId("studio-first-run-guide");
    await guide.waitFor();
    assert.equal(await guide.getByTestId("studio-first-run-provider").count(), 1);
    assert.equal(await guide.getByTestId("studio-first-run-later").count(), 1);
    const snapshot = JSON.parse(await readFile(settingsPath(profiles.fresh), "utf8"));
    assert.equal(snapshot.studioFirstRunGuideStatus, "pending");
    await guide.getByTestId("studio-first-run-later").click();
    await guide.waitFor({ state: "hidden" });
    assert.equal(JSON.parse(await readFile(settingsPath(profiles.fresh), "utf8")).studioFirstRunGuideStatus, "deferred");
  });
  await withApp(profiles.fresh, async (page) => {
    await page.getByTestId("studio-first-run-guide").waitFor({ state: "hidden", timeout: 30000 });
  });
  console.log("PASS fresh profile, explicit deferral, and restart");

  await withApp(profiles.interrupted, async (page) => {
    await finishOccupation(page);
    const guide = page.getByTestId("studio-first-run-guide");
    await guide.waitFor();
    await guide.getByRole("button", { name: /^(关闭|Close)$/i }).click();
    await guide.waitFor({ state: "hidden" });
    assert.equal(JSON.parse(await readFile(settingsPath(profiles.interrupted), "utf8")).studioFirstRunGuideStatus, "pending");
  });
  await withApp(profiles.interrupted, async (page) => {
    await page.getByTestId("studio-first-run-guide").waitFor();
  });
  console.log("PASS interrupted guide resumes on restart");

  await withApp(profiles.provider, async (page) => {
    await finishOccupation(page);
    const guide = page.getByTestId("studio-first-run-guide");
    await guide.waitFor();
    await guide.getByTestId("studio-first-run-provider").click();
    await guide.waitFor({ state: "hidden" });
    await page.getByText(/模型设置|Model settings/i).first().waitFor();
    assert.equal(JSON.parse(await readFile(settingsPath(profiles.provider), "utf8")).studioFirstRunGuideStatus, "pending");
  });
  console.log("PASS provider route opens existing model settings");

  await withApp(profiles.cli, async (page) => {
    await finishOccupation(page);
    const guide = page.getByTestId("studio-first-run-guide");
    await guide.waitFor();
    const detected = guide.locator('[data-testid^="studio-first-run-cli-"]');
    await detected.first().waitFor({ timeout: 15000 }).catch(() => {});
    if (await detected.count() === 0) {
      console.log("SKIP local CLI route: no installed local CLI was detected");
      return;
    }
    await detected.first().click();
    await guide.waitFor({ state: "hidden" });
    await page.getByTestId("studio-external-chat").waitFor();
    assert.equal(JSON.parse(await readFile(settingsPath(profiles.cli), "utf8")).studioFirstRunGuideStatus, "pending");
    console.log("PASS detected local CLI opens its conversation without sending a message");
  });

  const legacySettings = JSON.parse(await readFile(settingsPath(profiles.interrupted), "utf8"));
  delete legacySettings.studioFirstRunGuideStatus;
  await mkdir(dirname(settingsPath(profiles.legacy)), { recursive: true });
  await writeFile(settingsPath(profiles.legacy), JSON.stringify(legacySettings), "utf8");
  await withApp(profiles.legacy, async (page) => {
    await page.getByTestId("studio-first-run-guide").waitFor({ state: "hidden", timeout: 30000 });
    assert.equal(JSON.parse(await readFile(settingsPath(profiles.legacy), "utf8")).studioFirstRunGuideStatus, "legacy");
  });
  console.log("PASS existing configuration migrates without a new guide");
} finally {
  if (process.env.KNORVIA_KEEP_SMOKE_ROOT === "1") console.log(`SMOKE_ROOT=${root}`);
  else await rm(root, { recursive: true, force: true });
}
