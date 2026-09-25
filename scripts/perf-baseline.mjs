#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, _electron } from "playwright-core";
import { createServer } from "vite";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = resolve(repoRoot, "packages/web");
const args = process.argv.slice(2);
function argument(name) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
const chromePath = resolve(
  process.env.KNORVIA_PERF_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
);
if (!existsSync(chromePath)) throw new Error(`Local Chromium executable missing: ${chromePath}`);

async function measureScroll() {
  const vite = await createServer({
    configFile: resolve(webRoot, "vite.config.ts"),
    root: webRoot,
    server: { host: "127.0.0.1", port: 0, strictPort: false },
    logLevel: "error",
  });
  let browser;
  try {
    await vite.listen();
    const address = vite.httpServer?.address();
    assert.ok(address && typeof address !== "string");
    browser = await chromium.launch({ executablePath: chromePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}/perf-studio-timeline.html`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(
      () =>
        document.querySelectorAll("[data-studio-virtual-row]").length > 0 &&
        document.querySelector("[data-studio-timeline-scroll]")?.scrollHeight > 1_000_000,
    );
    assert.deepEqual(pageErrors, [], "synthetic timeline must mount without page errors");
    await page.mouse.move(700, 400);
    await page.mouse.wheel(0, -650);
    await page.getByRole("button", { name: /Jump to latest/i }).waitFor();
    const scroll = await page.evaluate(async () => {
      const element = document.querySelector("[data-studio-timeline-scroll]");
      if (!(element instanceof HTMLElement)) throw new Error("Studio scroll viewport missing");
      element.scrollTop = element.scrollHeight * 0.35;
      await new Promise((done) => setTimeout(done, 500));
      const frames = [];
      let maxMounted = 0;
      for (let index = 0; index < 180; index++) {
        await new Promise((done) =>
          requestAnimationFrame((time) => {
            element.scrollTop += 180;
            frames.push(time);
            maxMounted = Math.max(
              maxMounted,
              document.querySelectorAll("[data-studio-virtual-row]").length,
            );
            done();
          }),
        );
      }
      const intervals = frames.slice(1).map((time, index) => time - frames[index]);
      intervals.sort((left, right) => left - right);
      const percentile = (p) =>
        Number(intervals[Math.floor((intervals.length - 1) * p)].toFixed(2));
      const elapsed = frames.at(-1) - frames[0];
      return {
        syntheticMessages: window.__studioPerfFixture.messageCount,
        frames: frames.length,
        headlessRafCallbacksPerSecond: Number((((frames.length - 1) * 1000) / elapsed).toFixed(1)),
        frameIntervalP50Ms: percentile(0.5),
        frameIntervalP95Ms: percentile(0.95),
        slowFramesOver33Ms: intervals.filter((value) => value > 33).length,
        maxMountedRows: maxMounted,
      };
    });
    assert.equal(scroll.syntheticMessages, 10_000);
    assert.ok(scroll.maxMountedRows < 100, `virtual rows exceeded 99: ${scroll.maxMountedRows}`);

    await page.waitForTimeout(250);
    await page.evaluate(async () => {
      const viewport = document.querySelector("[data-studio-timeline-scroll]");
      viewport.scrollTop += 1;
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    });
    const awayAnchor = await page.evaluate(() => {
      const viewport = document.querySelector("[data-studio-timeline-scroll]");
      const item = [...document.querySelectorAll("[data-studio-message-id]")].find((candidate) => {
        const bounds = candidate.getBoundingClientRect();
        return (
          bounds.bottom > viewport.getBoundingClientRect().top &&
          bounds.top < viewport.getBoundingClientRect().bottom
        );
      });
      if (!(item instanceof HTMLElement)) throw new Error("Offscreen append anchor missing");
      return { id: item.dataset.studioMessageId, top: item.getBoundingClientRect().top };
    });
    await page.evaluate(() => window.__studioPerfFixture.append());
    await page.waitForFunction(
      () =>
        document.querySelector("[data-studio-virtual-list]")?.getAttribute("data-studio-count") ===
        "10001",
    );
    const appendShiftPx = await page.evaluate(async ({ id, top }) => {
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      const item = [...document.querySelectorAll("[data-studio-message-id]")].find(
        (candidate) => candidate.getAttribute("data-studio-message-id") === id,
      );
      if (!(item instanceof HTMLElement))
        throw new Error(`Reading anchor ${id} disappeared after append`);
      return Number((item.getBoundingClientRect().top - top).toFixed(2));
    }, awayAnchor);
    assert.ok(
      Math.abs(appendShiftPx) <= 24,
      `offscreen append shifted reading position by ${appendShiftPx}px`,
    );
    await page.getByRole("button", { name: /Jump to latest/i }).click();
    await page.waitForFunction(() => {
      const viewport = document.querySelector("[data-studio-timeline-scroll]");
      return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 100;
    });

    const before = await page.evaluate(async () => {
      const viewport = document.querySelector("[data-studio-timeline-scroll]");
      if (!(viewport instanceof HTMLElement)) throw new Error("Studio scroll viewport missing");
      viewport.scrollTop = 0;
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      const item = [...document.querySelectorAll("[data-studio-message-id]")].find((candidate) => {
        const bounds = candidate.getBoundingClientRect();
        return (
          bounds.bottom > viewport.getBoundingClientRect().top &&
          bounds.top < viewport.getBoundingClientRect().bottom
        );
      });
      if (!(item instanceof HTMLElement)) throw new Error("Visible anchor missing");
      return {
        id: item.dataset.studioMessageId,
        top: item.getBoundingClientRect().top,
        scrollTop: viewport.scrollTop,
        scrollHeight: viewport.scrollHeight,
      };
    });
    await page.getByRole("button", { name: /Load earlier messages/i }).click();
    await page.waitForFunction(() => window.__studioPerfFixture.olderLoaded());
    const after = await page.evaluate(async ({ id, top }) => {
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      const viewport = document.querySelector("[data-studio-timeline-scroll]");
      const item = [...document.querySelectorAll("[data-studio-message-id]")].find(
        (candidate) => candidate.getAttribute("data-studio-message-id") === id,
      );
      if (!(item instanceof HTMLElement))
        throw new Error(`Reading anchor ${id} disappeared after prepend`);
      return {
        shift: Number((item.getBoundingClientRect().top - top).toFixed(2)),
        top: item.getBoundingClientRect().top,
        scrollTop: viewport.scrollTop,
        scrollHeight: viewport.scrollHeight,
      };
    }, before);
    const anchorShiftPx = after.shift;
    if (Math.abs(anchorShiftPx) > 24) console.error(JSON.stringify({ before, after }));
    assert.ok(Math.abs(anchorShiftPx) <= 24, `reading anchor shifted by ${anchorShiftPx}px`);
    assert.deepEqual(pageErrors, [], "synthetic timeline must remain free of page errors");
    return {
      ...scroll,
      offscreenAppendShiftPx: appendShiftPx,
      prependAnchorShiftPx: anchorShiftPx,
      viewport: "1440x900",
      browserVersion: browser.version(),
    };
  } finally {
    await browser?.close();
    await vite.close();
  }
}

function processTreeWorkingSet(rootPid) {
  const output = execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize,PrivatePageCount | ConvertTo-Json -Compress",
    ],
    { encoding: "utf8", maxBuffer: 5_000_000 },
  );
  const parsed = JSON.parse(output);
  const processes = Array.isArray(parsed) ? parsed : [parsed];
  const descendants = new Set([rootPid]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const entry of processes) {
      if (
        descendants.has(Number(entry.ParentProcessId)) &&
        !descendants.has(Number(entry.ProcessId))
      ) {
        descendants.add(Number(entry.ProcessId));
        changed = true;
      }
    }
  }
  const ownProcesses = processes.filter((entry) => descendants.has(Number(entry.ProcessId)));
  const mib = (key) =>
    Number(
      (
        ownProcesses.reduce((total, entry) => total + Number(entry[key] ?? 0), 0) /
        1024 /
        1024
      ).toFixed(1),
    );
  return {
    processCount: ownProcesses.length,
    summedWorkingSetMiB: mib("WorkingSetSize"),
    privateCommitMiB: mib("PrivatePageCount"),
  };
}

async function measureDesktop(executable) {
  if (process.platform !== "win32") throw new Error("Desktop baseline currently requires Windows");
  const profile = await mkdtemp(resolve(tmpdir(), "knorvia-perf-profile-"));
  if (!resolve(profile).startsWith(`${resolve(tmpdir())}${sep}`))
    throw new Error("Unexpected fixture profile path");
  let app;
  try {
    const started = performance.now();
    app = await _electron.launch({
      executablePath: resolve(executable),
      timeout: 90_000,
      env: { ...process.env, KNORVIA_ENV: "production", KNORVIA_PORTABLE_DIR: profile },
    });
    const page = await app.firstWindow({ timeout: 90_000 });
    await page.getByTestId("onboarding-page").waitFor({ timeout: 90_000 });
    const readyMs = Math.round(performance.now() - started);
    await page.waitForTimeout(1500);
    return { coldStartToOnboardingMs: readyMs, idle: processTreeWorkingSet(app.process().pid) };
  } finally {
    await app?.close();
    await rm(profile, { recursive: true, force: true });
  }
}

async function measurePortableDirectory(directory) {
  const root = resolve(directory);
  const rootInfo = await stat(root);
  if (!rootInfo.isDirectory()) throw new Error(`Portable path is not a directory: ${root}`);
  let bytes = 0;
  let files = 0;
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (current === root && entry.name.toLowerCase() === "data") continue;
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile()) {
        bytes += (await stat(path)).size;
        files++;
      }
    }
  }
  return { path: root, bytes, files, excludes: ["data/"] };
}

const result = {
  measuredAt: new Date().toISOString(),
  platform: process.platform,
  node: process.version,
  scroll: await measureScroll(),
};
const executable = argument("--executable");
if (executable) result.desktop = await measureDesktop(executable);
const artifact = argument("--artifact");
if (artifact) {
  const file = resolve(artifact);
  result.artifact = { path: file, bytes: (await stat(file)).size };
}
const portableDirectory = argument("--portable-dir");
if (portableDirectory) result.portable = await measurePortableDirectory(portableDirectory);
console.log(JSON.stringify(result, null, 2));
