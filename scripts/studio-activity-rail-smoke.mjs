#!/usr/bin/env node
// 使用源码 renderer 与现有本地 main 输出做隔离交互验收。
// 内核发现及模型目录只用夹具；不登录、不调用外部 CLI、不发送消息。
import assert from "node:assert/strict";
import { runStudioPageLayoutSmoke } from "./studio-page-layout-smoke.mjs";
import { runStudioPageMaterialsSmoke } from "./studio-page-materials-smoke.mjs";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktop = join(repo, "packages/desktop");
const require = createRequire(join(desktop, "package.json"));
const { build } = require("vite");
const { _electron } = require("playwright-core");
const executablePath = process.argv[2] ? resolve(process.argv[2]) : require("electron");
assert(existsSync(executablePath), "Electron runtime is unavailable");
const entry = join(desktop, "out/main/index.js");
assert(existsSync(entry), "Build the local desktop main bundle before this smoke test");
const root = await mkdtemp(join(tmpdir(), "knorvia-activity-rail-"));
const appData = join(root, "AppData/Roaming");
const localAppData = join(root, "AppData/Local");
const bootstrap = join(root, "bootstrap.mjs");
await Promise.all([mkdir(appData, { recursive: true }), mkdir(localAppData, { recursive: true })]);
// Windows Known Folder 不保证随环境变量重定向。导入真实 main 前显式设置隔离路径，
// 启动错误只记到测试 stderr；测试窗口保持隐藏，避免打断正在使用桌面的用户。
await writeFile(
  bootstrap,
  `
import { app } from "electron";
app.setPath("appData", ${JSON.stringify(appData)});
app.setPath("home", ${JSON.stringify(root)});
app.getAppPath = () => ${JSON.stringify(desktop)};
process.on("uncaughtException", error => { console.error(error); app.exit(1); });
app.on("browser-window-created", (_event, win) => {
  // 只在隔离验收内关闭后台节流，使隐藏窗口的编辑器恢复和布局帧仍能完成。
  win.webContents.setBackgroundThrottling(false);
  win.on("show", () => win.hide());
});
try { await import(${JSON.stringify(pathToFileURL(entry).href)}); }
catch (error) { console.error(error); app.exit(1); }
`,
);

