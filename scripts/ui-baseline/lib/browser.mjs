// SPDX-License-Identifier: Apache-2.0
// 浏览器侧夹具：固定主题、时钟、动画与栅格化，等待页面稳定后再截图并采集关键元素几何。
import { createHash } from "node:crypto";
import { CHROMIUM_ARGS } from "./chrome.mjs";
import { collectGeometry } from "./geometry.mjs";

/** 固定时钟：截图不依赖墙上时间，时间相关文案（相对时间、日期）在同一提交内保持一致。 */
export const FIXED_CLOCK_ISO = "2026-11-01T00:00:00.000Z";

/** 固定时区：跨机器比较时日期/时间文案的本地化结果保持一致。 */
export const FIXED_TIMEZONE = "UTC";

/** 固定语言：页面语言由夹具设置决定，浏览器语言只作为兜底，保持常量避免跨机器漂移。 */
const FIXED_BROWSER_LOCALE = "zh-CN";

export const CHROMIUM_LAUNCH_OPTIONS = Object.freeze({
  headless: true,
  args: [...CHROMIUM_ARGS],
});

function initScriptPayload({ theme, clockMs }) {
  try {
    window.localStorage.setItem(
      "knorvia-theme",
      theme === "dark" ? "knorvia-dark" : "knorvia-light",
    );
    window.localStorage.setItem("knorvia:settings-last-section", "general");
  } catch {
    // 存储不可用时主题仍由夹具的系统偏好回退决定。
  }
  const installStaticStyles = () => {
    if (document.querySelector('style[data-ui-baseline="static"]')) return;
    const style = document.createElement("style");
    style.setAttribute("data-ui-baseline", "static");
    style.textContent = [
      // 动效全部压成 0：保留动画结束态，同时消除逐帧差异。
      "*,",
      "*::before,",
      "*::after {",
      "  animation-delay: 0s !important;",
      "  animation-duration: 0s !important;",
      "  transition-delay: 0s !important;",
      "  transition-duration: 0s !important;",
      "}",
      // 光标闪烁会让同一页面在同一提交内两次截图出现差异，直接隐藏。
      "* { caret-color: transparent !important; }",
      // 滚动条出现与否取决于内容高度之外的时序，统一隐藏避免边缘像素抖动。
      "* { scrollbar-width: none; }",
      "*::-webkit-scrollbar { display: none; }",
    ].join("\n");
    (document.head ?? document.documentElement).appendChild(style);
  };
  if (document.head) installStaticStyles();
  else document.addEventListener("DOMContentLoaded", installStaticStyles, { once: true });
  // 固定 Date：不接管 setTimeout/requestAnimationFrame，避免让应用的时间轴停摆。
  const RealDate = Date;
  const fixed = clockMs;
  class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(fixed);
      else super(...args);
    }
    static now() {
      return fixed;
    }
  }
  window.Date = FixedDate;
}

/** 建立一次截图用的浏览器上下文：固定视口、主题、动效与时区。 */
export async function createCaptureContext(
  browser,
  { theme, viewport, clockIso = FIXED_CLOCK_ISO },
) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: theme,
    reducedMotion: "reduce",
    locale: FIXED_BROWSER_LOCALE,
    timezoneId: FIXED_TIMEZONE,
  });
  const clockMs = Date.parse(clockIso);
  if (!Number.isFinite(clockMs)) throw new Error(`固定时钟无效：${clockIso}`);
  await context.addInitScript(initScriptPayload, { theme, clockMs });
  return context;
}

async function waitForAttribute(page, { testId, attribute, value }, timeout = 30_000) {
  await page.waitForFunction(
    ({ testId: id, attribute: name, value: expected }) =>
      document.querySelector(`[data-testid="${CSS.escape(id)}"]`)?.getAttribute(name) === expected,
    { testId, attribute, value },
    { timeout },
  );
}

/** 按 pages.json 的 open 步骤打开页面。步骤只描述用户可见操作，不用 sleep 凑结果。 */
export async function runOpenSteps(page, steps) {
  for (const step of steps) {
    if (step.click) {
      await page.getByTestId(step.click).first().click();
      continue;
    }
    if (step.clickRole) {
      await page
        .getByRole(step.clickRole.role, {
          name: step.clickRole.name,
          ...(step.clickRole.exact === undefined ? {} : { exact: step.clickRole.exact }),
        })
        .first()
        .click();
      continue;
    }
    if (step.waitFor) {
      await page.getByTestId(step.waitFor).first().waitFor({ state: "visible" });
      continue;
    }
    if (step.waitForAttribute) {
      await waitForAttribute(page, step.waitForAttribute);
      continue;
    }
    if (step.press) {
      await page.keyboard.press(step.press);
    }
  }
}

/** 需要先在宽屏打开再切宽度的页面，用这个视口执行打开步骤（活动栏在宽屏才渲染）。 */
export const WIDE_OPEN_VIEWPORT = Object.freeze({ width: 1360, height: 900 });

