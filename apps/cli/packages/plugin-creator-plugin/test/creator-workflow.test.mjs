import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPlugin } from "../skills/plugin-creator/scripts/create-basic-plugin.mjs";
import { preflightPlugin } from "../skills/plugin-creator/scripts/validate-plugin.mjs";
import { upsertDevMarketplace } from "../skills/plugin-creator/scripts/upsert-dev-marketplace.mjs";
import { withMarketplaceLock } from "../skills/plugin-creator/scripts/marketplace-files.mjs";

async function temporary(t) {
  const root = await mkdtemp(join(tmpdir(), "knorvia-creator-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("all selected components validate, register locally and update idempotently", async (t) => {
  const root = await temporary(t);
  const plugin = await createPlugin({ name: "sample-tool", parentPath: root, components: ["skills", "agents", "commands", "hooks", "mcp"] });
  assert.deepEqual(await preflightPlugin(plugin), []);
  const first = await upsertDevMarketplace({ pluginPath: plugin, nameZh: "样例" });
  assert.equal(first.changed, true);
  const again = await upsertDevMarketplace({ pluginPath: plugin });
  assert.equal(again.changed, false);
  assert.equal(first.pluginId, again.pluginId);
  const index = JSON.parse(await readFile(first.marketplacePath, "utf8"));
  assert.equal(index.plugins[0].source, "./sample-tool");
  assert.equal(index.plugins[0].displayName_i18n["zh-CN"], "样例");
});

test("default creation preserves an existing directory; force preserves unrelated user files", async (t) => {
  const root = await temporary(t);
  const options = { name: "sample-tool", parentPath: root, components: ["skills"] };
  const plugin = await createPlugin(options);
  await writeFile(join(plugin, "user-notes.txt"), "keep user work");
  await writeFile(join(plugin, "README.md"), "custom readme");
  await assert.rejects(createPlugin(options), /already exists/);
  assert.equal(await readFile(join(plugin, "README.md"), "utf8"), "custom readme");
  await createPlugin({ ...options, force: true });
  assert.equal(await readFile(join(plugin, "user-notes.txt"), "utf8"), "keep user work");
});

test("invalid names, source conflicts and corrupt indexes cannot replace existing files", async (t) => {
  const root = await temporary(t);
  for (const name of ["../escape", "a/b", "", "../sample-tool"])
    await assert.rejects(createPlugin({ name, parentPath: root }), /name/i);
  const plugin = await createPlugin({ name: "sample-tool", parentPath: root });
  const indexPath = join(root, "marketplace.json");
  const old = '{"name":"other-source","plugins":[{"name":"sample-tool","source":"./another-tool"}]}';
  await writeFile(indexPath, old);
  await assert.rejects(upsertDevMarketplace({ pluginPath: plugin }), /different source/);
  assert.equal(await readFile(indexPath, "utf8"), old);
  await writeFile(indexPath, "broken json");
  await assert.rejects(upsertDevMarketplace({ pluginPath: plugin }));
  assert.equal(await readFile(indexPath, "utf8"), "broken json");
});

test("component traversal and directory links are rejected without following them", async (t) => {
  const root = await temporary(t);
  const plugin = await createPlugin({ name: "sample-tool", parentPath: root });
  const manifestPath = join(plugin, ".knorvia-plugin/plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  await writeFile(manifestPath, JSON.stringify({ ...manifest, skills: "../outside" }));
  assert.match((await preflightPlugin(plugin)).join("\n"), /escapes/);
  const outside = join(root, "outside");
  await mkdir(outside);
  await symlink(outside, join(plugin, "linked"), process.platform === "win32" ? "junction" : "dir");
  await writeFile(manifestPath, JSON.stringify({ ...manifest, skills: "./linked" }));
  assert.match((await preflightPlugin(plugin)).join("\n"), /Symbolic link/);
});

test("a competing writer cannot remove or steal the active local source lock", async (t) => {
  const root = await temporary(t);
  const path = join(root, "marketplace.json");
  await withMarketplaceLock(path, async () => {
    await assert.rejects(withMarketplaceLock(path, () => assert.fail("must not enter")), /locked/);
    assert.equal(await readFile(`${path}.lock`, "utf8"), "");
  });
  await withMarketplaceLock(path, () => Promise.resolve());
});
