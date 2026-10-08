// 真实合成 stdio → Host/SQLite → 公共服务传输 → 原 React 组件。禁止模型与用户 profile。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { StudioDatabase } from "../packages/services/src/studio-runtime/adapters/studioDatabase.js";
import { StudioRuntimeService } from "../packages/services/src/studio-runtime/app/studioRuntimeService.js";
import { runKernelProtocol } from "../packages/services/src/studio-runtime/adapters/kernels/kernelRun.js";
import {
  startCodex,
  codexMessage,
} from "../packages/services/src/studio-runtime/adapters/kernels/codexProtocol.js";
import {
  startGrok,
  grokMessage,
} from "../packages/services/src/studio-runtime/adapters/kernels/grokProtocol.js";
import {
  startAcp,
  acpMessage,
} from "../packages/services/src/studio-runtime/adapters/kernels/acpProtocol.js";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(repo, "packages/desktop/package.json"));
const { createServer } = require("vite");
const { chromium } = require("playwright-core");
const directory = await mkdtemp(join(tmpdir(), "knorvia-external-browser-"));
const evidence =
  process.env.KNORVIA_BROWSER_EVIDENCE || join(tmpdir(), "knorvia-external-browser-evidence");
await mkdir(evidence, { recursive: true });
const db = new StudioDatabase(join(directory, "studio.sqlite"));
const commands = [];
const runtime = new StudioRuntimeService({
  db,
  clock: { id: randomUUID, now: Date.now, delay: (ms, signal) => delay(ms, undefined, { signal }) },
  kernels: {
    adapter: () => ({
      run(turn, sink, signal) {
        const kind = turn.text === "question" ? "grok" : turn.text === "approval" ? "codex" : "acp";
        const [start, message] =
          kind === "grok"
            ? [startGrok, grokMessage]
            : kind === "codex"
              ? [startCodex, codexMessage]
              : [startAcp, acpMessage];
        return runKernelProtocol({
          kernel: kind === "grok" ? "grok-build" : kind === "codex" ? "codex" : "opencode",
          mode: kind === "codex" ? "codex" : "acp",
          turn,
          sink,
          signal,
          start,
          message,
          executable: async () => ({ command: process.execPath, path: process.execPath, args: [] }),
          args: [
            join(repo, "packages/services/test/fixtures/external-state-rebuild.cjs"),
            kind,
            turn.text,
          ],
        });
      },
    }),
    inspect: async () => [],
    manage: async () => {
      throw new Error("No installs in fixture");
    },
    dispose: async () => {},
  },
  workspaces: {
    prepare: async ({ sourcePath }) => sourcePath,
    changes: async () => [],
    apply: async () => {
      throw new Error("No apply in fixture");
    },
  },
  onDidChange: () => ({ dispose() {} }),
  notify: () => {},
});
for (const [id, kernel, text] of [
  ["question", "grok-build", "question"],
  ["approval", "codex", "approval"],
  ["tool", "opencode", "sparse"],
]) {
  await runtime.command({
    type: "create-conversation",
    commandId: randomUUID(),
    id,
    kernel,
    workspacePath: directory,
  });
  await runtime.command({
    type: "send",
    commandId: randomUUID(),
    kind: "chat",
    targetId: id,
    text,
  });
}
// 旧远端历史没有 input/output 分类，即使新增状态说明也不能丢失原详情。
db.transaction(() =>
  db.write(
    "message",
    "legacy-tool",
    {
      id: "legacy-tool",
      targetId: "tool",
      runId: "legacy-run",
      sender: "opencode",
      kind: "tool",
      name: "Legacy tool",
      state: "unknown",
      text: "old undifferentiated detail",
      statusDetail: "vendor_pending",
      createdAt: 1,
      updatedAt: 1,
    },
    "tool",
  ),
);
const tick = setInterval(() => runtime.tick(), 20);
const fixtureRoot = join(repo, ".tmp", "external-state-browser");
await mkdir(fixtureRoot, { recursive: true });
await writeFile(
  join(fixtureRoot, "index.html"),
  '<div id="root"></div><script type="module" src="/@fs/' +
    join(repo, "packages/ui/test/fixtures/external-state-browser.tsx").replaceAll("\\", "/") +
    '"></script>',
);
const server = await createServer({
  configFile: join(repo, "packages/desktop/vite.config.ts"),
  root: fixtureRoot,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, strictPort: false, fs: { allow: [repo] } },
  plugins: [
    {
      name: "external-state-fixture",
      configureServer(vite) {
        vite.middlewares.use("/__external_state", async (request, response) => {
          try {
            let body = "";
            for await (const chunk of request) body += chunk;
            const { method, args } = JSON.parse(body);
            if (!["overview", "timeline", "command", "inspectKernels"].includes(method))
              throw new Error("Unexpected method");
            if (method === "command") commands.push(args[0]);
            const result = await runtime[method](...args);
            response.setHeader("content-type", "application/json");
            response.end(JSON.stringify(result));
          } catch (error) {
            response.statusCode = 500;
            response.end(JSON.stringify({ error: String(error) }));
          }
        });
      },
    },
  ],
});
let browser;
const results = [];
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) =>
    route.request().url().startsWith(origin) ? route.continue() : route.abort(),
  );
  await page.goto(origin);
  const option = page.getByRole("button", { name: /^Blue/ });
  await option.waitFor();
  await page
    .getByText("Use the blue option, preserving its explanation", { exact: true })
    .waitFor();
  const tool = page.locator("details[data-studio-message-id]").filter({ hasText: "Read fixture" });
  await tool.locator("summary").waitFor();
  await tool.locator("summary").click();
  for (const field of ["input", "output", "content", "statusDetail"])
    await tool.locator(`[data-tool-field="${field}"]`).waitFor();
  assert.match(await tool.innerText(), /Unknown/);
  assert.match(await tool.locator('[data-tool-field="output"]').innerText(), /raw/);
  assert.match(await tool.locator('[data-tool-field="content"]').innerText(), /typed/);
  assert.match(
    await tool.locator('[data-tool-field="statusDetail"]').innerText(),
    /vendor_pending/,
  );
  const legacy = page.locator('details[data-studio-message-id="legacy-tool"]');
  await legacy.locator("summary").click();
  assert.match(
    await legacy.locator('[data-tool-field="legacy"]').innerText(),
    /old undifferentiated detail/,
  );
  assert.equal(await legacy.locator('[data-tool-field="output"]').count(), 0);
  const approval = page.locator('section[aria-label="Codex 请求执行命令"]');
  for (const value of ["/fixture/project", "Needs review", "execute", "context"])
    assert.ok((await approval.innerText()).includes(value), value);
  assert.ok(!(await approval.innerText()).includes("dummy-secret"));
  results.push(
    "Native question/approval/tool fields survive real stdio, Host admission, SQLite and production GUI",
  );
  for (const [width, theme] of [
    [360, "knorvia-dark"],
    [1200, "knorvia-light"],
  ]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate((theme) => {
      document.documentElement.className = `theme-${theme}${theme.endsWith("dark") ? " dark" : ""}`;
    }, theme);
    const background = await page
      .locator("main")
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    assert.equal(
      background,
      theme.endsWith("dark") ? "rgb(19, 19, 19)" : "rgb(255, 255, 255)",
      "Actual theme color",
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    assert.equal(overflow, false, `${width}/${theme} document overflow`);
    assert.ok(await option.isVisible());
    await page.screenshot({ path: join(evidence, `${width}-${theme}.png`), fullPage: true });
    results.push(
      `${width}px ${theme}: descriptions and independent tool fields visible without page overflow`,
    );
  }
  await option.click();
  await page.getByRole("button", { name: "Legacy", exact: true }).click();
  await page.getByRole("textbox", { name: "Choose a color", exact: true }).fill("custom");
  await page.getByRole("button", { name: "Answer", exact: true }).click();
  await approval.getByRole("button", { name: "Allow once", exact: true }).click();
  const deadline = Date.now() + 5000;
  while (
    (await runtime.overview()).runs?.some((run) =>
      ["running", "waiting", "queued"].includes(run.state),
    )
  ) {
    if (Date.now() > deadline) throw new Error("Native result did not settle");
    await delay(20);
  }
  const submitted = commands.find((command) => command.type === "answer" && command.answer.answers);
  assert.deepEqual(submitted?.answer.answers, { 0: ["Blue", "Legacy", "custom"] });
  const wire = (await readFile(join(directory, "wire.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.ok(
    wire.some(
      (m) =>
        JSON.stringify(m.result?.answers) ===
        JSON.stringify({ "Choose a color": ["Blue", "Legacy", "custom"] }),
    ),
  );
  assert.equal(
    wire.filter((m) => m.id === "approval" && m.result?.decision === "accept").length,
    1,
  );
  for (const target of ["question", "approval", "tool"])
    assert.equal((await runtime.timeline(target)).runs[0].state, "succeeded");
  results.push(
    "GUI multi-select/legacy/custom answer returns labels to the native CLI; approval dispatches exactly once",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    join(evidence, "result.json"),
    JSON.stringify({ results, errors }, null, 2) + "\n",
  );
  console.log(JSON.stringify({ results, errors, evidence }, null, 2));
} finally {
  await browser?.close();
  await server.close();
  clearInterval(tick);
  await runtime.disposeAllAndWait();
  await rm(directory, { recursive: true, force: true });
  await rm(fixtureRoot, { recursive: true, force: true });
}