/** 窄 Web（<768px）不渲染活动栏，宽屏专属的 testid 在窄宽度下不参与几何比较。 */
export const NARROW_BREAKPOINT_PX = 768;

function effectiveTestIds(pageDefinition, viewport) {
  if (viewport.width >= NARROW_BREAKPOINT_PX) return pageDefinition.testIds;
  const wideOnly = new Set(pageDefinition.wideOnlyTestIds ?? []);
  return pageDefinition.testIds.filter((testId) => !wideOnly.has(testId));
}

/** 窄 Web（<768px）不渲染活动栏，应用外壳的就绪标记必须与宽度无关。 */
const APP_SHELL_MARKERS = [
  "[data-testid='studio-activity-rail']",
  "[data-testid='v4-pane-shell-workspace-main']",
  "[data-testid='conversation']",
  "[data-testid='task-workbench']",
  "[data-testid='studio-groups-page']",
  "[data-testid='studio-workflows']",
  "[data-testid='studio-creation-page']",
  "[data-testid='settings-page']",
];

async function waitForAppShell(page, timeout = 60_000) {
  await page.waitForFunction(
    (selectors) =>
      selectors.some((selector) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement)) return false;
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      }),
    APP_SHELL_MARKERS,
    { timeout, polling: 100 },
  );
}

export const DEFAULT_SETTLE_QUIET_MS = 3_000;
export const DEFAULT_SETTLE_MINIMUM_MS = 6_000;
export const DEFAULT_SETTLE_TIMEOUT_MS = 60_000;

/**
 * 页面签名：DOM 规模 + 滚动高度 + 全部 testid 几何 + 文本指纹。
 * 必须包含文本指纹：内核目录、插件概览这类异步数据只改文案、不改几何，
 * 漏掉它就会截到「数据还没到」的那一帧。
 */
function pageSignature() {
  const boxes = [];
  for (const element of document.querySelectorAll("[data-testid]")) {
    const box = element.getBoundingClientRect();
    boxes.push(
      `${element.getAttribute("data-testid")}:${Math.round(box.x)}:${Math.round(box.y)}:${Math.round(box.width)}:${Math.round(box.height)}`,
    );
  }
  boxes.sort();
  const text = document.body.innerText ?? "";
  // FNV-1a：够快，且对文案变化敏感。
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return [
    document.querySelectorAll("*").length,
    document.body.scrollHeight,
    text.length,
    hash,
    boxes.join(","),
  ].join("|");
}

/**
 * 等页面稳定：`minimumMs` 之后，DOM 签名（元素数 + 滚动高度 + 全部 testid 几何 + 文本指纹）
 * 连续 `quietMs` 不变即认为稳定。
 *
 * 为什么不能把「WebSocket 静默」当硬条件：creation 这类页面会持续有 WS 帧（流式/心跳），
 * 帧静默永远不成立，页面反而永远不稳定。异步数据到达引起的变化本身会改变签名，所以以签名静默为准；
 * `minimumMs` 用来覆盖已知的异步阶段（实测内核对齐发生在 11.9–13.0s）。
 * `lastFrameAt` 只进错误信息，不参与判定。
 */
export async function waitForStable(
  page,
  {
    timeoutMs = DEFAULT_SETTLE_TIMEOUT_MS,
    quietMs = DEFAULT_SETTLE_QUIET_MS,
    minimumMs = DEFAULT_SETTLE_MINIMUM_MS,
    pollMs = 250,
    lastFrameAt = () => 0,
  } = {},
) {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let previous = null;
  let lastChangeAt = startedAt;
  for (;;) {
    const current = await page.evaluate(pageSignature);
    const now = Date.now();
    if (current !== previous) {
      previous = current;
      lastChangeAt = now;
    }
    if (now - startedAt >= minimumMs && now - lastChangeAt >= quietMs) return;
    if (now > deadline) {
      throw new Error(
        [
          `页面在 ${timeoutMs}ms 内未稳定：`,
          `  距上次界面变化 ${now - lastChangeAt}ms（要求 ${quietMs}ms），距最后一个 WebSocket 帧 ${now - lastFrameAt()}ms`,
          `  签名长度 ${current.length}，元素数 ${current.split("|")[0]}`,
          "先修夹具（等待正确的就绪标记）或页面，不要加容差、不要改阈值掩盖。",
        ].join("\n"),
      );
    }
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done())));
    await page.waitForTimeout(pollMs);
  }
}

