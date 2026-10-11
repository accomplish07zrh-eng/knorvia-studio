// SPDX-License-Identifier: Apache-2.0
// M0-11：页面清单与抓取参数的确定性约束先用纯函数测试锁住，浏览器部分另见 capture.browser.test.mjs。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import {
  assertPages,
  captureRelativePath,
  determinismScript,
  FIXED_CLOCK,
  geometryRelativePath,
  launchArguments,
  resolveExecutablePath,
} from "./capture.mjs";

const PAGE = {
  id: "main",
  route: "/",
  readyTestId: "chat-input",
  testids: ["chat-input"],
  steps: [],
  storage: {},
};

test("the shipped page list covers the M0 pages and validates", async () => {
  const raw = JSON.parse(await readFile(join(import.meta.dirname, "pages.json"), "utf8"));
  const pages = assertPages(raw);
  assert.deepEqual(
    pages.pages.map((page) => page.id),
    ["main", "chat-single", "chat-group", "workbench", "settings-plugins"],
  );
  for (const page of pages.pages) {
    assert.ok(page.testids.includes(page.readyTestId));
  }
});

test("assertPages rejects duplicate ids, bad routes and unknown fixtures", () => {
  assert.throws(() => assertPages({ schemaVersion: 1, pages: [PAGE, PAGE] }), /Duplicate page id/);
  assert.throws(
    () => assertPages({ schemaVersion: 1, pages: [{ ...PAGE, route: "main" }] }),
    /route starting with/,
  );
  assert.throws(
    () => assertPages({ schemaVersion: 1, pages: [{ ...PAGE, readyTestId: "missing" }] }),
    /readyTestId in testids/,
  );
  assert.throws(
    () => assertPages({ schemaVersion: 1, pages: [{ ...PAGE, fixtures: ["nope"] }] }),
    /unknown fixture/,
  );
  assert.throws(() => assertPages({ schemaVersion: 1, pages: [] }), /at least one page/);
  assert.throws(() => assertPages({ schemaVersion: 2, pages: [PAGE] }), /schemaVersion 1/);
});

test("assertPages rejects malformed steps and storage", () => {
  const withSteps = (steps) => ({ schemaVersion: 1, pages: [{ ...PAGE, steps }] });
  assert.throws(() => assertPages(withSteps([{ click: "" }])), /non-empty string/);
  assert.throws(() => assertPages(withSteps([{ click: "a", waitFor: "b" }])), /exactly one action/);
  assert.throws(
    () => assertPages(withSteps([{ fill: { testid: "a" } }])),
    /needs \{ testid, value \}/,
  );
  assert.throws(
    () => assertPages({ schemaVersion: 1, pages: [{ ...PAGE, storage: { key: 1 } }] }),
    /must be strings/,
  );
});

test("fixtures contribute steps and storage in declared order", () => {
  const pages = assertPages({
    schemaVersion: 1,
    fixtures: { seed: { steps: [{ click: "seed-open" }], storage: { "knorvia-seed": "1" } } },
    pages: [
      {
        ...PAGE,
        fixtures: ["seed"],
        steps: [{ click: "page-open" }],
        storage: { "knorvia-page": "2" },
      },
    ],
  });
  assert.deepEqual(pages.pages[0].steps, [{ click: "seed-open" }, { click: "page-open" }]);
  assert.deepEqual(pages.pages[0].storage, { "knorvia-seed": "1", "knorvia-page": "2" });
});

test("capture paths are stable and grouped per page", () => {
  const entry = { id: "chat-group", theme: "dark", width: 820 };
  assert.equal(captureRelativePath(entry), "pages/chat-group/dark-820.png");
  assert.equal(geometryRelativePath(entry), "pages/chat-group/dark-820.geometry.json");
});

test("the determinism script pins the clock, seeds storage and disables animation", () => {
  const script = determinismScript({ "knorvia-appearance": "dark" }, "dark");
  assert.match(script, new RegExp(`Date\\.parse\\("${FIXED_CLOCK}"\\)`));
  assert.match(script, /knorvia-appearance/);
  assert.match(script, /animation:none!important/);
  assert.match(script, /classList\.toggle\("knorvia-dark", true\)/);
  assert.match(determinismScript({}, "light"), /classList\.toggle\("knorvia-dark", false\)/);
  assert.equal(new Date(FIXED_CLOCK).toISOString(), FIXED_CLOCK);
});

test("the executable path honours the environment override", () => {
  assert.equal(
    resolveExecutablePath({ KNORVIA_UI_BASELINE_CHROMIUM: "/opt/chromium" }),
    "/opt/chromium",
  );
  assert.equal(resolveExecutablePath({ CHROMIUM_PATH: "/usr/bin/chromium" }), "/usr/bin/chromium");
  assert.match(resolveExecutablePath({}), /chrom|chrome/i);
});

test("launch arguments keep rendering deterministic", () => {
  const args = launchArguments();
  for (const flag of [
    "--force-color-profile=srgb",
    "--font-render-hinting=none",
    "--hide-scrollbars",
  ]) {
    assert.ok(args.includes(flag), `missing ${flag}`);
  }
});
