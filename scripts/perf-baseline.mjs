#!/usr/bin/env node
/* eslint-disable max-lines -- 单一入口的离线性能基线脚本：滚动、运行历史渲染与桌面分阶段测量共享同一套
   Vite/Chrome/Electron 夹具与输出 schema，拆成多文件会让「一条命令产出一份可比 JSON」的契约变脆。
   与 scripts/native-search-tools-unix.mjs、scripts/prepare-prebuilds.mjs 采用同一处理方式。 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, _electron } from "playwright-core";
import { createServer } from "vite";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = resolve(repoRoot, "packages/web");
const uiRoot = resolve(repoRoot, "packages/ui/src");
const args = process.argv.slice(2);
function argument(name) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
function flag(name) {
  return args.includes(name);
}
function numberArgument(name, fallback, { min, max }) {
  const raw = argument(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max)
    throw new Error(`${name} must be a number between ${min} and ${max}, received: ${raw}`);
  return Math.round(value);
}
const chromePath = resolve(
  process.env.KNORVIA_PERF_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
);
function requireLocalChrome() {
  if (!existsSync(chromePath)) throw new Error(`Local Chromium executable missing: ${chromePath}`);
  return chromePath;
}

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
    browser = await chromium.launch({ executablePath: requireLocalChrome(), headless: true });
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

/**
 * Run history render cost. T10 新增：量的是「成组/工作流详情面板」的非紧凑运行历史
 * （StudioTimeline 底部用的是 compact 模式，只渲染 3 条）。夹具在真实浏览器里动态导入
 * 真实组件，只注入合成 runs，因此不需要改动 packages/web 的 perf 页面。
 */
