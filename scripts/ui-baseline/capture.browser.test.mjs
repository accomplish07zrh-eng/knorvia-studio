// SPDX-License-Identifier: Apache-2.0
// M0-11：同一提交连续抓两次必须零差异——这条要求只能对真实浏览器跑，故与纯函数测试分开。
// 该文件依赖本机已预装的 Chromium，不列入 pnpm test:studio；用法见 scripts/ui-baseline/README.md。
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assertPages, capture } from "./capture.mjs";
import { compareCaptureTrees, readCaptureTree } from "./compare.mjs";

const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; font-family: system-ui, sans-serif; }
  #panel { position: absolute; left: 24px; top: 32px; width: 240px; height: 120px; }
  body { background: #ffffff; color: #111111; }
  html.knorvia-dark body { background: #111111; color: #f5f5f5; }
</style></head>
<body>
  <div id="panel" data-testid="fixture-panel">fixture panel</div>
  <div data-testid="fixture-footer">footer</div>
</body></html>`;

async function withServer(t) {
  const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(HTML);
  });
  await new Promise((accept) => server.listen(0, "127.0.0.1", accept));
  const { port } = server.address();
  t.after(() => server.close());
  return `http://127.0.0.1:${port}`;
}

const pages = assertPages({
  schemaVersion: 1,
  pages: [
    {
      id: "fixture",
      route: "/",
      readyTestId: "fixture-panel",
      testids: ["fixture-panel", "fixture-footer"],
      steps: [],
      storage: {},
    },
  ],
});

test("capturing the same page twice is pixel and geometry identical", async (t) => {
  const baseUrl = await withServer(t);
  const root = await mkdtemp(join(tmpdir(), "knorvia-ui-baseline-browser-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const first = join(root, "first");
  const second = join(root, "second");
  const options = {
    baseUrl,
    pages,
    themes: ["light", "dark"],
    widths: [820, 390],
    height: 600,
    commit: "0".repeat(40),
  };
  const firstRun = await capture({ out: first, ...options });
  assert.equal(firstRun.failures.length, 0);
  assert.equal(firstRun.manifest.pages.length, 4);
  await capture({ out: second, ...options });

  const report = await compareCaptureTrees({
    baseline: await readCaptureTree(first),
    current: await readCaptureTree(second),
    options: { maxPixelRatio: 0, geometryTolerance: 0 },
  });
  assert.equal(
    report.summary.failed,
    0,
    JSON.stringify(report.pages.filter((page) => !page.passed)),
  );
  assert.equal(report.summary.pages, 4);

  // 两次抓取的 PNG 必须逐字节相同，这是零差异结论的强形式。
  for (const entry of firstRun.manifest.pages) {
    const left = await readFile(join(first, ...entry.png.split("/")));
    const right = await readFile(join(second, ...entry.png.split("/")));
    assert.deepEqual(left, right, entry.png);
    assert.equal(entry.sha256.length, 64);
  }
  const geometry = JSON.parse(
    await readFile(join(first, "pages", "fixture", "dark-820.geometry.json"), "utf8"),
  );
  assert.equal(geometry["fixture-panel"].x, 24);
  assert.equal(geometry["fixture-panel"].height, 120);
});

test("capture fails loudly when a declared test id is missing", async (t) => {
  const baseUrl = await withServer(t);
  const root = await mkdtemp(join(tmpdir(), "knorvia-ui-baseline-missing-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const broken = assertPages({
    schemaVersion: 1,
    pages: [
      {
        id: "fixture",
        route: "/",
        readyTestId: "fixture-panel",
        testids: ["fixture-panel", "does-not-exist"],
        steps: [],
        storage: {},
      },
    ],
  });
  const result = await capture({
    out: join(root, "out"),
    baseUrl,
    pages: broken,
    themes: ["light"],
    widths: [820],
    height: 600,
    commit: "0".repeat(40),
  });
  assert.equal(result.failures.length, 1);
  assert.deepEqual(result.failures[0].missing, ["does-not-exist"]);
});
