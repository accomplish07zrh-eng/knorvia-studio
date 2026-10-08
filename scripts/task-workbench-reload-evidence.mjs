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
    await page.evaluate(() => window.workbenchFixture.setHost("b"));
    await page.getByText(/Host is unavailable or changed/).waitFor();
    await page.reload();
    await page.getByTestId("studio-workbench-open").click();
    await page.waitForFunction(
      () =>
        document.body.textContent.includes("Host is unavailable or changed") ||
        document.body.textContent.includes("Working on FOREIGN HOST B TASK"),
    );
    assert.equal(
      await page.getByText("Working on FOREIGN HOST B TASK", { exact: true }).count(),
      0,
    );
    await page.getByText(/Verify the original connection after reload/).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Open saved input in this project" }).count(),
      0,
    );
    const restored = await page.evaluate(() =>
      JSON.parse(JSON.stringify(window.workbenchFixture.board.getState().board)),
    );
    const prior = JSON.parse(original);
    assert.deepEqual(restored.layout, prior.layout);
    assert.deepEqual(restored.shelved, prior.shelved);
    assert.equal(restored.maximized, prior.maximized);
    for (const [pane, tile] of Object.entries(prior.tiles))
      assert.deepEqual(restored.tiles[pane], { ...tile, configured: tile.configured !== false });
    assert.equal(host.commands.length, before);
    await page.screenshot({ path: resolve(evidence, "reload-owner-unverified.png") });
    await page.getByTestId("studio-chats-open").click();
    await page.getByTestId("add-to-task-workbench").click();
    await page.getByText("Working on FOREIGN HOST B TASK", { exact: true }).waitFor();
    const rebound = await page.evaluate(() => window.workbenchFixture.board.getState().board);
    assert.equal(rebound.tiles["workspace-main"].id, prior.tiles["workspace-main"].id);
    assert.deepEqual(rebound.layout.root, prior.layout.root);
    assert.equal(host.commands.length, before);
    await page.evaluate(() => window.workbenchFixture.setHost("a"));
    await page.getByText(/Host is unavailable or changed/).waitFor();
    await page.getByTestId("studio-chats-open").click();
    await page.getByTestId("add-to-task-workbench").click();
    await page.getByText("Working on ORIGINAL HOST A TASK", { exact: true }).waitFor();
    await page.reload();
    await page.getByTestId("studio-workbench-open").click();
    await page.getByText(/Verify the original connection after reload/).waitFor();
    assert.equal(
      await page.getByText("Working on ORIGINAL HOST A TASK", { exact: true }).count(),
      0,
    );
    await page.getByTestId("studio-chats-open").click();
    await page.getByTestId("add-to-task-workbench").click();
    await page.getByText("Working on ORIGINAL HOST A TASK", { exact: true }).waitFor();
    assert.equal(host.commands.length, before);
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
    return "real reload cannot adopt another Host's identical session/project; explicit Chats rejoin preserves the original tile and issues no commands";
  } finally {
    await context.close();
  }
}
