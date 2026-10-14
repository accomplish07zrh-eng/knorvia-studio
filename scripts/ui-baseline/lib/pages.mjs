// SPDX-License-Identifier: Apache-2.0
// pages.json 的读取与校验：每项写路由或打开步骤、所需夹具、要比较几何的 data-testid。
// 校验独立于浏览器，方便用 node:test 直接覆盖格式错误。
import { readFile } from "node:fs/promises";

const PAGES_SCHEMA = 1;

const STEP_KEYS = ["click", "clickRole", "waitFor", "waitForAttribute", "press"];
const OPEN_WIDTHS = ["target", "wide"];
const PAGE_KEYS = new Set([
  "id",
  "group",
  "title",
  "description",
  "route",
  "fixture",
  "openWidth",
  "open",
  "testIds",
  "wideOnlyTestIds",
]);

function fail(message) {
  throw new Error(`pages.json 无效：${message}`);
}

function assertString(value, where) {
  if (typeof value !== "string" || value.length === 0) fail(`${where} 必须是非空字符串`);
}

function normalizeStep(step, where) {
  if (step === null || typeof step !== "object" || Array.isArray(step)) {
    fail(`${where} 必须是对象`);
  }
  const keys = Object.keys(step);
  if (keys.length !== 1 || !STEP_KEYS.includes(keys[0])) {
    fail(`${where} 必须恰好使用一种步骤：${STEP_KEYS.join(" / ")}`);
  }
  const [kind] = keys;
  const value = step[kind];
  if (kind === "click" || kind === "waitFor") {
    assertString(value, `${where}.${kind}`);
    return { [kind]: value };
  }
  if (kind === "press") {
    assertString(value, `${where}.press`);
    return { press: value };
  }
  if (kind === "clickRole") {
    if (value === null || typeof value !== "object") fail(`${where}.clickRole 必须是对象`);
    assertString(value.role, `${where}.clickRole.role`);
    if (value.name !== undefined) assertString(value.name, `${where}.clickRole.name`);
    if (value.exact !== undefined && typeof value.exact !== "boolean") {
      fail(`${where}.clickRole.exact 必须是布尔值`);
    }
    return { clickRole: { ...value } };
  }
  if (value === null || typeof value !== "object") fail(`${where}.waitForAttribute 必须是对象`);
  assertString(value.testId, `${where}.waitForAttribute.testId`);
  assertString(value.attribute, `${where}.waitForAttribute.attribute`);
  assertString(value.value, `${where}.waitForAttribute.value`);
  return { waitForAttribute: { ...value } };
}

function normalizeViewport(viewport, where) {
  if (viewport === null || typeof viewport !== "object") fail(`${where} 必须是对象`);
  for (const key of ["width", "height"]) {
    if (!Number.isInteger(viewport[key]) || viewport[key] <= 0) {
      fail(`${where}.${key} 必须是正整数`);
    }
  }
  return { width: viewport.width, height: viewport.height };
}

/** 校验并补全 pages.json。返回 `{ schema, themes, viewports, pages }`。 */
export function normalizePages(raw, source = "pages.json") {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw))
    fail(`${source} 顶层必须是对象`);
  if (raw.schema !== PAGES_SCHEMA) {
    fail(`${source}.schema 必须是 ${PAGES_SCHEMA}，实际为 ${JSON.stringify(raw.schema)}`);
  }
  if (!Array.isArray(raw.themes) || raw.themes.length === 0)
    fail(`${source}.themes 必须是非空数组`);
  for (const theme of raw.themes) {
    if (theme !== "light" && theme !== "dark") fail(`${source}.themes 只支持 light / dark`);
  }
  if (!Array.isArray(raw.viewports) || raw.viewports.length === 0) {
    fail(`${source}.viewports 必须是非空数组`);
  }
  const viewports = raw.viewports.map((viewport, index) =>
    normalizeViewport(viewport, `${source}.viewports[${index}]`),
  );
  if (!Array.isArray(raw.pages) || raw.pages.length === 0) fail(`${source}.pages 必须是非空数组`);
  const seen = new Set();
  const pages = raw.pages.map((page, index) => {
    const where = `${source}.pages[${index}]`;
    if (page === null || typeof page !== "object" || Array.isArray(page))
      fail(`${where} 必须是对象`);
    for (const key of Object.keys(page)) {
      if (!PAGE_KEYS.has(key)) fail(`${where} 含未知字段 ${key}`);
    }
    assertString(page.id, `${where}.id`);
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(page.id)) {
      fail(`${where}.id 只能用小写字母、数字与连字符（用作目录名）：${page.id}`);
    }
    if (seen.has(page.id)) fail(`${where}.id 重复：${page.id}`);
    seen.add(page.id);
    assertString(page.group, `${where}.group`);
    assertString(page.title, `${where}.title`);
    if (page.description !== undefined) assertString(page.description, `${where}.description`);
    if (page.route !== undefined) assertString(page.route, `${where}.route`);
    if (page.fixture !== undefined) assertString(page.fixture, `${where}.fixture`);
    if (page.openWidth !== undefined && !OPEN_WIDTHS.includes(page.openWidth)) {
      fail(`${where}.openWidth 只支持 ${OPEN_WIDTHS.join(" / ")}`);
    }
    if (!Array.isArray(page.open)) fail(`${where}.open 必须是数组`);
    const open = page.open.map((step, stepIndex) =>
      normalizeStep(step, `${where}.open[${stepIndex}]`),
    );
    if (!Array.isArray(page.testIds) || page.testIds.length === 0) {
      fail(`${where}.testIds 必须是非空数组`);
    }
    for (const [testIndex, testId] of page.testIds.entries()) {
      assertString(testId, `${where}.testIds[${testIndex}]`);
    }
    const wideOnlyTestIds = page.wideOnlyTestIds ?? [];
    if (!Array.isArray(wideOnlyTestIds)) fail(`${where}.wideOnlyTestIds 必须是数组`);
    for (const [testIndex, testId] of wideOnlyTestIds.entries()) {
      assertString(testId, `${where}.wideOnlyTestIds[${testIndex}]`);
      if (!page.testIds.includes(testId)) {
        fail(`${where}.wideOnlyTestIds 里的 ${testId} 必须同时出现在 testIds`);
      }
    }
    return {
      id: page.id,
      group: page.group,
      title: page.title,
      description: page.description ?? "",
      route: page.route ?? "/",
      fixture: page.fixture ?? "default",
      openWidth: page.openWidth ?? "target",
      open,
      testIds: [...page.testIds],
      wideOnlyTestIds: [...wideOnlyTestIds],
    };
  });
  return { schema: PAGES_SCHEMA, themes: [...raw.themes], viewports, pages };
}

export async function readPagesFile(path) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`读取 ${path} 失败：${error.message}`);
  }
  return normalizePages(JSON.parse(text), path);
}

/** `--pages` 过滤：逗号分隔的 id 列表，未知 id 直接报错而不是静默少截。 */
export function selectPages(pages, selection) {
  if (!selection) return pages;
  const wanted = selection
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (wanted.length === 0) return pages;
  const byId = new Map(pages.map((page) => [page.id, page]));
  const missing = wanted.filter((id) => !byId.has(id));
  if (missing.length > 0) throw new Error(`--pages 含未知页面：${missing.join(", ")}`);
  return wanted.map((id) => byId.get(id));
}