async function measureRunHistory(runs, steps) {
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
    browser = await chromium.launch({ executablePath: requireLocalChrome(), headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const pageUrl = `http://127.0.0.1:${address.port}/perf-studio-timeline.html`;
    const openPerfPage = async () => {
      await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => document.querySelectorAll("[data-studio-virtual-row]").length > 0,
      );
    };
    // 首次动态导入会让 Vite 优化依赖并整页刷新；先预热，再重新打开页面做正式测量。
    await openPerfPage();
    await page
      .evaluate(
        async ({ ui }) => {
          try {
            await Promise.all([
              import(/* @vite-ignore */ "/@id/react"),
              import(/* @vite-ignore */ "/@id/react-dom/client"),
              import(/* @vite-ignore */ `/@fs/${ui}/hooks/useServices.tsx`),
              import(/* @vite-ignore */ `/@fs/${ui}/i18n/IntlProvider.tsx`),
              import(/* @vite-ignore */ `/@fs/${ui}/studio/runtime/StudioRunHistory.tsx`),
            ]);
          } catch {
            // 依赖优化触发的整页刷新会使这次预热失败，重新打开页面即可。
          }
        },
        { ui: uiRoot },
      )
      .catch(() => {});
    await page.waitForTimeout(1_500);
    let measured = null;
    let lastError = null;
    for (let attempt = 0; attempt < 3 && measured === null; attempt++) {
      try {
        await openPerfPage();
        pageErrors.length = 0;
        measured = await page.evaluate(
          async ({ ui, requestedRuns, requestedSteps }) => {
            const react = await import(/* @vite-ignore */ "/@id/react");
            const reactDom = await import(/* @vite-ignore */ "/@id/react-dom/client");
            const { ServiceProvider } = await import(
              /* @vite-ignore */ `/@fs/${ui}/hooks/useServices.tsx`
            );
            const { KnorviaIntlProvider } = await import(
              /* @vite-ignore */ `/@fs/${ui}/i18n/IntlProvider.tsx`
            );
            const { StudioRunHistory } = await import(
              /* @vite-ignore */ `/@fs/${ui}/studio/runtime/StudioRunHistory.tsx`
            );
            const React = react.default ?? react;
            const ReactDom = reactDom.default ?? reactDom;
            const createElement = React.createElement;
            if (typeof createElement !== "function" || typeof ReactDom.createRoot !== "function")
              throw new Error("React runtime unavailable for the run-history fixture");
            let revision = 1;
            const listeners = new Set();
            const nodes = Array.from({ length: requestedSteps }, (_, index) => ({
              id: `n${index}`,
              data: { kind: "agent", label: `Node ${index}` },
            }));
            const runs = Array.from({ length: requestedRuns }, (_, runIndex) => {
              const steps = {};
              const outcomeSteps = [];
              const workspaceStepIds = [];
              for (let step = 0; step < requestedSteps; step++) {
                const stepId = `workflow:n${step}:attempt:0`;
                steps[stepId] = {
                  stepId,
                  status: step % 9 === 0 ? "failed" : "succeeded",
                  output: "synthetic-output".repeat(8),
                };
                outcomeSteps.push({ stepId, outcome: "produced" });
                workspaceStepIds.push(stepId);
              }
              return {
                id: `run-${runIndex}`,
                targetId: "perf-runs",
                kind: "workflow",
                state: runIndex % 17 === 0 ? "failed" : "succeeded",
                input: `Synthetic run ${runIndex}`,
                createdAt: 1_700_000_000_000 + runIndex,
                updatedAt: 1_700_000_000_000 + runIndex,
                attempt: 1,
                checkpoint: { steps, values: {}, completedRounds: 1 },
                workspaceStepIds,
                definition: { version: 1, nodes },
                error: runIndex % 17 === 0 ? "Synthetic failure" : undefined,
                outcome: { steps: outcomeSteps },
              };
            });
            const service = {
              onDidChange: (listener) => {
                listeners.add(listener);
                return { dispose: () => listeners.delete(listener) };
              },
              overview: async () => ({ revision }),
              timeline: async () => ({ revision, messages: [], runs, turns: [], interactions: [] }),
            };
            const host = document.createElement("div");
            host.id = "run-history-host";
            host.style.height = "900px";
            host.style.overflow = "auto";
            document.body.appendChild(host);
            const root = ReactDom.createRoot(host);
            // 首屏耗时量到「DOM 连续 5 帧不再变化」，这样既涵盖 React 的并发渲染让出，
            // 也不依赖具体窗口大小（优化前后挂载条数不同）。
            const signature = () =>
              [
                document.querySelectorAll("[data-studio-run-history]").length,
                document.querySelectorAll('[id^="studio-run-step-"]').length,
                host.querySelectorAll("*").length,
              ].join(":");
            const waitForStable = async (budgetMs) => {
              const started = performance.now();
              let last = "";
              let stable = 0;
              for (;;) {
                const current = signature();
                stable = current === last && !current.startsWith("0:") ? stable + 1 : 0;
                last = current;
                if (stable >= 5) return performance.now() - started;
                if (performance.now() - started > budgetMs) return null;
                await new Promise((done) => requestAnimationFrame(done));
              }
            };
            const renderStarted = performance.now();
            root.render(
              createElement(
                ServiceProvider,
                { services: { studioRuntimeService: service } },
                createElement(
                  KnorviaIntlProvider,
                  { initialLocale: "en-US" },
                  createElement(StudioRunHistory, { targetId: "perf-runs" }),
                ),
              ),
            );
            const settled = await waitForStable(30_000);
            if (settled === null) throw new Error("Run history never settled");
            const mountMs = Number((performance.now() - renderStarted).toFixed(1));
            const renderedRuns = document.querySelectorAll("[data-studio-run-history]").length;
            const firstRender = {
              mountMs,
              renderedRuns,
              stepRows: document.querySelectorAll('[id^="studio-run-step-"]').length,
              domNodes: host.querySelectorAll("*").length,
              openDetails: [...host.querySelectorAll("details")].filter((item) => item.open).length,
              contentHeightPx: host.scrollHeight,
              showOlderControls: [...host.querySelectorAll("button")].filter((button) =>
                /older/i.test(button.textContent ?? ""),
              ).length,
            };
            // 刷新一次（等价 StudioClient 看门狗/变更通知）：新增一条运行，必然产生 DOM 变化。
            const mutationAt = new Promise((done) => {
              const observer = new MutationObserver(() => {
                observer.disconnect();
                done(performance.now());
              });
              observer.observe(host, { subtree: true, childList: true, characterData: true });
            });
            const freshest = {
              ...runs[0],
              id: "run-newest",
              state: "failed",
              error: "Synthetic refresh failure",
              createdAt: 1_700_000_100_000,
              updatedAt: 1_700_000_100_000,
            };
            const refreshed = [freshest, ...runs];
            revision += 1;
            service.timeline = async () => ({
              revision,
              messages: [],
              runs: refreshed,
              turns: [],
              interactions: [],
            });
            const notifiedAt = performance.now();
            for (const listener of listeners) listener();
            const updateMs = Number(((await mutationAt) - notifiedAt).toFixed(1));
            const updatedRuns = document.querySelectorAll("[data-studio-run-history]").length;
            // 展开全部隐藏项（若存在分页/窗口控件），确认历史仍可访问。
            let expandedRuns = renderedRuns;
            const showOlder = [...host.querySelectorAll("button")].find((button) =>
              /older/i.test(button.textContent ?? ""),
            );
            if (showOlder) {
              for (let click = 0; click < 20; click++) {
                const button = [...host.querySelectorAll("button")].find((candidate) =>
                  /older/i.test(candidate.textContent ?? ""),
                );
                if (!button) break;
                button.click();
                await new Promise((done) => requestAnimationFrame(done));
                await new Promise((done) => setTimeout(done, 0));
              }
              expandedRuns = document.querySelectorAll("[data-studio-run-history]").length;
            }
            return {
              fixtureRuns: requestedRuns,
              fixtureStepsPerRun: requestedSteps,
              ...firstRender,
              updateMs,
              updatedRuns,
              expandedRuns,
              expandedStepRows: document.querySelectorAll('[id^="studio-run-step-"]').length,
            };
          },
          { ui: uiRoot, requestedRuns: runs, requestedSteps: steps },
        );
      } catch (error) {
        lastError = error;
        await page.waitForTimeout(750);
      }
    }
    if (measured === null) throw lastError ?? new Error("run history fixture failed");
    assert.deepEqual(pageErrors, [], "run history fixture must stay free of page errors");
    return measured;
  } finally {
    await browser?.close();
    await vite.close();
  }
}

