import assert from "node:assert/strict";

// 测量真实渲染的输入区和页面切换，保持用户偏好及草稿的原有所有者。
export async function runStudioPageLayoutSmoke({
  page,
  app,
  rail,
  titlebar,
  sidebar,
  resizeHandle,
  waitForSidebar,
  pass,
}) {
  // 空配置下先按真实入口关闭模型横幅，再比较相同状态的输入框；不改 DOM 布局凑坐标。
  await page
    .getByTestId("chat-error-banner")
    .getByRole("button", {
      name: /关闭错误提示|Dismiss error/,
    })
    .click();
  const draftGeometry = async (inputId) => {
    const input = page.getByTestId(inputId);
    await input.waitFor();
    return input.evaluate((element) => {
      const shell = element.closest("[data-knorvia-composer]").getBoundingClientRect();
      const surface = element.closest("[data-composer-surface]").getBoundingClientRect();
      const greeting = document
        .querySelector('[data-v4-draft-greeting="true"]')
        .getBoundingClientRect();
      return {
        x: shell.x,
        y: shell.y,
        width: shell.width,
        height: shell.height,
        surfaceY: surface.y,
        greetingY: greeting.y,
      };
    });
  };
  for (const [width, height] of [
    [1360, 900],
    [1100, 650],
  ]) {
    await app.evaluate(
      ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size),
      [width, height],
    );
    await rail.getByTestId("studio-rail-kernel-knorvia").click();
    await page.getByTestId("v4-composer-input").waitFor();
    const banner = page.getByTestId("chat-error-banner");
    if (await banner.isVisible())
      await banner.getByRole("button", { name: /关闭错误提示|Dismiss error/ }).click();
    const nativeGeometry = await draftGeometry("v4-composer-input");
    await rail.getByTestId("studio-rail-kernel-codex").click();
    const externalGeometry = await draftGeometry("studio-external-composer-input");
    console.log(
      "Draft geometry:",
      JSON.stringify({ viewport: [width, height], nativeGeometry, externalGeometry }),
    );
    for (const field of ["x", "y", "width", "height", "surfaceY", "greetingY"]) {
      assert(
        Math.abs(nativeGeometry[field] - externalGeometry[field]) <= 1,
        `draft ${field} differs between Knorvia and Codex at ${width}x${height}`,
      );
    }
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1360, 900));
  pass("PASS Knorvia and external kernel draft input geometry stays aligned");

  // 从群聊直接进入工具页，复现截图中的旧列表残留；不写偏好来伪造收起状态。
  await rail.getByTestId("studio-groups-open").click();
  await page.getByTestId("studio-groups-page").waitFor();
  await waitForSidebar(true);
  await resizeHandle.focus();
  await resizeHandle.press("ArrowRight");
  const savedSidebarWidth = await page.evaluate(() =>
    localStorage.getItem("knorvia:workspace-shell:sidebar-width-px"),
  );
  assert(savedSidebarWidth);
  for (const button of ["studio-creation-open", "studio-workflows-open", "automations-open"]) {
    await rail.getByTestId(button).click();
    await waitForSidebar(false);
    assert.equal(await rail.getByTestId(button).getAttribute("aria-pressed"), "true");
    assert.equal(await sidebar.locator(":scope > aside").getAttribute("inert"), "");
    assert.equal(await resizeHandle.count(), 0);
    assert.equal(
      await titlebar.getByRole("button", { name: /切换侧边栏|Toggle sidebar/i }).count(),
      0,
    );
    assert.equal(await titlebar.getByRole("button", { name: /新建任务|New task/i }).count(), 0);
    assert.equal(await titlebar.getByTestId("studio-search-open").count(), 0);
    assert.equal(await titlebar.getByTestId("desktop-top-nav-back").count(), 1);
    assert.equal(
      await page.evaluate(() => localStorage.getItem("knorvia:workspace-shell:sidebar-width-px")),
      savedSidebarWidth,
    );
  }
  await titlebar.getByTestId("desktop-top-nav-back").click();
  await page.getByTestId("studio-workflows").waitFor();
  await rail.getByTestId("studio-chats-open").click();
  await waitForSidebar(true);
  await page.waitForFunction(
    (expected) =>
      Math.abs(
        document.querySelector("[data-workspace-sidebar-panel]").getBoundingClientRect().width -
          Number(expected),
      ) < 1,
    savedSidebarWidth,
  );
  assert.equal(await resizeHandle.count(), 1);
  pass(
    "PASS tool pages hide irrelevant context controls, retain history, and restore the saved chat sidebar width",
  );

  await rail.getByTestId("studio-rail-kernel-codex").click();
}
