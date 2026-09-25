#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { _electron } from "playwright-core";

const executable = resolve(process.argv[2] ?? "");
const root = dirname(executable);
if (!existsSync(join(root, "resources", "knorvia-portable.json"))) {
  throw new Error("Smoke target is missing its portable marker");
}
if (existsSync(join(root, "data"))) {
  throw new Error("Smoke target already has data; refusing to touch it");
}

const app = await _electron.launch({ executablePath: executable, timeout: 90000 });
try {
  const page = await app.firstWindow({ timeout: 90000 });
  page.setDefaultTimeout(60000);
  const onboarding = page.getByTestId("onboarding-page");
  await onboarding.waitFor();
  for (let step = 0; step < 3; step++) {
    await onboarding.getByRole("button", { name: /^(跳过|Skip)$/i }).click();
  }
  const guide = page.getByTestId("studio-first-run-guide");
  await guide.waitFor();
  await guide.getByTestId("studio-first-run-later").click();
  await guide.waitFor({ state: "hidden" });
  const settings = JSON.parse(
    await readFile(join(root, "data", ".knorvia-studio", "v2", "setting.json"), "utf8"),
  );
  assert.equal(settings.studioFirstRunGuideStatus, "deferred");
  console.log("PASS extracted portable starts and saves settings beside its executable");
} finally {
  await app.close();
}
