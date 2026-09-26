import assert from "node:assert/strict";
import { join } from "node:path";

// 在隔离应用内通过真实偏好入口验证工具页材质；不启动推理或外部 CLI。
export async function runStudioPageMaterialsSmoke({ page, rail, sheet, devtools, repo, pass }) {
  const openMaterials = async () => {
    await rail.getByTestId("task-settings-button").click();
    await page.getByTestId("settings-section-nav-appearance").click();
    await page.getByTestId("appearance-materials").waitFor();
    return page.getByTestId("appearance-materials");
  };
  const materials = await openMaterials();
  await materials.getByRole("switch").first().click();
  await page.locator("html.knorvia-materials.knorvia-glass").waitFor();
  const surfaceAlpha = (locator) =>
    locator.evaluate((element) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d");
      context.fillStyle = getComputedStyle(element).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      return context.getImageData(0, 0, 1, 1).data[3] / 255;
    });
  const assertInheritedSurface = async (locator, label) => {
    await locator.waitFor();
    const layers = await locator.evaluate((element) => {
      const layers = [];
      while (element && !element.hasAttribute("data-studio-workspace-sheet")) {
        layers.push({
          tag: element.tagName,
          background: getComputedStyle(element).backgroundColor,
        });
        element = element.parentElement;
      }
      return element ? layers : null;
    });
    assert(layers, `${label} is outside the shared sheet`);
    for (const layer of layers)
      assert.equal(
        layer.background,
        "rgba(0, 0, 0, 0)",
        `${label} has an extra reading layer: ${JSON.stringify(layer)}`,
      );
    const alpha = await surfaceAlpha(sheet);
    assert(alpha > 0 && alpha < 1, `${label} lost the shared reading material`);
  };
  for (const dark of [false, true]) {
    // 主题 token 做两套 CSS 验收；玻璃、背景与无障碍状态走真实偏好入口和媒体查询。
    await page.evaluate((isDark) => {
      document.documentElement.classList.toggle("dark", isDark);
      document.documentElement.classList.toggle("theme-knorvia-dark", isDark);
      document.documentElement.classList.toggle("theme-knorvia-light", !isDark);
    }, dark);
    for (const [button, selector] of [
      ["studio-rail-kernel-knorvia", "[data-workspace-conversation-frame] main"],
      ["studio-rail-kernel-codex", '[data-testid="studio-external-chat"]'],
      ["studio-groups-open", '[data-testid="studio-groups-page"]'],
      ["studio-workflows-open", '[data-testid="studio-workflows"]'],
      ["automations-open", "[data-workspace-conversation-frame] main"],
      ["studio-creation-open", '[data-testid="studio-creation-page"]'],
    ]) {
      await rail.getByTestId(button).click();
      await assertInheritedSurface(
        page.locator(selector).first(),
        `${dark ? "dark" : "light"} ${button}`,
      );
    }
    await assertInheritedSurface(
      page.locator("[data-studio-creation-composer-region]"),
      "creation footer",
    );
    const inputCardAlpha = await surfaceAlpha(
      page.getByTestId("studio-creation-page").locator("textarea").locator(".."),
    );
    assert(
      inputCardAlpha > 0.65 && inputCardAlpha < 1,
      "creation input must retain a readable material",
    );
    await rail.getByTestId("studio-plugins-open").click();
    await page.locator('[data-testid="settings-page"][data-active-section="plugin"]').waitFor();
    await assertInheritedSurface(page.locator("[data-settings-panel-frame]"), "plugins");
    await rail.getByTestId("task-settings-button").click();
    for (const section of ["general", "appearance", "agents", "modelProvider"]) {
      await page.getByTestId(`settings-section-nav-${section}`).click();
      await page
        .locator(`[data-testid="settings-page"][data-active-section="${section}"]`)
        .waitFor();
      await assertInheritedSurface(page.locator("[data-settings-panel-frame]"), section);
    }
  }
  pass(
    "PASS light/dark reading materials across chat, external kernels, groups, creation, workflows, automations, plugins and settings",
  );

  // 新建空的隔离工作流只为打开真实画布；不运行节点，不调用模型或 CLI。
  await rail.getByTestId("studio-workflows-open").click();
  await page.getByRole("button", { name: /^(新建工作流|New workflow)$/ }).click();
  const workflowDialog = page.getByRole("dialog");
  await workflowDialog.getByRole("textbox").fill("Material audit fixture");
  await workflowDialog.getByRole("button", { name: /^(创建|Create)$/ }).click();
  await page.locator(".react-flow__background").waitFor();
  await assertInheritedSurface(page.locator(".react-flow__background"), "workflow canvas");
  await page.getByRole("button", { name: /^(节点设置|Node settings)$/ }).click();
  const detailsAlpha = await surfaceAlpha(
    page.getByTestId("studio-workflows").getByRole("complementary"),
  );
  assert(
    detailsAlpha > 0.65 && detailsAlpha < 1,
    "workflow details must retain a reading material",
  );
  pass(
    "PASS workflow canvas inherits the sheet while the details panel retains a readable material",
  );

  await openMaterials();
  await materials
    .locator('input[type="file"]')
    .setInputFiles(join(repo, "packages/ui/src/assets/knorvia-logo.png"));
  await page.locator(".knorvia-appearance-image").waitFor({ state: "attached" });
  await rail.getByTestId("studio-creation-open").click();
  await assertInheritedSurface(
    page.getByTestId("studio-creation-page"),
    "creation with a local background image",
  );
  await devtools.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
  });
  await page.locator("html:not(.knorvia-materials)").waitFor();
  assert.equal(await surfaceAlpha(sheet), 1);
  assert.equal(await page.getByTestId("appearance-background").count(), 0);
  await devtools.send("Emulation.setEmulatedMedia", { features: [] });
  await page.locator("html.knorvia-materials.knorvia-glass").waitFor();
  await openMaterials();
  await materials.getByRole("switch").first().click();
  // 仅背景图也应通过公共阅读底色合成，而非退回页面白块。
  await page.locator("html.knorvia-materials:not(.knorvia-glass)").waitFor();
  await rail.getByTestId("studio-creation-open").click();
  await assertInheritedSurface(
    page.getByTestId("studio-creation-page"),
    "creation with background only",
  );
  await openMaterials();
  await materials.getByRole("switch").nth(1).click();
  await page.locator("html:not(.knorvia-materials)").waitFor();
  assert.equal(await surfaceAlpha(sheet), 1);
  await rail.getByTestId("studio-creation-open").click();
  assert.equal(await surfaceAlpha(sheet), 1);
  pass(
    "PASS local image, glass off, background-only and reduced-transparency modes preserve the appropriate reading surface",
  );
}
