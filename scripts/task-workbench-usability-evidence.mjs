// SPDX-License-Identifier: Apache-2.0
// 工作台新建任务、紧凑顶栏、缩放与窄窗口的真实 GUI 证据（specs/knorvia-workbench-usability-20261008.md）。
import assert from "node:assert/strict";
import { resolve } from "node:path";

const key = "knorvia-task-workbench:v1";

export async function verifyWorkbenchUsability(page, host, evidence) {
  const tiles = page.getByTestId("workbench-tile");
  await page.evaluate((storageKey) => {
    localStorage.removeItem(storageKey);
    window.workbenchFixture.board.setState({ board: null });
    window.workbenchFixture.board.getState().initialize({ workspacePath: "/test/project" });
  }, key);
  const commands = host.commands.length;
  await tiles.first().getByTestId("workbench-kernel").selectOption("codex");
  await tiles.first().getByRole("button", { name: "Open input" }).click();
  await tiles.first().locator('[contenteditable="true"]').first().waitFor();

  // 不用收起任何格子即可新建；已有待命格时再次新建只聚焦它。
  await page.getByTestId("workbench-new-task").click();
  assert.equal(await tiles.count(), 2);
  await tiles.nth(1).getByRole("button", { name: "Open input" }).waitFor();
  await page.getByTestId("workbench-tile-count").filter({ hasText: "2 / 8" }).waitFor();
  await page.getByTestId("workbench-new-task").click();
  assert.equal(await tiles.count(), 2);

  // 在此格新建：原会话进入已收起，原位出现待命格。
  await tiles.first().locator('[contenteditable="true"]').first().fill("draft before renew");
  await tiles.first().getByTestId("workbench-tile-menu").click();
  await page.getByTestId("workbench-renew").click();
  await tiles.first().getByRole("button", { name: "Open input" }).waitFor();
  await page.getByRole("button", { name: "Shelved (1)" }).waitFor();

  // 顶栏单行；浮层不改变画布高度。
  const canvas = page.getByTestId("workbench-canvas");
  const before = await canvas.boundingBox();
  await page.getByTestId("workbench-shelf-toggle").click();
  await page.getByTestId("workbench-shelf").waitFor();
  assert.deepEqual(await canvas.boundingBox(), before);
  await page.keyboard.press("Escape");
  await page.getByTestId("workbench-shelf-toggle").click();

  // 待办并入顶栏：浮层复用原待办视图，与其他浮层互斥，不改变画布高度。
  await page.getByTestId("workbench-attention-toggle").click();
  await page.getByTestId("workbench-toolbar-panel").getByTestId("studio-attention-inbox").waitFor();
  assert.deepEqual(await canvas.boundingBox(), before);
  assert.equal(await page.getByTestId("studio-attention-open").count(), 0, "rail entry removed");
  await page.getByTestId("workbench-attention-toggle").click();

  // 画布缩放：作用于整个画布并随布局持久化。
  await page.getByTestId("workbench-zoom-out").click();
  await page.getByTestId("workbench-zoom-out").click();
  await page.getByTestId("workbench-zoom-reset").filter({ hasText: "80%" }).waitFor();
  assert.equal(await canvas.evaluate((node) => getComputedStyle(node).zoom), "0.8");
  assert.equal(
    await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)).zoom, key),
    0.8,
  );

  // 窄窗口：顶栏不换行撑高，格子标题栏不溢出。
  const wide = page.viewportSize();
  await page.setViewportSize({ width: 820, height: 700 });
  const toolbar = page.getByTestId("workbench-new-task").locator("xpath=..");
  assert.ok((await toolbar.boundingBox()).height <= 40, "toolbar stays one row");
  for (const header of await page.locator('[data-testid="workbench-tile"] header').all())
    assert.equal(
      await header.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
      true,
      "tile header fits",
    );
  await page.screenshot({
    path: resolve(evidence, "workbench-usability-narrow.png"),
  });
  await page.setViewportSize(wide);
  await page.getByTestId("workbench-zoom-reset").click();
  assert.equal(host.commands.length, commands);
  return "attention inbox opens from the toolbar overlay, new task adds or reuses a ready tile without shelving, renew shelves only that tile, toolbar stays one row with overlay panels, zoom persists and narrow headers do not overflow";
}
