// Real GUI/SQLite regression; fixture selection is the only state preserved across reload.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function verifyWorkbenchReloadOwnership(browser, host, url, evidence) {
  const id = "reload-owner-shared-session";
  for (const source of ["a", "b"]) {
    await host.request(`reload-${source}`, "command", [
      {
        type: "create-conversation",
        commandId: `reload-create-${source}`,
        id,
        kernel: "codex",
        workspacePath: "/test/project",
      },
    ]);
    await host.request(`reload-${source}`, "command", [
      {
        type: "send",
        commandId: `reload-send-${source}`,
        kind: "chat",
        targetId: id,
        text: source === "a" ? "ORIGINAL HOST A TASK" : "FOREIGN HOST B TASK",
      },
    ]);
  }
  const context = await browser.newContext({ viewport: { width: 1200, height: 1000 } });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${url}?fixture=reload`);
    await page.evaluate((sessionId) => window.workbenchFixture.setChat(sessionId), id);
    await page.getByTestId("add-to-task-workbench").click();
    await page.getByText("Working on ORIGINAL HOST A TASK", { exact: true }).waitFor();
    const original = await page.evaluate(() =>
      JSON.stringify(window.workbenchFixture.board.getState().board),
    );
    const before = host.commands.length;
    // 同一窗口内 Host 换代：旧格不借同 ID 重绑新 Host（specs/knorvia-workbench-conversations-20261010.md）。
    await page.evaluate(() => window.workbenchFixture.setHost("b"));
    await page.getByText(/connection changed and this tile was not rebound/).waitFor();
    assert.equal(
      await page.getByText("Working on FOREIGN HOST B TASK", { exact: true }).count(),
      0,
    );
    // 重新打开：直接恢复上次布局并显示原会话，无需逐格重新加入，也不发送命令。
    await page.evaluate(() => window.workbenchFixture.setHost("a"));
    await page.reload();
    await page.getByTestId("studio-workbench-open").click();
    await page.getByText("Working on ORIGINAL HOST A TASK", { exact: true }).waitFor();
    const restored = await page.evaluate(() =>
      JSON.parse(JSON.stringify(window.workbenchFixture.board.getState().board)),
    );
    const prior = JSON.parse(original);
    assert.deepEqual(restored.layout, prior.layout);
    assert.equal(restored.maximized, prior.maximized);
    for (const [pane, tile] of Object.entries(prior.tiles))
      assert.deepEqual(restored.tiles[pane], { ...tile, configured: tile.configured !== false });
    assert.equal(host.commands.length, before);
    await page.screenshot({ path: resolve(evidence, "reload-restored.png") });
    const rebound = restored;
    assert.deepEqual(errors, []);
    await writeFile(
      resolve(evidence, "reload-owner.json"),
      JSON.stringify(
        {
          original: prior,
          rebound,
          commandsBefore: before,
          commandsAfter: host.commands.length,
          errors,
        },
        null,
        2,
      ),
    );
    return "a window-local Host change never rebinds a tile; reopening restores the saved layout and original conversation directly without commands";
  } finally {
    await context.close();
  }
}