function readProcessSnapshot() {
  const output = execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize,PrivatePageCount,CreationDate,CommandLine | ConvertTo-Json -Compress",
    ],
    { encoding: "utf8", maxBuffer: 20_000_000 },
  );
  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function processTree(snapshot, rootPid) {
  const descendants = new Set([rootPid]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const entry of snapshot) {
      if (
        descendants.has(Number(entry.ParentProcessId)) &&
        !descendants.has(Number(entry.ProcessId))
      ) {
        descendants.add(Number(entry.ProcessId));
        changed = true;
      }
    }
  }
  return snapshot.filter((entry) => descendants.has(Number(entry.ProcessId)));
}

function workingSetOf(ownProcesses) {
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

/** WMI `CreationDate` 序列化为 `/Date(epochMs)/`。 */
function cimEpochMs(value) {
  const match = typeof value === "string" ? /\/Date\((\d+)\)\//.exec(value) : null;
  return match ? Number(match[1]) : null;
}

/** Host 侧启动阶段的唯一证据来源：应用自己的生产日志（只取时间戳与结构化字段）。 */
function parseHostStartupLog(text) {
  const lines = text.split("\n");
  const timestamp = (line) => {
    const match = /^\[(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}\.\d{3})\]/.exec(line);
    if (!match) return null;
    const at = Date.parse(`${match[1]}T${match[2]}`);
    return Number.isFinite(at) ? at : null;
  };
  const first = (needle) => {
    for (const line of lines) {
      if (!line.includes(needle)) continue;
      const at = timestamp(line);
      if (at !== null) return { at, line };
    }
    return null;
  };
  const anchor = first("[startup] 创建主窗口");
  if (!anchor) return null;
  const relative = (entry) => (entry ? Math.round(entry.at - anchor.at) : null);
  let databaseStartup = null;
  for (const line of lines) {
    const marker = line.indexOf("[database-startup] terminal ");
    if (marker < 0) continue;
    try {
      const parsed = JSON.parse(line.slice(marker + "[database-startup] terminal ".length));
      databaseStartup = {
        status: typeof parsed.status === "string" ? parsed.status : null,
        durationMs: Number.isFinite(Number(parsed.durationMs)) ? Number(parsed.durationMs) : null,
      };
    } catch {
      // 日志截断时保持 null，不用猜测值填充。
    }
  }
  return {
    mainWindowRequestedAtMs: relative(anchor),
    domReadyAtMs: relative(first("[createWindow] dom-ready fired")),
    hostForkAtMs: relative(first("[spawnHostProcess] forked host process")),
    hostServicesInitAtMs: relative(first("initializing local services")),
    hostServicesReadyAtMs: relative(first("local services ready, all channels registered")),
    databaseStartup,
  };
}

