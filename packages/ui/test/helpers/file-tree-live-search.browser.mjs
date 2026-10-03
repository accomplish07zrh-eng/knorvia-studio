// SPDX-License-Identifier: Apache-2.0
// Chromium/real-Host regression scenario; the caller supplies an isolated synthetic project.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

export async function runFileTreeLiveSearchBrowserAcceptance({ page, workspacePath, outputDir }) {
  assert(isAbsolute(workspacePath));
  const workspace = await realpath(workspacePath);
  // 只允许本轮合成夹具；不在调用者的真实项目中生成或删除文件。
  assert.match(await readFile(join(workspace, "README.md"), "utf8"), /No real user data\./u);
  const prefix = `ui-live-search-${randomUUID()}`;
  const created = join(workspace, `${prefix}-created.txt`);
  const renamed = join(workspace, `${prefix}-renamed.txt`);
  const body = "Synthetic live search preview — 中文";
  const ownedFiles = new Set();
  const result = { workspacePath, create: false, preview: false, rename: false, delete: false };
  try {
    await page.getByTestId("studio-rail-kernel-knorvia").click();
    await page.getByTestId(`workspace-item-${workspacePath}`).hover();
    await page.getByTestId(`workspace-file-tree-button-${workspacePath}`).click();
    const tree = page.getByTestId("workspace-file-tree-panel");
    await tree.waitFor();
    await tree.getByRole("textbox").fill(prefix);
    await tree.getByText("No matching files.", { exact: true }).waitFor();
    // 等候真实 watch 安装：读取初始索引后至少完成一帧，不通过手工 refresh 掩盖缓存。
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    await writeFile(created, `${body}\n`, { flag: "wx" });
    ownedFiles.add(created);
    const originalRow = tree.getByTestId(`workspace-file-tree-row-${created}`);
    await originalRow.waitFor({ timeout: 12000 });
    result.create = true;
    await originalRow.click();
    const preview = page.getByTestId("preview-pane").getByText(body, { exact: false });
    await preview.waitFor();
    assert((await preview.innerText()).includes(body));
    result.preview = true;
    if (outputDir)
      await page.screenshot({ path: join(outputDir, "file-tree-live-search-created.png") });
    await rename(created, renamed);
    ownedFiles.delete(created);
    ownedFiles.add(renamed);
    await tree.getByTestId(`workspace-file-tree-row-${renamed}`).waitFor({ timeout: 12000 });
    assert.equal(await originalRow.count(), 0);
    result.rename = true;
    await unlink(renamed);
    ownedFiles.delete(renamed);
    await tree.getByText("No matching files.", { exact: true }).waitFor({ timeout: 12000 });
    assert.equal(await tree.locator('[data-testid^="workspace-file-tree-row-"]').count(), 0);
    result.delete = true;
    return result;
  } finally {
    for (const path of ownedFiles) {
      await unlink(path).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }
}
