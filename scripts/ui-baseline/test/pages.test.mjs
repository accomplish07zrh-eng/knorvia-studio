// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { normalizePages, readPagesFile, selectPages } from "../lib/pages.mjs";

const pagesPath = join(dirname(fileURLToPath(import.meta.url)), "..", "pages.json");

const minimal = {
  schema: 1,
  themes: ["light", "dark"],
  viewports: [{ width: 1360, height: 900 }],
  pages: [
    {
      id: "a",
      group: "g",
      title: "t",
      open: [{ click: "opener" }, { waitFor: "marker" }],
      testIds: ["marker"],
    },
  ],
};

test("合法清单补全默认值", () => {
  const normalized = normalizePages(minimal);
  assert.equal(normalized.pages[0].route, "/");
  assert.equal(normalized.pages[0].fixture, "default");
  assert.equal(normalized.pages[0].openWidth, "target");
  assert.equal(normalized.pages[0].description, "");
  assert.deepEqual(normalized.viewports, [{ width: 1360, height: 900 }]);
});

test("openWidth 只接受 target 与 wide", () => {
  const page = { ...minimal.pages[0], openWidth: "wide" };
  assert.equal(normalizePages({ ...minimal, pages: [page] }).pages[0].openWidth, "wide");
  assert.throws(
    () => normalizePages({ ...minimal, pages: [{ ...page, openWidth: "desktop" }] }),
    /openWidth/,
  );
});

test("wideOnlyTestIds 必须是 testIds 的子集", () => {
  const page = {
    ...minimal.pages[0],
    testIds: ["marker", "rail"],
    wideOnlyTestIds: ["rail"],
  };
  assert.deepEqual(normalizePages({ ...minimal, pages: [page] }).pages[0].wideOnlyTestIds, [
    "rail",
  ]);
  assert.throws(
    () => normalizePages({ ...minimal, pages: [{ ...page, wideOnlyTestIds: ["other"] }] }),
    /必须同时出现在 testIds/,
  );
});

test("schema、主题与页面 id 都要校验", () => {
  assert.throws(() => normalizePages({ ...minimal, schema: 2 }), /schema/);
  assert.throws(() => normalizePages({ ...minimal, themes: ["sepia"] }), /light \/ dark/);
  assert.throws(
    () => normalizePages({ ...minimal, pages: [minimal.pages[0], minimal.pages[0]] }),
    /重复/,
  );
  assert.throws(
    () => normalizePages({ ...minimal, pages: [{ ...minimal.pages[0], id: "Bad Id" }] }),
    /小写字母/,
  );
});

test("步骤必须恰好是一种受支持的动作", () => {
  const withStep = (step) => ({
    ...minimal,
    pages: [{ ...minimal.pages[0], open: [step] }],
  });
  assert.throws(() => normalizePages(withStep({})), /恰好使用一种步骤/);
  assert.throws(() => normalizePages(withStep({ click: "a", waitFor: "b" })), /恰好使用一种步骤/);
  assert.throws(() => normalizePages(withStep({ hover: "a" })), /恰好使用一种步骤/);
  assert.throws(() => normalizePages(withStep({ clickRole: { name: "x" } })), /clickRole\.role/);
  assert.throws(
    () => normalizePages(withStep({ waitForAttribute: { testId: "a", attribute: "b" } })),
    /waitForAttribute\.value/,
  );
  assert.deepEqual(
    normalizePages(withStep({ clickRole: { role: "button", name: "新建" } })).pages[0].open,
    [{ clickRole: { role: "button", name: "新建" } }],
  );
});

test("未知页面字段与空 testIds 直接报错", () => {
  assert.throws(
    () => normalizePages({ ...minimal, pages: [{ ...minimal.pages[0], extra: 1 }] }),
    /未知字段/,
  );
  assert.throws(
    () => normalizePages({ ...minimal, pages: [{ ...minimal.pages[0], testIds: [] }] }),
    /testIds 必须是非空数组/,
  );
});

test("--pages 选择未知 id 时报错而不是静默少截", () => {
  const normalized = normalizePages(minimal);
  assert.deepEqual(
    selectPages(normalized.pages, "a").map((page) => page.id),
    ["a"],
  );
  assert.throws(() => selectPages(normalized.pages, "a,zzz"), /zzz/);
});

test("仓库里的 pages.json 有效且覆盖 M0 首批页面", async () => {
  const loaded = await readPagesFile(pagesPath);
  assert.deepEqual(loaded.themes, ["light", "dark"]);
  assert.deepEqual(
    loaded.viewports.map((viewport) => viewport.width),
    [1360, 820, 390],
  );
  const ids = loaded.pages.map((page) => page.id);
  for (const required of ["chat-single", "workbench", "groups", "plugins"]) {
    assert.ok(ids.includes(required), `缺少页面：${required}`);
  }
  const settingsPages = loaded.pages.filter((page) => page.group === "settings");
  assert.ok(settingsPages.length >= 13, `设置页不足：${settingsPages.length}`);
  for (const page of loaded.pages) {
    assert.ok(page.open.length > 0, `${page.id} 没有打开步骤`);
    assert.ok(page.testIds.length > 0, `${page.id} 没有要比较几何的 testid`);
  }
  // 设置页各自等待自己的分区，避免把上一分区截成下一分区。
  for (const page of settingsPages.filter((entry) => entry.id !== "plugins")) {
    const navClick = page.open.find((step) => step.click?.startsWith("settings-section-nav-"));
    assert.ok(navClick, `${page.id} 缺少设置分区导航点击`);
    const section = navClick.click.replace("settings-section-nav-", "");
    const wait = page.open.find(
      (step) => step.waitForAttribute?.attribute === "data-active-section",
    );
    assert.equal(wait?.waitForAttribute?.value, section, `${page.id} 等待的分区与点击的分区不一致`);
  }
});
