#!/usr/bin/env node
// 成品验收：丝带线图标与进入动画（specs/knorvia-icon-language.md、specs/knorvia-entrance-motion.md）。
// 只启动传入的真实打包程序，使用隔离临时资料；不登录、不调用模型、不读写桌面用户 data。
// 用法：node scripts/studio-icon-entrance-acceptance.mjs <path/to/Knorvia Studio.exe>
import assert from "node:assert/strict";
import { join } from "node:path";
import { completeOnboarding, packagedProbe } from "./studio-packaged-test-utils.mjs";

const probe = await packagedProbe("icon-entrance", process.argv[2]);
let failure;

/** 当前页面中仍是原 lucide 字形（没有 knorvia-icon 标记）的图标数量与样例。 */
const iconAudit = (page) =>
  page.evaluate(() => {
    const all = [...document.querySelectorAll("svg.lucide")];
    const legacy = all.filter((svg) => !svg.classList.contains("knorvia-icon"));
    return {
      total: all.length,
      knorvia: all.length - legacy.length,
      legacy: legacy.slice(0, 8).map((svg) => svg.getAttribute("class")),
    };
  });

/** 截图前把窗口移到屏幕外并无焦点显示：隐藏窗口不产生绘制帧，但也不能打扰正在使用桌面的用户。 */
async function revealOffscreen() {
  await probe.app.evaluate(({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.removeAllListeners("show");
      win.setPosition(-4000, 40);
      win.setSize(1280, 820);
      win.showInactive();
    }
  });
}

async function capture(page, name) {
  const path = join(probe.root, `${name}.png`);
  try {
    await page.screenshot({ path, timeout: 15_000 });
    probe.result.screenshots = [...(probe.result.screenshots ?? []), path];
  } catch (error) {
    // 隐藏窗口在部分显卡驱动下不能截图；截图只作辅助证据，不替代 DOM 断言。
    probe.result.screenshotErrors = [
      ...(probe.result.screenshotErrors ?? []),
      `${name}: ${error.message.split("\n")[0]}`,
    ];
  }
}

async function expectAllKnorvia(page, label) {
  const audit = await iconAudit(page);
  assert.ok(audit.total > 0, `${label}: 页面没有图标`);
  assert.deepEqual(audit.legacy, [], `${label}: 仍有原 lucide 图标`);
  probe.pass(`${label}：${audit.total} 个图标全部为 Knorvia 字形`);
  await capture(page, label);
}

try {
  let page = await probe.open();
  const entrance = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const introShell = Boolean(document.querySelector(".knorvia-intro__word"));
        const strokes = document.querySelectorAll(".knorvia-intro__strokes i").length;
        const done = (how) =>
          resolve({
            introShell,
            strokes,
            how,
            enterItems: document.querySelectorAll("[data-knorvia-enter-item]").length,
            entering: document.body.classList.contains("knorvia-studio-entering"),
          });
        if (document.body.classList.contains("knorvia-studio-startup-ready"))
          return done("before-attach");
        new MutationObserver((_records, observer) => {
          if (!document.body.classList.contains("knorvia-studio-startup-ready")) return;
          observer.disconnect();
          done("observed");
        }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
      }),
  );
  probe.result.entrance = entrance;
  if (entrance.how === "observed") {
    assert.ok(entrance.introShell, "启动壳应包含字标");
    assert.equal(entrance.strokes, 3, "启动壳应包含三道笔画");
  }
  await page.locator("#loading").waitFor({ state: "detached", timeout: 10_000 });
  await page.waitForFunction(
    () => !document.body.classList.contains("knorvia-studio-entering"),
    null,
    {
      timeout: 10_000,
    },
  );
  assert.equal(await page.locator("[data-knorvia-enter-item]").count(), 0, "进入标记应已清理");
  probe.pass(`进入动画完成并清理（${entrance.how}，滑入元素 ${entrance.enterItems}）`);

  await completeOnboarding(page);
  await revealOffscreen();
  const rail = page.getByTestId("studio-activity-rail");
  await rail.waitFor();
  const railAudit = await rail.evaluate((node) => {
    const icons = [...node.querySelectorAll("nav svg.lucide")];
    return {
      total: icons.length,
      knorvia: icons.filter((svg) => svg.classList.contains("knorvia-icon")).length,
    };
  });
  assert.ok(
    railAudit.total >= 6 && railAudit.total === railAudit.knorvia,
    JSON.stringify(railAudit),
  );
  const tint = await rail.evaluate((node) => {
    const active = node.querySelector('[aria-pressed="true"] .knorvia-icon-tint');
    const idle = node.querySelector('[aria-pressed="false"] .knorvia-icon-tint');
    return {
      active: active ? getComputedStyle(active).fillOpacity : null,
      idle: idle ? getComputedStyle(idle).fillOpacity : null,
    };
  });
  assert.equal(tint.active, "0.2", `选中按钮纸片底应加深：${JSON.stringify(tint)}`);
  assert.equal(tint.idle, "0.1", `未选中按钮纸片底：${JSON.stringify(tint)}`);
  probe.pass(`工具栏 ${railAudit.total} 个图标为 Knorvia 字形，选中纸片底 0.2 / 常态 0.1`);
  await expectAllKnorvia(page, "chat-light");

  for (const [testId, label] of [
    ["studio-groups-open", "groups"],
    ["automations-open", "automations"],
    ["studio-workflows-open", "workflows"],
    ["studio-creation-open", "creation"],
  ]) {
    await page.getByTestId(testId).click();
    await page.waitForTimeout(700);
    await expectAllKnorvia(page, label);
  }

  await page.getByTestId("studio-plugins-open").click();
  await page.locator('[data-testid="settings-page"][data-active-section="plugin"]').waitFor();
  await page.waitForTimeout(900);
  const pluginImages = await page.evaluate(() =>
    [...document.querySelectorAll("img")].map((img) => img.getAttribute("src") ?? ""),
  );
  assert.ok(
    !pluginImages.some((src) =>
      /(plugin-icons|document-skill-icons)|documents-.*\.png|spreadsheets-.*\.png/u.test(src),
    ),
    "插件页不应再加载彩色 PNG",
  );
  probe.result.pluginSvgTiles = pluginImages.filter((src) =>
    src.startsWith("data:image/svg+xml"),
  ).length;
  probe.pass(`插件页未加载彩色 PNG；SVG 图块 ${probe.result.pluginSvgTiles} 个`);
  await expectAllKnorvia(page, "plugins");

  await page.getByTestId("task-settings-button").click();
  await page.locator('[data-testid="settings-page"]').waitFor();
  await page.waitForTimeout(600);
  await expectAllKnorvia(page, "settings");

  await page.evaluate(() => localStorage.setItem("knorvia-theme", "knorvia-dark"));
  await page.reload();
  await page.locator("#loading").waitFor({ state: "detached", timeout: 15_000 });
  await page.getByTestId("studio-activity-rail").waitFor();
  await revealOffscreen();
  await page.waitForTimeout(1200);
  const darkTint = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--knorvia-icon-tint").trim(),
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.getAttribute("data-knorvia-startup-theme")),
    "dark",
  );
  assert.equal(Number(darkTint), 0.14, `深色纸片底：${darkTint}`);
  probe.pass("深色主题：启动壳按深色绘制，纸片底 0.14");
  await expectAllKnorvia(page, "chat-dark");
} catch (error) {
  failure = error;
} finally {
  await probe.finish(failure);
}
