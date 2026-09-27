import assert from "node:assert/strict";
import { cp, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { upsertDevMarketplace } from "../apps/cli/packages/plugin-creator-plugin/skills/plugin-creator/scripts/upsert-dev-marketplace.mjs";
import { packagedProbe, completeOnboarding, repoRoot } from "./studio-packaged-test-utils.mjs";

const packs = ["project-handoff", "material-organizer", "document-quality-check"];
const probe = await packagedProbe("plugin-install", process.argv[2]);
let failure;
try {
  const source = join(probe.root, "source");
  let marketplace;
  for (const name of packs) {
    await cp(join(repoRoot, "examples/plugins", name), join(source, name), { recursive: true });
    marketplace = await upsertDevMarketplace({
      pluginPath: join(source, name),
      marketplacePath: join(source, "marketplace.json"),
    });
  }
  let page = await probe.open();
  await completeOnboarding(page);
  const openPlugins = async () => {
    await page.getByTestId("studio-plugins-open").click();
    await page.locator('[data-testid="settings-page"][data-active-section="plugin"]').waitFor();
  };
  await openPlugins();
  await page.getByTestId("plugin-settings-sources").click();
  const sources = page.getByTestId("plugin-sources-dialog");
  await sources.getByTestId("plugin-source-input").fill(source);
  await sources.getByRole("button", { name: /^(添加来源|Add source)$/ }).click();
  for (const name of packs) {
    const item = sources
      .locator("div.flex.items-center")
      .filter({ has: page.getByText(name, { exact: true }) })
      .last();
    await item.getByRole("button", { name: /^(安装|Install)$/ }).click();
    await item.waitFor({ state: "hidden" });
  }
  await sources.getByRole("button", { name: /Close|关闭/ }).click();
  probe.pass("通过来源管理界面实际安装三个本地技能包");

  const rowFor = (name) =>
    page.locator(
      `[data-testid="plugin-settings-plugin-row"][data-plugin-id="${name}@${marketplace.marketplaceId}"]`,
    );
  const inspect = async (name, enabled) => {
    const row = rowFor(name);
    await row.waitFor();
    assert.equal(await row.getByRole("switch").getAttribute("aria-checked"), String(enabled));
    await row.getByRole("button").first().click();
    await page.getByTestId("plugin-store-advanced").locator("summary").click();
    const panel = page.locator('[data-testid="plugin-compatibility-panel"][data-state="ready"]');
    await panel.waitFor();
    assert.equal(await panel.getAttribute("data-compatibility-status"), "declared");
    assert.match(await panel.innerText(), /未验证|unverified/i);
    assert.equal(
      await panel
        .locator('[data-capability="skills.enabled-catalog"]')
        .getAttribute("data-disposition"),
      enabled ? "available" : "unverified",
    );
    const sidecarPath = await panel.locator("dd").last().innerText();
    const delta = relative(await realpath(probe.dataRoot), await realpath(sidecarPath));
    assert(
      delta && !isAbsolute(delta) && delta !== ".." && !delta.startsWith(`..${sep}`),
      "Installed plugin must belong to isolated data",
    );
    assert.deepEqual(
      await readFile(sidecarPath),
      await readFile(join(source, name, ".knorvia-plugin/compatibility.json")),
    );
    const installed = resolve(sidecarPath, "../..");
    for (const file of [".knorvia-plugin/plugin.json", `skills/${name}/SKILL.md`]) {
      assert.deepEqual(
        await readFile(join(installed, file)),
        await readFile(join(source, name, file)),
      );
    }
    await page.getByTestId("studio-chats-open").click();
    await openPlugins();
  };
  for (const name of packs) {
    const toggle = rowFor(name).getByRole("switch");
    await toggle.waitFor();
    if ((await toggle.getAttribute("aria-checked")) !== "true") await toggle.click();
    await inspect(name, true);
    await rowFor(name).getByRole("switch").click();
    await inspect(name, false);
    await rowFor(name).getByRole("switch").click();
    await inspect(name, true);
    probe.pass(`${name} 的启停、兼容声明与安装字节核对通过`);
  }
  // 保留一种非默认状态，防止重开时全部默认启用掩盖持久化丢失。
  await rowFor(packs[2]).getByRole("switch").click();
  await inspect(packs[2], false);
  await probe.close();
  page = await probe.open();
  await page.getByTestId("studio-activity-rail").waitFor();
  await openPlugins();
  for (const name of packs) await inspect(name, name !== packs[2]);
  probe.pass("真正重开后安装与两启用一禁用状态保留，兼容声明仍为未验证");
} catch (error) {
  failure = error;
}
await probe.finish(failure);
