// SPDX-License-Identifier: Apache-2.0
// 确定性证明：同一提交连续截两次必须零差异。
// 这个用例需要本机已安装 Chromium（不下载浏览器），因此不放进 pnpm test:studio 的离线套件，
// 单独用 `pnpm ui-baseline:test` 或下面的命令跑：
//   node --test scripts/ui-baseline/test/determinism.test.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { readCapture } from "../lib/baseline.mjs";
import { compareGeometry } from "../lib/geometry.mjs";
import { compareImages, isPixelIdentical } from "../lib/pixel-diff.mjs";
import { decodePng } from "../lib/png.mjs";

const directory = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(directory, "..", "..");
const captureScript = join(directory, "capture.mjs");
const compareScript = join(directory, "compare.mjs");

const PAGES = process.env.KNORVIA_UI_BASELINE_DETERMINISM_PAGES ?? "chat-single,workbench";
const THEMES = process.env.KNORVIA_UI_BASELINE_DETERMINISM_THEMES ?? "light,dark";
const WIDTHS = process.env.KNORVIA_UI_BASELINE_DETERMINISM_WIDTHS ?? "1360";

function run(script, args, timeoutMs = 900_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`超时：${script} ${args.join(" ")}`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

test("同一提交连续两次截图必须零差异", { timeout: 1_200_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "ui-baseline-determinism-"));
  try {
    const fixtureRoot = join(root, "fixture");
    const argsFor = (out) => [
      "--out",
      out,
      "--fixture-root",
      fixtureRoot,
      "--pages",
      PAGES,
      "--themes",
      THEMES,
      "--widths",
      WIDTHS,
    ];
    const first = join(root, "run-1");
    const second = join(root, "run-2");
    const firstRun = await run(captureScript, argsFor(first));
    assert.equal(firstRun.code, 0, `第一次截图失败：\n${firstRun.stdout}\n${firstRun.stderr}`);
    const secondRun = await run(captureScript, argsFor(second));
    assert.equal(secondRun.code, 0, `第二次截图失败：\n${secondRun.stdout}\n${secondRun.stderr}`);

    const firstCapture = await readCapture(first);
    const secondCapture = await readCapture(second);
    assert.ok(firstCapture.entries.length > 0, "第一次截图没有产出任何图");
    assert.equal(firstCapture.entries.length, secondCapture.entries.length);

    const key = (entry) => `${entry.image.page}|${entry.image.theme}|${entry.image.width}`;
    const secondByKey = new Map(secondCapture.entries.map((entry) => [key(entry), entry]));
    for (const entry of firstCapture.entries) {
      const other = secondByKey.get(key(entry));
      assert.ok(other, `第二次截图缺少 ${key(entry)}`);
      const left = decodePng(await readFile(entry.imagePath));
      const right = decodePng(await readFile(other.imagePath));
      const comparison = compareImages(left, right);
      assert.equal(
        isPixelIdentical(comparison),
        true,
        `${key(entry)} 两次截图出现 ${comparison.changedPixels} 个不同像素（最大通道差 ${comparison.maxChannelDelta}）`,
      );
      const geometry = compareGeometry(entry.meta.geometry, other.meta.geometry, 0);
      assert.deepEqual(geometry.failures, [], `${key(entry)} 两次截图的几何不一致`);
      assert.equal(
        entry.meta.signals.bodyTextSha256,
        other.meta.signals.bodyTextSha256,
        `${key(entry)} 两次截图的文本不一致`,
      );
    }

    // 同一份工具自己的判定也要认这两次截图是零差异。
    const strictCompare = await run(compareScript, [
      "--baseline",
      first,
      "--current",
      second,
      "--strict",
    ]);
    assert.equal(strictCompare.code, 0, strictCompare.stderr);
    assert.match(strictCompare.stdout, /像素超标 0/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("改了像素或几何时判定必须失败", { timeout: 1_200_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "ui-baseline-determinism-"));
  try {
    const fixtureRoot = join(root, "fixture");
    const baseline = join(root, "baseline");
    const current = join(root, "current");
    const capture = await run(captureScript, [
      "--out",
      baseline,
      "--fixture-root",
      fixtureRoot,
      "--pages",
      "chat-single",
      "--themes",
      "light",
      "--widths",
      "1360",
    ]);
    assert.equal(capture.code, 0, `截图失败：\n${capture.stdout}\n${capture.stderr}`);
    const captureResult = await readCapture(baseline);
    const entry = captureResult.entries[0];
    assert.ok(entry.image.imageSha256);

    // 复制一份产物并只篡改副本的几何 sidecar：把某个 testid 挪 3 像素，比较必须失败。
    await cp(baseline, current, { recursive: true });
    const sidecarPath = join(current, "chat-single", "light-1360.json");
    const tampered = JSON.parse(await readFile(sidecarPath, "utf8"));
    const [firstTestId] = Object.keys(tampered.geometry);
    assert.ok(firstTestId, "几何里没有 testid，无法验证篡改判定");
    tampered.geometry[firstTestId].box.x += 3;
    await writeFile(sidecarPath, JSON.stringify(tampered));

    const geometryCompare = await run(compareScript, [
      "--baseline",
      baseline,
      "--current",
      current,
    ]);
    assert.equal(geometryCompare.code, 1);
    assert.match(geometryCompare.stderr, /几何/);

    const restored = await run(compareScript, [
      "--baseline",
      baseline,
      "--current",
      current,
      "--strict",
    ]);
    assert.equal(restored.code, 1, "像素仍相同，但几何 sidecar 还能被读回篡改值时必须仍失败");

    await cp(join(baseline, "chat-single", "light-1360.json"), sidecarPath, { force: true });
    const clean = await run(compareScript, [
      "--baseline",
      baseline,
      "--current",
      current,
      "--strict",
    ]);
    assert.equal(clean.code, 0, clean.stderr);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
