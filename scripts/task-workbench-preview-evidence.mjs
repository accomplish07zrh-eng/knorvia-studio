// SPDX-License-Identifier: Apache-2.0
// 工作台每格三态视图的真实 GUI 证据（specs/knorvia-workbench-artifact-preview-20261008.md）。
import assert from "node:assert/strict";

export async function verifyWorkbenchTileViews(host, viewTile) {
  // specs/knorvia-workbench-artifact-preview-20261008.md：三态视图只改显示，不发命令、不卸载聊天。
  const viewCommands = host.commands.length;
  const viewEdit = viewTile.locator('[contenteditable="true"]').first();
  await viewEdit.fill("draft kept across views");
  await viewTile.getByRole("button", { name: "Preview only", exact: true }).click();
  await viewTile.locator('[data-testid="workbench-tile-body"][data-view="preview"]').waitFor();
  await viewTile.getByText("Web previews in tiles need the desktop app").waitFor();
  assert.equal((await viewTile.locator('[contenteditable="true"]').count()) > 0, true);
  assert.equal(await viewEdit.isVisible(), false);
  await viewTile.getByRole("button", { name: "Chat only", exact: true }).click();
  await viewTile.locator('[data-testid="workbench-tile-body"][data-view="chat"]').waitFor();
  assert.equal(await viewEdit.innerText(), "draft kept across views");
  assert.equal(await viewTile.getByTestId("workbench-preview").isVisible(), false);
  // 视图随布局持久化（与布局同一份保存记录）。
  assert.equal(
    await viewTile
      .page()
      .evaluate(() =>
        Object.values(JSON.parse(localStorage.getItem("knorvia-task-workbench:v1")).tiles).some(
          (tile) => tile.view === "chat",
        ),
      ),
    true,
  );
  await viewTile.getByRole("button", { name: "Chat and preview", exact: true }).click();
  await viewTile.locator('[data-testid="workbench-tile-body"][data-view="split"]').waitFor();
  // Web 端不能渲染网页：并排模式不占半格，聊天保持整格。
  assert.equal(await viewTile.getByTestId("workbench-preview").isVisible(), false);
  await viewTile.locator('[contenteditable="true"]').first().fill("");
  assert.equal(host.commands.length, viewCommands);
  return "per-tile chat/preview views persist, keep the chat mounted, never send commands and do not waste half a tile where pages cannot render";
}
