// SPDX-License-Identifier: Apache-2.0
// node --import tsx scripts/task-workbench-smoke.mjs [Chromium path]
// Uses real GUI, command admission and SQLite with an offline kernel. No account/model access.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright-core";
import { knorviaIconsPlugin } from "../packages/ui/vite/knorviaIconsPlugin.ts";
import { workbenchHost } from "./task-workbench-host.mjs";
import * as controlEvidence from "./task-workbench-control-evidence.mjs";
import { verifyWorkbenchReloadOwnership } from "./task-workbench-reload-evidence.mjs";
import { verifyWorkbenchTileViews } from "./task-workbench-preview-evidence.mjs";
import { verifyWorkbenchUsability } from "./task-workbench-usability-evidence.mjs";
import { verifyWorkbenchKernelMedia } from "./task-workbench-media-evidence.mjs";

const root = process.cwd();
const evidence = process.env.KNORVIA_WORKBENCH_EVIDENCE_DIR || "/tmp/knorvia-workbench-evidence";
await mkdir(evidence, { recursive: true });
const host = await workbenchHost();
const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  cacheDir: "/tmp/knorvia-workbench-vite-cache",
  resolve: {
    alias: [
      {
        find: "@knorvia/shared/protocol-v4",
        replacement: resolve(root, "packages/shared/src/protocol-v4/index.ts"),
      },
      { find: /^@knorvia\/shared$/, replacement: resolve(root, "packages/shared/src/index.ts") },
      { find: "@", replacement: resolve(root, "packages/ui/src") },
      { find: "d3-path", replacement: resolve(root, "node_modules/d3-path/src/index.js") },
    ],
  },
  plugins: [
    knorviaIconsPlugin(),
    react(),
    tailwindcss(),
    {
      name: "task-workbench-offline-host",
      configureServer(vite) {
        vite.middlewares.use(async (request, response, next) => {
          if (request.url?.startsWith("/__workbench/")) {
            try {
              let body = "";
              for await (const chunk of request) body += chunk;
              const { method, args } = JSON.parse(body);
              const value = await host.request(
                request.url.slice("/__workbench/".length),
                method,
                args,
              );
              response.setHeader("Content-Type", "application/json");
              response.end(JSON.stringify(value));
            } catch (error) {
              response.statusCode = 400;
              response.end(JSON.stringify({ error: error.message }));
            }
            return;
          }
          if (request.url === "/favicon.ico") {
            response.statusCode = 204;
            response.end();
            return;
          }
          if (request.url?.split("?")[0] !== "/") return next();
          response.setHeader("Content-Type", "text/html");
          response.end(
            await vite.transformIndexHtml(
              "/",
              '<html><body><div id="root"></div><script type="module" src="/packages/ui/test/fixtures/task-workbench-browser.tsx"></script></body></html>',
            ),
          );
        });
      },
    },
  ],
  server: { host: "127.0.0.1", port: 0 },
});
let browser;
const checks = [];
try {
  await server.listen();
  browser = await chromium.launch({
    executablePath: process.argv[2] || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error(error.stack);
  });
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });
  page.setDefaultTimeout(25000);
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page.getByTestId("studio-workbench-open").click();
  let tiles = page.getByTestId("workbench-tile");
  await tiles.first().getByTestId("workbench-kernel").selectOption("codex");
  await tiles.first().getByRole("button", { name: "Split right", exact: true }).click();
  await tiles.nth(1).getByRole("button", { name: "Split down", exact: true }).click();
  assert.equal(await tiles.count(), 3);
  assert.equal(host.commands.length, 0);
  assert.equal(host.turns.length, 0);
  const firstId = await tiles.first().getAttribute("data-tile-id");
  await tiles.first().evaluate((element) => {
    window.originalTileElement = element;
  });
  await tiles.first().getByRole("button", { name: "Maximize tile" }).click();
  await page.getByRole("button", { name: "Restore layout" }).click();
  assert.equal(
    await page.evaluate(
      () => window.originalTileElement === document.querySelector('[data-testid="workbench-tile"]'),
    ),
    true,
  );
  const divider = page.getByRole("separator").first();
  const box = await divider.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 4);
  await page.mouse.down();
  await page.mouse.move(box.x + 110, box.y + box.height / 4, { steps: 8 });
  await page.mouse.up();
  const horizontal = page.locator('[role="separator"][aria-orientation="horizontal"]');
  const horizontalBox = await horizontal.boundingBox();
  await page.mouse.move(
    horizontalBox.x + horizontalBox.width * 0.7,
    horizontalBox.y + horizontalBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(horizontalBox.x + horizontalBox.width * 0.7, horizontalBox.y + 55, {
    steps: 6,
  });
  await page.mouse.up();
  const tree = await page.evaluate(
    () => window.workbenchFixture.board.getState().board.layout.root,
  );
  assert.notEqual(tree.ratio, 0.5);
  checks.push(
    "zero-task layout, stable DOM, horizontal/vertical splits, pointer resize and maximize/restore",
  );
  await page.screenshot({ path: resolve(evidence, "empty-layout.png") });
  await page.reload();
  await page.getByTestId("studio-workbench-open").click();
  assert.equal(await tiles.count(), 3);
  assert.equal(await tiles.first().getAttribute("data-tile-id"), firstId);
  assert.deepEqual(
    await page.evaluate(() => window.workbenchFixture.board.getState().board.layout.root),
    tree,
  );
  assert.equal(host.commands.length, 0);
  checks.push("layout and configured kernel persist without sending a task");
  // Exercise actual external GUI twice with the same kernel and separate session IDs.
  await tiles.first().getByRole("button", { name: "Open input" }).click();
  await tiles.nth(1).getByRole("button", { name: "Open input" }).click();
  const editA = tiles.first().locator('[contenteditable="true"]').first();
  const editB = tiles.nth(1).locator('[contenteditable="true"]').first();
  await editA.fill("task alpha");
  await editB.fill("task beta");
  await tiles.first().getByRole("button", { name: "Maximize tile" }).click();
  await page.getByRole("button", { name: "Restore layout" }).click();
  assert.equal(await editA.innerText(), "task alpha");
  assert.equal(await editB.innerText(), "task beta");
  await page.getByTestId("studio-chats-open").click();
  await page.getByTestId("studio-workbench-open").click();
  assert.equal(await editA.innerText(), "task alpha");
  assert.equal(await editB.innerText(), "task beta");
  await tiles.first().getByRole("button", { name: "Send", exact: true }).click();
  await tiles.nth(1).getByRole("button", { name: "Send", exact: true }).click();
  await tiles.first().getByRole("region", { name: "Approve task alpha" }).waitFor();
  await tiles.nth(1).getByRole("region", { name: "Approve task beta" }).waitFor();
  assert.equal(host.turns.length, 2);
  assert.notEqual(host.turns[0].conversationId, host.turns[1].conversationId);
  const controlTargets = await controlEvidence.captureWorkbenchControlTargets(host);
  await tiles
    .first()
    .getByRole("button", { name: /Allow once/, exact: false })
    .click();
  await tiles.first().getByText("Finished task alpha", { exact: false }).first().waitFor();
  await tiles.nth(1).getByRole("button", { name: "Stop", exact: true }).click();
  await page.waitForFunction(
    () => ![...document.querySelectorAll('button[aria-label="Stop"]')].length,
  );
  assert.equal(await tiles.count(), 3);
  assert.equal(host.commands.filter((command) => command.type === "answer").length, 1);
  assert.equal(host.commands.filter((command) => command.type === "cancel").length, 1);
  await controlEvidence.assertWorkbenchControlTargets(host, controlTargets);
  checks.push(
    "real GUI inputs target separate original-Host interactions and runs; approval succeeds only its cell and Stop preserves existing interrupted/unknown-result semantics",
  );
  await page.screenshot({ path: resolve(evidence, "gui-tasks.png") });
  checks.push(await verifyWorkbenchTileViews(host, tiles.nth(1)));
  const sends = host.commands.filter((command) => command.type === "send").length;
  await page.getByTestId("studio-chats-open").click();
  await page.getByTestId("add-to-task-workbench").click();
  assert.equal(await tiles.count(), 3);
  await page.getByTestId("studio-chats-open").click();
  await page.getByTestId("add-to-task-workbench").click();
  assert.equal(await tiles.count(), 3);
  assert.equal(host.commands.filter((command) => command.type === "send").length, sends);
  checks.push(
    "adding an existing conversation twice focuses one binding without create/send/resume",
  );
  const savedTile = page.locator('[data-testid="workbench-tile"]:visible');
  await savedTile.locator('[contenteditable="true"]').first().fill("late Host A request");
  const beforeLate = await page.evaluate(() =>
    JSON.stringify(window.workbenchFixture.board.getState().board),
  );
  await page.evaluate(() => {
    window.workbenchFixture.fixture.held = true;
  });
  await savedTile.getByRole("button", { name: "Send", exact: true }).click();
  await page.waitForFunction(() => window.workbenchFixture.fixture.release !== null);
  await page.evaluate(() => window.workbenchFixture.setHost("b"));
  await page
    .locator('[data-testid="workbench-tile"]:visible')
    .getByText(/connection changed and this tile was not rebound/)
    .first()
    .waitFor();
  assert.equal(host.commands.filter((command) => command.host === "b").length, 0);
  await page.evaluate(() => {
    window.workbenchFixture.fixture.held = false;
    window.workbenchFixture.fixture.release();
  });
  await page.waitForFunction(() => window.workbenchFixture.fixture.delivered === 1);
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[role="status"]')].some((element) =>
      element.textContent.includes("connection changed and this tile was not rebound"),
    ),
  );
  assert.equal(
    await page.evaluate(() => JSON.stringify(window.workbenchFixture.board.getState().board)),
    beforeLate,
  );
  assert.equal(host.commands.filter((command) => command.host === "b").length, 0);
  checks.push(
    "Host replacement and late source ACK fail closed with an identical session ID, without automatic replay",
  );
  // Follow-up: ten active runs (including questions and approvals) cannot be hidden by the eight-tile capacity.
  await page.evaluate(() => {
    localStorage.removeItem("knorvia-task-workbench:v1");
    window.workbenchFixture.board.setState({ board: null });
    window.workbenchFixture.board.getState().initialize({ workspacePath: "/test/project" });
  });
  await tiles.first().getByTestId("workbench-kernel").selectOption("codex");
  await tiles.first().getByRole("button", { name: "Open input" }).click();
  await tiles.first().locator('[contenteditable="true"]').first().fill("keep this unsent draft");
  const draftTileId = await tiles.first().getAttribute("data-tile-id");
  for (let i = 0; i < 10; i++) {
    await host.request("b", "command", [
      {
        commandId: `collect-create-${i}`,
        type: "create-conversation",
        id: `active-${i}`,
        kernel: "codex",
        workspacePath: "/test/project",
        title: `Active ${i}`,
      },
    ]);
    await host.request("b", "command", [
      {
        commandId: `collect-send-${i}`,
        type: "send",
        kind: "chat",
        targetId: `active-${i}`,
        text: i === 0 ? "question choice" : `active task ${i}`,
      },
    ]);
  }
  const beforeCollect = host.commands.length;
  await page.getByRole("button", { name: /^Task list/ }).click();
  await page.getByTestId("workbench-active-count").filter({ hasText: "10 active" }).waitFor();
  await page.getByTestId("workbench-collect").click();
  assert.equal(await tiles.count(), 8);
  await page
    .getByTestId("workbench-active-count")
    .filter({ hasText: "10 active · 7 in tiles · 3 not included" })
    .waitFor();
  assert.equal(await page.getByTestId("workbench-active-row").count(), 10);
  await page
    .getByTestId("workbench-active-list")
    .getByText(/Waiting for input/)
    .first()
    .waitFor();
  await page
    .getByTestId("workbench-active-list")
    .getByText(/Waiting for approval/)
    .first()
    .waitFor();
  assert.equal(await tiles.first().getAttribute("data-tile-id"), draftTileId);
  assert.equal(
    await tiles.first().locator('[contenteditable="true"]').first().innerText(),
    "keep this unsent draft",
  );
  // 任务列表是覆盖在格子上方的浮层：先收起再聚焦格子，然后重新打开列表。
  await page.getByRole("button", { name: /^Task list/ }).click();
  await tiles
    .first()
    .locator("header")
    .click({ position: { x: 50, y: 20 } });
  await page.getByRole("button", { name: /^Task list/ }).click();
  const fullTree = await page.evaluate(
    () => window.workbenchFixture.board.getState().board.layout.root,
  );
  // 聚焦格有未发送输入时不会被换下（specs/knorvia-workbench-conversations-20261010.md）。
  const lastActive = page
    .getByTestId("workbench-active-row")
    .last()
    .getByRole("button", { name: "Add / switch current tile" });
  await lastActive.click();
  await page
    .getByText(/has an unsent input and was not replaced/)
    .first()
    .waitFor();
  assert.equal(await tiles.first().getAttribute("data-tile-id"), draftTileId);
  // 聚焦另一格后再切换：被换下的格子只离开工作台，布局不变。
  await page.getByRole("button", { name: /^Task list/ }).click();
  const swapped = await tiles.nth(1).getAttribute("data-tile-id");
  await tiles
    .nth(1)
    .locator("header")
    .click({ position: { x: 50, y: 20 } });
  await page.getByRole("button", { name: /^Task list/ }).click();
  await lastActive.click();
  assert.deepEqual(
    await page.evaluate(() => window.workbenchFixture.board.getState().board.layout.root),
    fullTree,
  );
  assert.equal(await page.locator(`[data-tile-id="${swapped}"]`).count(), 0);
  assert.equal(await page.getByTestId("workbench-shelf-toggle").count(), 0, "no shelf");
  // 移出工作台：格子消失，会话仍可从「添加对话」重新放回。
  await tiles.nth(2).getByTestId("workbench-remove-tile").click();
  assert.equal(await tiles.count(), 7);
  await page.getByTestId("workbench-add-conversations").click();
  const picker = page.getByTestId("workbench-conversation-picker");
  await picker.waitFor();
  const rows = picker.getByTestId("workbench-conversation-row");
  assert.ok((await rows.count()) >= 8, "picker lists accepted conversations");
  assert.ok(
    (await picker.getByText("In workbench").count()) >= 6,
    "tiles already shown are marked",
  );
  const free = picker.locator('button[role="checkbox"]:not([disabled])');
  await free.first().click();
  await page.screenshot({ path: resolve(evidence, "add-conversations.png") });
  await picker.getByTestId("workbench-conversation-add").click();
  await picker.waitFor({ state: "detached" });
  assert.equal(await tiles.count(), 8);
  const recovered = page.locator(`[data-tile-id="${draftTileId}"]`);
  assert.equal(host.commands.length, beforeCollect, "collect, swap, remove and add are view-only");
  await page.reload();
  // 重新打开直接恢复上次布局：未发送输入原样可编辑，无需逐格重新核对。
  await page.evaluate(() => window.workbenchFixture.setHost("b"));
  await page.getByTestId("studio-workbench-open").click();
  assert.equal(await tiles.count(), 8);
  assert.equal(
    await recovered.locator('[contenteditable="true"]').first().innerText(),
    "keep this unsent draft",
  );
  assert.equal(host.commands.length, beforeCollect);
  checks.push(
    "one-click collection includes all ten active tasks and both waiting states; swap keeps unsent input; remove and add-conversations are view-only; reload restores the layout and unsent draft directly",
  );
  await page.getByTestId("workbench-collect").click();
  await page.screenshot({ path: resolve(evidence, "active-tasks-overflow.png") });
  checks.push(await controlEvidence.verifyWorkbenchNativeDraftOwner(page));
  checks.push(await verifyWorkbenchReloadOwnership(browser, host, page.url(), evidence));
  checks.push(await verifyWorkbenchUsability(page, host, evidence));
  checks.push(await verifyWorkbenchKernelMedia(browser, host, page.url().split("?")[0], evidence));
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(evidence, "result.json"),
    JSON.stringify(
      {
        checks,
        turns: host.turns.length,
        commands: host.commands.map(({ host, type, targetId, runId, interactionId }) => ({
          host,
          type,
          targetId,
          runId,
          interactionId,
        })),
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: checks, evidence }));
} catch (error) {
  if (browser)
    for (const context of browser.contexts())
      for (const page of context.pages()) {
        await page.screenshot({ path: resolve(evidence, "failure.png") }).catch(() => {});
        await writeFile(resolve(evidence, "failure.html"), await page.content());
      }
  throw error;
} finally {
  await browser?.close();
  await server.close();
  await host.close();
}