function pageSignals(route) {
  return {
    route,
    testIds: [
      ...new Set(
        [...document.querySelectorAll("[data-testid]")].map((el) => el.getAttribute("data-testid")),
      ),
    ].sort(),
    kernelOptions: [
      ...new Set(
        [...document.querySelectorAll('[data-testid="workbench-kernel"] option')].map(
          (option) => option.value,
        ),
      ),
    ].sort(),
    bodyText: (document.body.innerText ?? "").replace(/\s+/gu, " ").trim(),
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * 打开一个页面并采集一次截图数据。
 * 返回 `{ image, geometry, signals, screenshotMs }`，`image` 是 PNG Buffer。
 *
 * Vite 依赖预构建或热更新可能让页面在截图过程中整页重载，那样拿到的是半张图。
 * 这类情况下重新走一遍完整流程（含夹具固定），最多 3 次；稳定不下来就报错，不降级产出。
 */
export async function capturePage(options) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await capturePageOnce(options);
    } catch (error) {
      lastError = error;
      if (attempt === 3 || !isRetryableCaptureError(error)) throw error;
      options.log?.(
        `[ui-baseline] ${options.page.id} ${options.theme} ${options.viewport.width} 第 ${attempt} 次尝试遇到页面重载，重试`,
      );
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  throw lastError;
}

function isRetryableCaptureError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /Execution context was destroyed|because of a navigation|页面发生了重载/u.test(message);
}

async function capturePageOnce({ browser, baseUrl, page: pageDefinition, theme, viewport }) {
  const openWidth = pageDefinition.openWidth ?? "target";
  const contextViewport = openWidth === "wide" ? WIDE_OPEN_VIEWPORT : viewport;
  const context = await createCaptureContext(browser, { theme, viewport: contextViewport });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const consoleErrors = [];
    page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(`console: ${message.text()}`);
    });
    let mainFrameNavigations = 0;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) mainFrameNavigations++;
    });
    // 记录最后一个 WebSocket 帧：内核目录、插件概览这类异步数据只在帧到达后才渲染，
    // 只看 DOM 签名会截到「请求已发出、响应还没回来」的那一帧。
    let lastFrameAt = 0;
    page.on("websocket", (socket) => {
      socket.on("framereceived", () => {
        lastFrameAt = Date.now();
      });
    });
    const url = new URL(pageDefinition.route, baseUrl).toString();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await waitForAppShell(page);
    const navigationsAfterLoad = mainFrameNavigations;
    await runOpenSteps(page, pageDefinition.open);
    if (
      openWidth === "wide" &&
      (viewport.width !== WIDE_OPEN_VIEWPORT.width || viewport.height !== WIDE_OPEN_VIEWPORT.height)
    ) {
      // 窄 Web 不渲染活动栏，工作台等页面在 390 宽下没有可达入口。
      // 夹具的做法是先在宽屏完成打开步骤，再切到目标宽度：截到的仍是同一路由在目标宽度下的渲染。
      await page.setViewportSize(viewport);
    }
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await waitForStable(page, { lastFrameAt: () => lastFrameAt });
    if (mainFrameNavigations > navigationsAfterLoad) {
      throw new Error("截图过程中页面发生了重载（Vite 依赖优化或热更新）");
    }
    const started = Date.now();
    const image = await page.screenshot({ animations: "disabled", fullPage: false });
    const screenshotMs = Date.now() - started;
    if (mainFrameNavigations > navigationsAfterLoad) {
      throw new Error("截图过程中页面发生了重载（Vite 依赖优化或热更新）");
    }
    const geometry = await collectGeometry(page, effectiveTestIds(pageDefinition, viewport));
    const signals = await page.evaluate(pageSignals, pageDefinition.route);
    return {
      image,
      geometry,
      signals: {
        ...signals,
        bodyTextSha256: sha256(signals.bodyText),
        bodyTextLength: signals.bodyText.length,
        consoleErrors,
      },
      screenshotMs,
    };
  } finally {
    await context.close().catch(() => {});
  }
}

/** 预热：让 Vite 依赖预构建完成，避免正式截图时被整页刷新打断。 */
export async function warmUpWebApp({ browser, baseUrl, log = () => {} }) {
  const context = await createCaptureContext(browser, {
    theme: "light",
    viewport: { width: 1360, height: 900 },
  });
  try {
    const page = await context.newPage();
    const ready = async () => {
      await page.getByTestId("studio-activity-rail").first().waitFor({ state: "visible" });
      await waitForStable(page, { timeoutMs: 60_000 });
    };
    const warmed = await Promise.race([
      page
        .goto(baseUrl, { waitUntil: "domcontentloaded" })
        .then(ready)
        // 依赖优化触发的整页刷新会让第一次等待失败，重新加载一次即可拿到稳定页面。
        .then(() => page.reload({ waitUntil: "domcontentloaded" }))
        .then(ready)
        .then(() => true)
        .catch(() => false),
      new Promise((resolve) => setTimeout(() => resolve(false), 120_000)),
    ]);
    if (!warmed)
      log("[ui-baseline] 预热未在预算内看到应用外壳，继续截图（后续等待仍会失败即报错）");
  } finally {
    await context.close().catch(() => {});
  }
}
