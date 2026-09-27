import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { packagedProbe, completeOnboarding, repoRoot } from "./studio-packaged-test-utils.mjs";
import { WINDOWS_CUA_ARTIFACT } from "../packages/cua/windows-artifact.js";

const require = createRequire(join(repoRoot, "apps/cli/packages/node-repl-host/package.json"));
const { Client } = await import(pathToFileURL(require.resolve("@modelcontextprotocol/client")));
const { StdioClientTransport } = await import(
  pathToFileURL(require.resolve("@modelcontextprotocol/client/stdio"))
);
const probe = await packagedProbe("computer-use", process.argv[2]);
let failure;

async function findInstalledPlugin(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const candidate = join(directory, entry.name);
    if (entry.name === ".knorvia-plugin") {
      const manifest = JSON.parse(await readFile(join(candidate, "plugin.json"), "utf8"));
      if (manifest.name === "computer-use" && manifest.version === "0.7.0") return directory;
    } else {
      const found = await findInstalledPlugin(candidate);
      if (found) return found;
    }
  }
}

async function inspectPackagedMcp(pluginRoot, enabled) {
  const host = join(
    probe.result.packageEvidence.resourcesPath,
    "knorvia/packages/node-repl-host/dist/mcp/server.js",
  );
  const env = Object.fromEntries(
    ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH"]
      .filter((key) => process.env[key])
      .map((key) => [key, process.env[key]]),
  );
  const transport = new StdioClientTransport({
    command: probe.result.executable,
    args: [host],
    stderr: "pipe",
    env: {
      ...env,
      ELECTRON_RUN_AS_NODE: "1",
      KNORVIA_ENV: "production",
      KNORVIA_CUA_PLUGIN_ROOT: pluginRoot,
      KNORVIA_WINDOWS_COMPUTER_USE: enabled ? "1" : "0",
    },
  });
  const client = new Client(
    { name: "packaged-computer-test", version: "1" },
    { versionNegotiation: { mode: "auto", probe: { timeoutMs: 10000 } } },
  );
  try {
    await client.connect(transport);
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    assert.equal(names.filter((name) => name.startsWith("computer_")).length, enabled ? 5 : 0);
    if (enabled) {
      // 缺失可信 scope 在进入驱动前拒绝；此用例不枚举、截图或操作任何用户窗口。
      const denied = await client.callTool({ name: "computer_list_windows", arguments: {} });
      assert.equal(denied.isError, true);
      assert.match(JSON.stringify(denied), /missing_context/);
    }
  } finally {
    await client.close();
    await transport.close();
  }
}

try {
  let page = await probe.open();
  await completeOnboarding(page);
  const openPlugins = async () => {
    await page.getByTestId("studio-plugins-open").click();
    await page.locator('[data-testid="settings-page"][data-active-section="plugin"]').waitFor();
  };
  await openPlugins();
  const toggle = () =>
    page.locator('[data-plugin-id="computer-use@knorvia-plugins-bundled"]').getByRole("switch");
  await toggle().waitFor();
  assert.equal(await toggle().getAttribute("aria-checked"), "false");
  probe.pass("生产包新配置的 Computer Use 插件默认关闭");
  await toggle().click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-plugin-id="computer-use@knorvia-plugins-bundled"] [role="switch"]')
        ?.getAttribute("aria-checked") === "true",
  );
  const installed = await findInstalledPlugin(probe.dataRoot);
  assert(installed, "Packaged startup must seed the actual Computer Use plugin");
  for (const [filename, hash] of Object.entries(WINDOWS_CUA_ARTIFACT.files)) {
    const bytes = await readFile(join(installed, "dist/windows", filename));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), hash);
  }
  assert.match(await readFile(join(installed, "docs/CUA-LICENSE.txt"), "utf8"), /Cua AI, Inc/);
  assert.match(await readFile(join(installed, "docs/THIRD-PARTY-NOTICES.md"), "utf8"), /0\.30\.1/);
  probe.pass("实际安装缓存含固定官方驱动与开源许可，摘要完全匹配");
  await inspectPackagedMcp(installed, false);
  await inspectPackagedMcp(installed, true);
  probe.pass("使用包内 Electron/宿主验明启停工具门和缺失身份拒绝，无桌面动作");
  await probe.close();
  page = await probe.open();
  await page.getByTestId("studio-activity-rail").waitFor();
  await openPlugins();
  assert.equal(await toggle().getAttribute("aria-checked"), "true");
  await toggle().click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-plugin-id="computer-use@knorvia-plugins-bundled"] [role="switch"]')
        ?.getAttribute("aria-checked") === "false",
  );
  probe.pass("重开后启用状态保留，并可正常关闭");
} catch (error) {
  failure = error;
}
await probe.finish(failure);
