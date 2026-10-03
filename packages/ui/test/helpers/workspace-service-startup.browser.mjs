// SPDX-License-Identifier: Apache-2.0
// Actual WebRoot/Host startup regression; no component, service or hook substitutes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

export async function runWorkspaceServiceStartupBrowserAcceptance({ page, url, workspacePaths }) {
  assert(["127.0.0.1", "localhost"].includes(new URL(url).hostname));
  for (const path of workspacePaths)
    assert.match(await readFile(join(path, "README.md"), "utf8"), /No real user data\./u);
  const messages = [],
    errors = [];
  const onConsole = (message) => {
    if (["error", "warning"].includes(message.type()))
      messages.push({ type: message.type(), text: message.text() });
  };
  const onPageError = (error) => errors.push(error.message);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  const captures = [];
  const hydrated = async () => {
    await page.getByTestId("studio-activity-rail").waitFor({ timeout: 45000 });
    await page.getByTestId("studio-rail-kernel-knorvia").click();
    await page.getByTestId("composer-workspace-trigger").waitFor();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  };
  try {
    await page.goto(url, { timeout: 60000 });
    await hydrated();
    for (const path of workspacePaths) {
      // 项目行切换展开状态；使用原“新建任务”操作才能稳定导航到目标草稿。
      const row = page.getByTestId(`workspace-item-${path}`);
      await row.hover();
      await row.getByRole("button", { name: /^(New task|新建任务)$/u }).click();
      await page.waitForFunction(
        (name) =>
          document
            .querySelector('[data-testid="composer-workspace-trigger"]')
            ?.textContent?.trim() === name,
        basename(path),
      );
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      captures.push({
        workspace: basename(path),
        draft: (await page.getByTestId("v4-composer-input").innerText()).trim(),
      });
    }
    await page.reload({ timeout: 60000 });
    await hydrated();
    captures.push({
      workspaceAfterReload: await page.getByTestId("composer-workspace-trigger").innerText(),
    });
    const hookErrors = messages.filter(({ text }) =>
      /change in the order of Hooks|areHookInputsEqual|ScopedErrorBoundary:onboarding-dialog|Rendered (more|fewer) hooks/.test(
        text,
      ),
    );
    assert.deepEqual(hookErrors, []);
    assert.deepEqual(errors, []);
    return {
      coldStartup: true,
      workspaceSwitch: true,
      rendererReload: true,
      captures,
      onboardingHookErrors: hookErrors,
      pageErrors: errors,
      otherConsoleMessages: messages,
    };
  } catch (error) {
    // caught boundary 不触发 pageerror；失败时也保留 console，不能仅留下超时。
    error.acceptanceFacts = { captures, otherConsoleMessages: messages, pageErrors: errors };
    throw error;
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  }
}
