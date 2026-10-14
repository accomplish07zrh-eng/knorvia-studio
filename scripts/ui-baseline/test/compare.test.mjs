// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { writeCapture } from "../lib/baseline.mjs";
import { encodePng } from "../lib/png.mjs";

const compareScript = join(dirname(fileURLToPath(import.meta.url)), "..", "compare.mjs");

const environment = {
  platform: "test-platform",
  arch: "test-arch",
  node: "v0.0.0",
  chromium: { executablePath: "/chromium", version: "1.0.0" },
  fixedClock: "2026-11-01T00:00:00.000Z",
  fixedTimezone: "UTC",
};

function image(width, height, fill) {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = fill;
    data[index + 1] = fill;
    data[index + 2] = fill;
    data[index + 3] = 255;
  }
  return { width, height, data };
}

function geometry(box) {
  return { "v4-composer": { matches: 1, visibleMatches: 1, box } };
}

async function writeFixture(directory, { pixels, box, env = environment, page = "chat-single" }) {
  await writeCapture({
    out: directory,
    pagesFile: "pages.json",
    pagesSha256: "sha",
    themes: ["light"],
    viewports: [{ width: 8, height: 4 }],
    environment: env,
    commit: { head: "b".repeat(40), headSubject: "s", branch: "b", mainTip: null, mainBase: null },
    records: [
      {
        page,
        pageTitle: "t",
        theme: "light",
        width: 8,
        height: 4,
        image: encodePng(pixels),
        geometry: geometry(box),
        signals: { bodyTextSha256: "x", consoleErrors: [] },
        screenshotMs: 1,
        generatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  });
}

function runCompare(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [compareScript, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

const baseBox = { x: 1, y: 2, width: 5, height: 3 };

async function withDirectories(run) {
  const root = await mkdtemp(join(tmpdir(), "ui-baseline-compare-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("像素与几何完全一致时退出码为 0", async () => {
  await withDirectories(async (root) => {
    const baseline = join(root, "baseline");
    const current = join(root, "current");
    await writeFixture(baseline, { pixels: image(8, 4, 200), box: baseBox });
    await writeFixture(current, { pixels: image(8, 4, 200), box: baseBox });
    const result = await runCompare(["--baseline", baseline, "--current", current]);
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(await readFile(join(current, "compare.json"), "utf8"));
    assert.equal(report.summary.passed, 1);
    assert.equal(report.summary.pixelFailures, 0);
  });
});

test("结构性像素差异判失败并产出差异图", async () => {
  await withDirectories(async (root) => {
    const baseline = join(root, "baseline");
    const current = join(root, "current");
    await writeFixture(baseline, { pixels: image(8, 4, 200), box: baseBox });
    const changed = image(8, 4, 200);
    changed.data[0] = 10;
    await writeFixture(current, { pixels: changed, box: baseBox });
    const result = await runCompare(["--baseline", baseline, "--current", current]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /像素：结构差异/);
    const report = JSON.parse(await readFile(join(current, "compare.json"), "utf8"));
    assert.equal(report.summary.pixelFailures, 1);
    const diffPath = report.results[0].diffFile;
    assert.ok(diffPath);
    await readFile(diffPath);
  });
});

test("抗锯齿级差异默认不算失败，--strict 下必须零差异", async () => {
  await withDirectories(async (root) => {
    const baseline = join(root, "baseline");
    const current = join(root, "current");
    await writeFixture(baseline, { pixels: image(8, 4, 200), box: baseBox });
    const antialiased = image(8, 4, 200);
    antialiased.data[0] = 204;
    await writeFixture(current, { pixels: antialiased, box: baseBox });
    const relaxed = await runCompare(["--baseline", baseline, "--current", current]);
    assert.equal(relaxed.code, 0, relaxed.stderr);
    const strict = await runCompare(["--baseline", baseline, "--current", current, "--strict"]);
    assert.equal(strict.code, 1);
    assert.match(strict.stderr, /像素/);
  });
});

test("包围盒偏差超过 2 像素判失败，等于 2 像素通过", async () => {
  await withDirectories(async (root) => {
    const baseline = join(root, "baseline");
    const current = join(root, "current");
    await writeFixture(baseline, { pixels: image(8, 4, 200), box: baseBox });
    await writeFixture(current, {
      pixels: image(8, 4, 200),
      box: { ...baseBox, x: baseBox.x + 2 },
    });
    const boundary = await runCompare(["--baseline", baseline, "--current", current]);
    assert.equal(boundary.code, 0, boundary.stderr);

    await writeFixture(current, {
      pixels: image(8, 4, 200),
      box: { ...baseBox, y: baseBox.y - 2.5 },
    });
    const beyond = await runCompare(["--baseline", baseline, "--current", current]);
    assert.equal(beyond.code, 1);
    assert.match(beyond.stderr, /几何：v4-composer=out-of-tolerance/);
  });
});

test("缺少基线图时判失败并点名页面", async () => {
  await withDirectories(async (root) => {
    const baseline = join(root, "baseline");
    const current = join(root, "current");
    await writeFixture(baseline, { pixels: image(8, 4, 200), box: baseBox, page: "groups" });
    await writeFixture(current, { pixels: image(8, 4, 200), box: baseBox });
    const result = await runCompare(["--baseline", baseline, "--current", current]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /缺少基线图/);
    const report = JSON.parse(await readFile(join(current, "compare.json"), "utf8"));
    assert.equal(report.summary.baselineMissing, 1);
  });
});

test("渲染环境不同默认拒绝比较，可用开关显式放宽", async () => {
  await withDirectories(async (root) => {
    const baseline = join(root, "baseline");
    const current = join(root, "current");
    await writeFixture(baseline, { pixels: image(8, 4, 200), box: baseBox });
    await writeFixture(current, {
      pixels: image(8, 4, 200),
      box: baseBox,
      env: { ...environment, chromium: { executablePath: "/chromium", version: "2.0.0" } },
    });
    const rejected = await runCompare(["--baseline", baseline, "--current", current]);
    assert.equal(rejected.code, 1);
    assert.match(rejected.stderr, /渲染环境不同/);
    const allowed = await runCompare([
      "--baseline",
      baseline,
      "--current",
      current,
      "--allow-environment-mismatch",
    ]);
    assert.equal(allowed.code, 0, allowed.stderr);
  });
});