const kernels = ["knorvia", "codex", "claude-code", "grok-build", "qoder-cn", "acp:sample"];
const mockCatalog = `
const statuses = ${JSON.stringify(kernels)}.map(id => ({
  id, installed: true, origin: id === "knorvia" ? "builtin" : "external",
  version: "fixture", management: "external",
  capabilities: { resume: true, approval: true, questions: false, readOnly: false, fullAccess: false },
}));
const refresh = async () => {};
export function useStudioKernelCatalog() {
  return { statuses, inspected: true, checking: false, error: "", reprobing: false, refresh, reprobe: refresh };
}`;
process.chdir(desktop);
process.env.KNORVIA_ENV = "test";
const rendererOutput = join(root, "renderer");
await build({
  configFile: join(desktop, "vite.config.ts"),
  logLevel: "warn",
  build: { outDir: rendererOutput, sourcemap: false },
  plugins: [
    {
      name: "activity-rail-offline-fixtures",
      enforce: "pre",
      transform(_code, id) {
        if (id.replaceAll("\\", "/").endsWith("/studio/agents/useStudioKernelCatalog.ts"))
          return mockCatalog;
        if (id.replaceAll("\\", "/").endsWith("/studio/agents/useStudioChatOptions.ts")) {
          return "export function useStudioChatOptions() { return { loading: false, retry() {} }; }";
        }
      },
    },
  ],
});
console.log("Isolated renderer build ready");
let app;
let page;
const results = [];
const pass = (value) => {
  results.push(value);
  console.log(value);
};
const pageErrors = [];
const resourceErrors = [];
try {
  const env = Object.fromEntries(
    ["SystemRoot", "SYSTEMROOT", "WINDIR", "ComSpec", "COMSPEC", "TEMP", "TMP"]
      .filter((key) => process.env[key])
      .map((key) => [key, process.env[key]]),
  );
  Object.assign(env, {
    PATH: `${dirname(process.execPath)};${join(process.env.SystemRoot ?? "C:/Windows", "System32")}`,
    HOME: root,
    USERPROFILE: root,
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    KNORVIA_ENV: "test",
    KNORVIA_DATA_BASE_DIR: root,
    KNORVIA_HOME: join(root, ".knorvia-studio"),
    KNORVIA_STORAGE_DIR: join(root, ".knorvia-studio"),
    KNORVIA_BASE_URL: "http://127.0.0.1:9",
    KNORVIA_DISABLE_FIXED_REMOTE_DEBUGGING_PORT: "1",
    ELECTRON_RENDERER_URL: pathToFileURL(join(rendererOutput, "index.html")).href,
  });
  app = await _electron.launch({ executablePath, args: [bootstrap], env, timeout: 90000 });
  page = await app.firstWindow({ timeout: 90000 });
  const devtools = await app.context().newCDPSession(page);
  await devtools.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  console.log(`Renderer: ${page.url()}`);
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    resourceErrors.push({ url: request.url(), error: request.failure()?.errorText });
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      resourceErrors.push({ url: response.url(), status: response.status() });
  });
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setSize(1360, 900);
  });
  await page.route(/^https?:\/\//, (route) => route.abort());
  const onboarding = page.getByTestId("onboarding-page");
  await page
    .locator('[data-testid="onboarding-page"], [data-testid="studio-activity-rail"]')
    .first()
    .waitFor({ timeout: 45000 });
  if (await onboarding.isVisible()) {
    for (let step = 0; step < 3; step++)
      await onboarding.getByRole("button", { name: /^(跳过|Skip)$/i }).click();
  }
  const later = page.getByTestId("studio-first-run-later");
  // 每次都是空的隔离配置，首次引导会在异步读取偏好后出现，不能用瞬时 isVisible 跳过等待。
  await later.waitFor();
  await later.click();
  const rail = page.getByTestId("studio-activity-rail");
  await rail.waitFor();
  assert.equal(Math.round((await rail.boundingBox()).width), 56);
  assert.equal(await rail.locator('[data-testid^="studio-rail-kernel-"]').count(), 4);
  assert.equal(await page.getByTestId("studio-workflows-open").count(), 1);
  pass("PASS one 56px activity rail and bounded kernel section");

  const titlebar = page.getByTestId("studio-window-titlebar");
  const sheet = page.locator('[data-studio-workspace-sheet="true"]');
  const sidebar = page.locator("[data-workspace-sidebar-panel]");
  const resizeHandle = page.locator('[role="separator"][aria-controls="sidebar"]');
  const waitForSidebar = (visible) =>
    page.waitForFunction((expected) => {
      const panel = document.querySelector("[data-workspace-sidebar-panel]");
      const width = panel.getBoundingClientRect().width;
      return expected ? width > 200 && !panel.querySelector("aside[inert]") : width < 1;
    }, visible);
  const verifySheet = async () => {
    const geometry = await sheet.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const sidebar = element
        .querySelector("[data-workspace-sidebar-panel]")
        ?.getBoundingClientRect();
      const panel = element.querySelector("[data-workspace-conversation-frame]");
      const titlebarRect = document
        .querySelector('[data-testid="studio-window-titlebar"]')
        .getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        bottom: rect.bottom,
        viewport: innerHeight,
        titlebarBottom: titlebarRect.bottom,
        sidebarX: sidebar?.x,
        radius: parseFloat(getComputedStyle(element).borderTopLeftRadius),
        innerRadius: parseFloat(getComputedStyle(panel).borderTopLeftRadius),
        innerShadow: getComputedStyle(panel).boxShadow,
      };
    });
    assert(geometry.x >= 56);
    assert.equal(geometry.y, geometry.titlebarBottom);
    assert(geometry.sidebarX >= geometry.x && geometry.sidebarX <= geometry.x + 2);
    assert(geometry.radius > 0);
    assert.equal(geometry.innerRadius, 0);
    assert.equal(geometry.innerShadow, "none");
    assert(geometry.bottom <= geometry.viewport);
    assert.equal(await titlebar.getByTestId("desktop-window-controls").count(), 1);
    assert.equal(await sheet.getByTestId("desktop-window-controls").count(), 0);
  };
  await verifySheet();
  assert.equal(await titlebar.getByTestId("desktop-top-nav-back").count(), 1);
  pass("PASS sidebar and content share one rounded sheet below a single titlebar");
  for (const id of ["codex", "claude-code", "grok-build"]) {
    const icon = rail.getByTestId(`studio-rail-kernel-${id}`).locator("img");
    await icon.evaluate((element) => element.decode());
    assert.equal(await icon.evaluate((element) => getComputedStyle(element).filter), "none");
    assert.equal(
      await icon.evaluate((element) =>
        /(?:^data:image\/svg\+xml|\.svg(?:$|\?))/.test(element.currentSrc),
      ),
      true,
    );
  }
  pass("PASS transparent vector kernel marks load at the shared toolbar size");

  await runStudioPageLayoutSmoke({
    page,
    app,
    rail,
    titlebar,
    sidebar,
    resizeHandle,
    waitForSidebar,
    pass,
  });

  const editor = page.getByTestId("studio-external-composer-input");
  const readDrafts = () =>
    page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("knorvia-studio:agent-drafts:v1") ?? "{}").data?.drafts ??
        {},
    );
  const waitForDraftText = (expected) =>
    page.waitForFunction(
      (text) =>
        Object.values(
          JSON.parse(localStorage.getItem("knorvia-studio:agent-drafts:v1") ?? "{}").data?.drafts ??
            {},
        ).some((draft) => draft.text === text),
      expected,
    );
  const expectEditor = (expected) =>
    page.waitForFunction(
      (text) =>
        document
          .querySelector('[data-testid="studio-external-composer-input"]')
          ?.textContent?.trim() === text,
      expected,
    );
  const setEditor = async (text) => {
    await page
      .locator('[data-testid="studio-external-composer-input"][data-e2e-lexical-bridge="ready"]')
      .waitFor();
    // 现有桥接更新真实 Lexical state 并走 onChange/persist，不直接改 DOM 或草稿 Store。
    await editor.evaluate(
      (element, value) => element.__knorviaLexicalInputE2E.setText(value),
      text,
    );
  };
  await setEditor("Activity rail draft stays with Codex");
  await waitForDraftText("Activity rail draft stays with Codex");
  console.log("Codex draft persisted");
  const originalDrafts = await readDrafts();
  await rail.getByTestId("studio-workflows-open").click();
  await rail.getByTestId("studio-rail-kernel-codex").click();
  await expectEditor("Activity rail draft stays with Codex");
  assert.deepEqual(Object.keys(await readDrafts()), Object.keys(originalDrafts));

  await rail.getByTestId("task-settings-button").click();
  await page.getByTestId("settings-page").waitFor();
  assert.equal(
    await page.locator('[data-root-workspace-surface="inert"]').getAttribute("inert"),
    "",
  );
  assert.equal(await rail.evaluate((element) => Boolean(element.closest("[inert]"))), false);
  await rail.getByTestId("studio-chats-open").click();
  await page.getByTestId("settings-page").waitFor({ state: "hidden" });
  await expectEditor("Activity rail draft stays with Codex");
  pass(
    "PASS same-kernel and settings round trips preserve the original draft; covered workspace is inert",
  );

  await rail.getByTestId("studio-plugins-open").click();
  await page.locator('[data-testid="settings-page"][data-active-section="plugin"]').waitFor();
  assert.equal(await page.locator("[data-settings-sidebar]").isVisible(), false);
  const pluginFrame = await page.locator("[data-settings-panel-frame]").boundingBox();
  const sheetFrame = await sheet.boundingBox();
  assert(Math.abs(pluginFrame.x - sheetFrame.x) <= 1);
  assert(Math.abs(pluginFrame.width - sheetFrame.width) <= 2);
  assert.equal(await page.getByTestId("settings-section-nav-plugin").count(), 0);
  assert.equal(await titlebar.getByTestId("desktop-window-controls").count(), 1);
  // 工作区在设置下仍挂载；Portal 必须显式停止渲染，不能逃出 inert 的边界。
  assert.equal(await titlebar.getByTestId("desktop-top-nav-back").count(), 0);
  await rail.getByTestId("studio-plugins-open").click();
  await page.locator('[data-testid="settings-page"][data-active-section="plugin"]').waitFor();
  await rail.getByTestId("task-settings-button").click();
  await page.locator('[data-testid="settings-page"][data-active-section="general"]').waitFor();
  assert.equal(await page.locator("[data-settings-sidebar]").isVisible(), true);
  await rail.getByTestId("studio-chats-open").click();
  await page.getByTestId("settings-page").waitFor({ state: "hidden" });
  await expectEditor("Activity rail draft stays with Codex");
  assert.deepEqual(Object.keys(await readDrafts()), Object.keys(originalDrafts));
  await verifySheet();
  pass(
    "PASS plugins use the full sheet, settings restores its own navigation, and the current draft is preserved",
  );

  await rail.getByTestId("studio-rail-kernel-claude-code").click();
  await page
    .locator('[data-testid="studio-external-chat"][data-kernel-id="claude-code"]')
    .waitFor();
  await expectEditor("");
  await setEditor("Independent Claude draft");
  await waitForDraftText("Independent Claude draft");
  const savedDrafts = Object.values(await readDrafts());
  assert(
    savedDrafts.some(
      (draft) =>
        draft.kernelId === "codex" && draft.text === "Activity rail draft stays with Codex",
    ),
  );
  assert(
    savedDrafts.some(
      (draft) => draft.kernelId === "claude-code" && draft.text === "Independent Claude draft",
    ),
  );
  pass("PASS different kernels keep independent unsent drafts");

  const more = rail.getByTestId("studio-rail-kernels-more");
  await more.focus();
  await more.press("Enter");
  const custom = page.getByRole("menuitemradio", { name: "sample", exact: true });
  await custom.focus();
  await custom.press("Enter");
  await rail.getByTestId("studio-rail-kernel-acp:sample").waitFor();
  assert.equal(await rail.locator('[data-testid^="studio-rail-kernel-"]').count(), 4);
  pass("PASS keyboard menu selection keeps an overflow kernel visible");

  await page
    .getByRole("button", { name: /切换侧边栏|Toggle sidebar/i })
    .first()
    .click();
  await rail.getByTestId("studio-workflows-open").click();
  await page.getByTestId("studio-workflows").waitFor();
  assert.equal(await rail.isVisible(), true);
  pass("PASS rail remains usable with the content sidebar collapsed");

  await runStudioPageMaterialsSmoke({ page, rail, sheet, devtools, repo, pass });

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 650));
  assert.equal(await rail.getByTestId("task-settings-button").isVisible(), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await verifySheet();
  pass("PASS short-window full-sheet tools and settings access without horizontal overflow");
  assert.deepEqual(pageErrors, []);
  // 按本轮跳过目视复核的要求，仅保留交互断言与结构化诊断；隐藏窗口无需生成截图。
} catch (error) {
  if (page) {
    await writeFile(
      join(root, "failure.txt"),
      await page
        .locator("body")
        .innerText()
        .catch(() => "No renderer body"),
    );
  }
  throw error;
} finally {
  if (app) {
    await app.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => {});
    await app.close();
  }
  await writeFile(
    join(root, "result.json"),
    JSON.stringify({ results, pageErrors, resourceErrors }, null, 2),
  );
  console.log(results.join("\n"));
  console.log(`Artifacts: ${root}`);
}
