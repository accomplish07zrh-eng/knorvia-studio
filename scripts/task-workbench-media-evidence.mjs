// SPDX-License-Identifier: Apache-2.0
// 外部内核原生媒体在真实 GUI 中呈现（specs/knorvia-kernel-native-media-20261010.md）。
import assert from "node:assert/strict";
import { resolve } from "node:path";

export async function verifyWorkbenchKernelMedia(browser, host, url, evidence) {
  const id = "media-session";
  await host.request("reload-a", "command", [
    {
      type: "create-conversation",
      commandId: "media-create",
      id,
      kernel: "codex",
      workspacePath: "/test/project",
    },
  ]);
  await host.request("reload-a", "command", [
    { type: "send", commandId: "media-send", kind: "chat", targetId: id, text: "media sample" },
  ]);
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${url}?fixture=reload`);
    await page.evaluate((sessionId) => window.workbenchFixture.setChat(sessionId), id);
    await page.getByTestId("add-to-task-workbench").click();
    const media = page.getByTestId("studio-message-media").first();
    await media.waitFor();
    assert.equal(await media.getAttribute("data-media-kind"), "image");
    const image = media.locator("img");
    await image.waitFor();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="studio-message-media"] img')?.naturalWidth > 0,
    );
    await media.getByText("generated.png").waitFor();
    await page.screenshot({ path: resolve(evidence, "kernel-media.png") });
    assert.deepEqual(errors, []);
    return "native kernel media output renders as an image in the external chat timeline of a workbench tile";
  } finally {
    await context.close();
  }
}