async function readHostStartup(profile) {
  const logDir = join(profile, "data", ".knorvia-studio", "v2", "logs");
  let names;
  try {
    names = (await readdir(logDir)).filter((name) => name.endsWith(".log")).sort();
  } catch {
    return null;
  }
  const newest = names.at(-1);
  if (!newest) return null;
  const info = await stat(join(logDir, newest));
  if (info.size > 4_000_000) return { truncated: true, bytes: info.size };
  return {
    bytes: info.size,
    ...parseHostStartupLog(await readFile(join(logDir, newest), "utf8")),
  };
}

/** 只等待「可发送」的既有输入框；onboarding 需要显式跳过后才会出现。 */
async function probeReadyToSend(page, budgetMs) {
  const started = performance.now();
  // page.evaluate 会把函数序列化后在页面里求值，选择器必须写在函数体内，不能闭包引用脚本变量。
  const visibleComposer = () => {
    const selectors = [
      '[data-testid="v4-composer-input"]',
      '[data-testid="studio-external-composer-input"]',
      '[data-testid="chat-input"]',
    ];
    return (
      selectors.find((selector) => {
        const element = document.querySelector(selector);
        return element instanceof HTMLElement && element.offsetParent !== null;
      }) ?? null
    );
  };
  try {
    if (await page.evaluate(visibleComposer)) {
      return { readyToSendMs: Math.round(performance.now() - started), reached: true };
    }
    const onboarding = page.getByTestId("onboarding-page");
    if (await onboarding.isVisible()) {
      for (let step = 0; step < 3; step++) {
        if (!(await onboarding.isVisible())) break;
        const skip = onboarding.getByRole("button", { name: /^(跳过|Skip)$/i });
        if ((await skip.count()) === 0) break;
        await skip
          .first()
          .click({ timeout: 5_000 })
          .catch(() => {});
        await page.waitForTimeout(150);
      }
      await onboarding
        .waitFor({ state: "hidden", timeout: Math.max(1_000, budgetMs) })
        .catch(() => {});
    }
    const later = page.getByTestId("studio-first-run-later");
    if (await later.count())
      await later
        .first()
        .click({ timeout: 5_000 })
        .catch(() => {});
    const deadline = started + budgetMs;
    for (;;) {
      const selector = await page.evaluate(visibleComposer);
      if (selector)
        return {
          readyToSendMs: Math.round(performance.now() - started),
          reached: true,
          selector,
        };
      if (performance.now() > deadline)
        return {
          readyToSendMs: null,
          reached: false,
          reason: `no composer matched within ${budgetMs}ms`,
        };
      await page.waitForTimeout(100);
    }
  } catch (error) {
    return {
      readyToSendMs: null,
      reached: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 「首次可交互」标记：首次引导、内置/外部会话输入框、首次运行引导页。
 * 冷启动落点通常是 onboarding；已引导过的配置直接进应用壳，因此两者都要认。
 * 50ms 轮询上限 90s：每次只查 4 个选择器，代价有界。
 */
async function waitForFirstInteractive(page, timeout) {
  const handle = await page.waitForFunction(
    () => {
      const markers = [
        '[data-testid="onboarding-page"]',
        '[data-testid="v4-composer-input"]',
        '[data-testid="studio-external-composer-input"]',
        '[data-testid="studio-first-run-guide"]',
      ];
      return markers.find((selector) => document.querySelector(selector)) ?? null;
    },
    undefined,
    { timeout, polling: 50 },
  );
  return { marker: await handle.jsonValue() };
}

async function measureDesktopLaunch(executable, profile, options) {
  const monotonicStart = performance.now();
  const clockSkewProbe = Date.now();
  let app;
  try {
    app = await _electron.launch({
      executablePath: resolve(executable),
      timeout: 90_000,
      env: { ...process.env, KNORVIA_ENV: "production", KNORVIA_PORTABLE_DIR: profile },
    });
    const launcherToProcessMs = Math.round(performance.now() - monotonicStart);
    const page = await app.firstWindow({ timeout: 90_000 });
    const firstWindowMs = Math.round(performance.now() - monotonicStart);
    const firstInteractive = await waitForFirstInteractive(page, 90_000);
    const firstInteractiveMs = Math.round(performance.now() - monotonicStart);
    // launch marks 是绝对时间戳，等首屏出现后再读既不影响数值，又能保证首屏渲染已写入这些标记。
    await page
      .waitForFunction(() => typeof window.__KNORVIA_RENDERER_START__ === "number", undefined, {
        timeout: 10_000,
      })
      .catch(() => {});
    const marks = await page.evaluate(() => {
      const target = window;
      return {
        launch: target.__KNORVIA_LAUNCH_MARKS__ ?? null,
        rendererStart: target.__KNORVIA_RENDERER_START__ ?? null,
        reactCommit: target.__KNORVIA_REACT_COMMIT_AT__ ?? null,
      };
    });
    await page.waitForTimeout(1_500);
    const snapshot = readProcessSnapshot();
    const ownProcesses = processTree(snapshot, app.process().pid);
    const idle = workingSetOf(ownProcesses);
    const launchMarks = marks.launch;
    const hostSpawnMs = launchMarks
      ? (ownProcesses
          .filter((entry) => String(entry.CommandLine ?? "").includes("node.mojom.NodeService"))
          .map((entry) => cimEpochMs(entry.CreationDate))
          .filter((value) => value !== null)
          .map((value) => Math.round(value - launchMarks.createdAt))
          .sort((left, right) => left - right)[0] ?? null)
      : null;
    const appProcessCreatedAt = cimEpochMs(
      snapshot.find((entry) => Number(entry.ProcessId) === Number(app.process().pid))?.CreationDate,
    );
    // 脚本用 performance.now() 计时，应用用 epoch ms 记 launch marks；
    // launcherClockSkewMs 把两个时间轴对齐（负值表示进程创建晚于脚本起点）。
    const launcherClockSkewMs =
      launchMarks && appProcessCreatedAt !== null && appProcessCreatedAt !== undefined
        ? Math.round(clockSkewProbe - appProcessCreatedAt)
        : null;
    const firstInteractiveFromProcessCreateMs =
      launcherClockSkewMs === null ? null : firstInteractiveMs + launcherClockSkewMs;
    const phases = launchMarks
      ? {
          processToMainModuleMs: Math.round(launchMarks.mainStart - launchMarks.createdAt),
          mainModuleToAppReadyMs: Math.round(launchMarks.appReady - launchMarks.mainStart),
          appReadyToWindowLoadMs: Math.round(launchMarks.loadUrl - launchMarks.appReady),
          windowLoadToRendererStartMs:
            marks.rendererStart === null
              ? null
              : Math.round(marks.rendererStart - launchMarks.loadUrl),
          rendererStartToFirstCommitMs:
            marks.rendererStart === null || marks.reactCommit === null
              ? null
              : Math.round(marks.reactCommit - marks.rendererStart),
          firstCommitToHostSpawnMs:
            marks.reactCommit === null || hostSpawnMs === null
              ? null
              : hostSpawnMs - Math.round(marks.reactCommit - launchMarks.createdAt),
          hostSpawnToFirstInteractiveMs:
            firstInteractiveFromProcessCreateMs === null || hostSpawnMs === null
              ? null
              : firstInteractiveFromProcessCreateMs - hostSpawnMs,
        }
      : null;
    const readyToSend = options.probeReadyToSend
      ? await probeReadyToSend(page, options.readyToSendBudgetMs)
      : null;
    return {
      kind: options.kind,
      launcherToProcessMs,
      firstWindowMs,
      firstInteractiveMs,
      firstInteractiveMarker: firstInteractive.marker,
      firstInteractiveFromProcessCreateMs,
      hostUtilityProcessSpawnMs: hostSpawnMs,
      launcherClockSkewMs,
      phases,
      idle,
      readyToSend,
    };
  } finally {
    await app?.close();
  }
}

async function measureDesktop(executable, options) {
  if (process.platform !== "win32") throw new Error("Desktop baseline currently requires Windows");
  const profile = await mkdtemp(resolve(tmpdir(), "knorvia-perf-profile-"));
  if (!resolve(profile).startsWith(`${resolve(tmpdir())}${sep}`))
    throw new Error("Unexpected fixture profile path");
  const samples = [];
  let hostStartup = null;
  let readyToSendSample = null;
  try {
    // 可比的冷/热样本：只等首次可交互，不改动配置目录里的引导状态。
    for (let index = 0; index < options.samples; index++) {
      // 第 0 次是全新配置的冷启动，之后复用同一配置目录测热启动。
      samples.push(
        await measureDesktopLaunch(executable, profile, {
          kind: index === 0 ? "cold" : "warm",
          probeReadyToSend: false,
          readyToSendBudgetMs: options.readyToSendBudgetMs,
        }),
      );
      if (index === 0) hostStartup = await readHostStartup(profile);
    }
    // “可发送”样本必须跳过首次引导，会把引导状态写进配置目录，因此放在最后单独跑。
    if (options.probeReadyToSend) {
      readyToSendSample = await measureDesktopLaunch(executable, profile, {
        kind: "warm-ready-to-send",
        probeReadyToSend: true,
        readyToSendBudgetMs: options.readyToSendBudgetMs,
      });
    }
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
  const firstInteractive = samples.map((sample) => sample.firstInteractiveMs).sort((a, b) => a - b);
  const median = firstInteractive[Math.floor((firstInteractive.length - 1) / 2)];
  // 日志只有相对自己锚点的偏移；用冷样本的 Host 派发时刻把锚点换算到「进程创建」。
  if (
    hostStartup &&
    typeof hostStartup.hostForkAtMs === "number" &&
    typeof samples[0]?.hostUtilityProcessSpawnMs === "number"
  ) {
    const anchorOffsetMs = samples[0].hostUtilityProcessSpawnMs - hostStartup.hostForkAtMs;
    const shift = (value) => (typeof value === "number" ? value + anchorOffsetMs : null);
    hostStartup.anchorFromProcessCreateMs = anchorOffsetMs;
    hostStartup.fromProcessCreateMs = {
      domReady: shift(hostStartup.domReadyAtMs),
      hostFork: shift(hostStartup.hostForkAtMs),
      hostServicesInit: shift(hostStartup.hostServicesInitAtMs),
      hostServicesReady: shift(hostStartup.hostServicesReadyAtMs),
    };
  }
  return {
    executable: resolve(executable),
    env: "KNORVIA_ENV=production",
    dataProfile: "isolated temp profile (KNORVIA_PORTABLE_DIR), fresh for the cold sample",
    samples,
    firstInteractiveMs: {
      samples: firstInteractive.length,
      min: firstInteractive[0],
      median,
      max: firstInteractive.at(-1),
    },
    hostStartup,
    ...(readyToSendSample
      ? {
          readyToSend: {
            firstInteractiveMs: readyToSendSample.firstInteractiveMs,
            firstInteractiveMarker: readyToSendSample.firstInteractiveMarker,
            readyToSendMs: readyToSendSample.readyToSend?.readyToSendMs ?? null,
            readyToSendReached: readyToSendSample.readyToSend?.reached ?? false,
            readyToSendSelector: readyToSendSample.readyToSend?.selector ?? null,
            readyToSendReason: readyToSendSample.readyToSend?.reason ?? null,
            note: "onboarding was skipped in this isolated profile before measuring the composer",
          },
        }
      : {}),
    // 兼容既有 schema：旧键仍指第一次冷启动的值。
    coldStartToOnboardingMs: samples[0].firstInteractiveMs,
    idle: samples[0].idle,
  };
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
if (flag("--run-history")) {
  result.runHistory = await measureRunHistory(
    numberArgument("--run-history-runs", 100, { min: 1, max: 1_000 }),
    numberArgument("--run-history-steps", 8, { min: 1, max: 64 }),
  );
}
const executable = argument("--executable");
if (executable) {
  result.desktop = await measureDesktop(executable, {
    samples: numberArgument("--desktop-samples", 3, { min: 1, max: 10 }),
    probeReadyToSend: !flag("--no-ready-to-send"),
    readyToSendBudgetMs: numberArgument("--ready-to-send-budget-ms", 20_000, {
      min: 1_000,
      max: 120_000,
    }),
  });
}
const artifact = argument("--artifact");
if (artifact) {
  const file = resolve(artifact);
  result.artifact = { path: file, bytes: (await stat(file)).size };
}
const portableDirectory = argument("--portable-dir");
if (portableDirectory) result.portable = await measurePortableDirectory(portableDirectory);
console.log(JSON.stringify(result, null, 2));
