// Actual React/public-service/SQLite acceptance. No CLI, provider, account or desktop runtime is used.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Event } from "@knorvia/rpc";
import { StudioDatabase } from "../../src/studio-runtime/adapters/studioDatabase.js";
import { StudioRuntimeService } from "../../src/studio-runtime/app/studioRuntimeService.js";
import type { StoredRun } from "../../src/studio-runtime/app/storePort.js";
import type { StudioCommand } from "@knorvia/services";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const require = createRequire(join(repo, "packages/desktop/package.json"));
const { createServer } = require("vite");
const { chromium } = require("playwright-core");
const temporary = await mkdtemp(join(tmpdir(), "knorvia-attention-browser-"));
const databasePath = join(temporary, "studio.sqlite");
let db = new StudioDatabase(databasePath);
let forbiddenCalls = 0;
const denied = () => {
  forbiddenCalls++;
  throw new Error("Provider/workspace operation forbidden in inbox acceptance");
};
const createRuntime = () =>
  new StudioRuntimeService({
    db,
    clock: { id: randomUUID, now: Date.now, delay: async () => {} },
    kernels: { adapter: denied, inspect: denied, manage: denied, dispose: async () => {} },
    workspaces: { prepare: denied, changes: denied, apply: denied },
    onDidChange: Event.None,
    notify: () => {},
  });
let runtime = createRuntime();
const run = (
  id: string,
  targetId: string,
  state: StoredRun["state"],
  updatedAt: number,
): StoredRun => ({
  id,
  targetId,
  kind: "chat",
  state,
  input: "Synthetic fixture input",
  createdAt: 1,
  updatedAt,
  attempt: 1,
  resultKnown: true,
  checkpoint: { steps: {}, values: {}, completedRounds: 0 },
});
for (const [id, kernel] of [
  ["a", "codex"],
  ["b", "claude-code"],
] as const)
  await runtime.command({
    commandId: `create-${id}`,
    type: "create-conversation",
    id,
    kernel,
    workspacePath: `/synthetic/${id}`,
  });
db.transaction(() => {
  for (let i = 0; i < 151; i++)
    db.write(
      "run",
      `history-${i}`,
      run(`history-${i}`, "a", i === 0 ? "failed" : "succeeded", i === 0 ? 1000 : i),
      "a",
    );
  db.write("run", "b-failed", run("b-failed", "b", "failed", 999), "b");
  db.write("run", "pending-run", run("pending-run", "b", "waiting", 1001), "b");
  db.write(
    "turn",
    "pending-turn",
    {
      id: "pending-turn",
      runId: "pending-run",
      attempt: 1,
      stepId: "chat",
      kernel: "claude-code",
      state: "waiting",
    },
    "pending-run",
  );
  db.write(
    "interaction",
    "pending",
    {
      id: "pending",
      runId: "pending-run",
      turnId: "pending-turn",
      kind: "approval",
      kernel: "claude-code",
      status: "pending",
      title: "Synthetic approval",
      choices: ["allow-once", "deny"],
    },
    "b",
  );
});
const native = ["a", "b"].map((id) => ({
  taskId: "native",
  traceId: "native",
  title: `Native ${id}`,
  workspacePath: "/same/path",
  workspaceIdentity: `remote:${id}`,
  remoteSessionId: `connection:${id}`,
  mode: "build",
  status: "completed",
  createdAt: 1,
  updatedAt: 100,
  unreadAt: 100 as number | undefined,
  sourceAvailability: "online",
}));
const held = new Map<string, () => void>();
const holdNext = new Set<string>();
const paused = async (key: string) => {
  if (!holdNext.delete(key)) return;
  await new Promise<void>((done) => held.set(key, done));
};
const control = async (action: string, key?: string) => {
  if (action === "hold") holdNext.add(key!);
  else if (action === "release") {
    assert(held.has(key!));
    held.get(key!)!();
    held.delete(key!);
  } else if (action === "bump-run")
    db.transaction(() => {
      const old = db.read<StoredRun>("run", "history-0")!;
      db.write("run", old.id, { ...old, attempt: old.attempt + 1 }, old.targetId);
    });
  else if (action === "bump-native") {
    native[0]!.unreadAt = 101;
    native[0]!.updatedAt++;
  } else if (action === "restart") {
    await runtime.disposeAllAndWait();
    db = new StudioDatabase(databasePath);
    runtime = createRuntime();
  }
  return { held: [...held.keys()] };
};
const handle = async (method: string, args: any[]) => {
  if (method === "overview") return runtime.overview();
  if (method === "timeline") {
    await paused(`timeline:${args[0]}`);
    return runtime.timeline(args[0], args[1], args[2]);
  }
  if (method === "command") {
    const result = await runtime.command(args[0] as StudioCommand);
    await paused("command");
    return result;
  }
  if (method === "native-list") {
    const items = args[0]?.kind === "timeline" ? native : [];
    return { items, total: items.length, hasMore: false };
  }
  if (method === "native-read") {
    const item = native.find(
      (item) => item.workspaceIdentity === args[0].address.workspaceIdentity,
    );
    assert(item);
    if (item.unreadAt === args[0].mutation.expectedUnreadAt) item.unreadAt = undefined;
    const receipt = { ...item };
    await paused("native-read");
    return receipt;
  }
  if (method === "control") return control(args[0], args[1]);
  throw new Error(`Unsupported fixture method: ${method}`);
};
const fixtureRoot = join(repo, ".tmp", "attention-browser");
await mkdir(fixtureRoot, { recursive: true });
await writeFile(
  join(fixtureRoot, "index.html"),
  '<div id="root"></div><script type="module" src="/@fs/' +
    join(repo, "packages/ui/test/fixtures/studio-attention-browser.tsx").replaceAll("\\", "/") +
    '"></script>',
);
const server = await createServer({
  configFile: join(repo, "packages/desktop/vite.config.ts"),
  root: fixtureRoot,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, strictPort: false, fs: { allow: [repo] } },
  plugins: [
    {
      name: "attention-controlled-protocol",
      configureServer(server: any) {
        server.middlewares.use("/__attention_test", async (request: any, response: any) => {
          try {
            let body = "";
            for await (const chunk of request) body += chunk;
            const { method, args } = JSON.parse(body);
            const result = await handle(method, args);
            response.setHeader("content-type", "application/json");
            response.end(JSON.stringify(result));
          } catch (error) {
            response.statusCode = 500;
            response.setHeader("content-type", "application/json");
            response.end(JSON.stringify({ error: String(error) }));
          }
        });
      },
    },
  ],
});
let browser: any;
const results: string[] = [];
try {
  await server.listen();
  const address = server.httpServer!.address() as { port: number };
  const origin = `http://127.0.0.1:${address.port}`;
  const rpc = async (action: string, key?: string) => {
    const response = await fetch(`${origin}/__attention_test`, {
      method: "POST",
      body: JSON.stringify({ method: "control", args: [action, key] }),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  browser = await chromium.launch({
    executablePath: process.argv[2] || process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors: string[] = [];
  page.on("pageerror", (error: Error) => errors.push(error.message));
  await page.goto(origin);
  await page.getByTestId("studio-attention-row").first().waitFor();
  const row = (id: string) => page.locator(`[data-attention-id="${id}"]`);
  const refresh = () => page.getByRole("button", { name: "Refresh", exact: true }).click();
  const waitHeld = async (key: string) => {
    await page.waitForFunction(async (key: string) => {
      const response = await fetch("/__attention_test", {
        method: "POST",
        body: JSON.stringify({ method: "control", args: ["status"] }),
      });
      return (await response.json()).held.includes(key);
    }, key);
  };
  await row("pending").waitFor();
  assert.equal(await page.getByTestId("studio-attention-row").count(), 25);
  await page.getByRole("button", { name: /Show more/ }).click();
  assert.equal(await page.getByTestId("studio-attention-row").count(), 50);
  results.push(
    "Real inbox renders 25-row windows and expands to 50 from 153 Studio facts plus two distinct native sources",
  );
  await page.getByRole("button", { name: /Needs attention \(1\)/ }).click();
  await row("pending").getByRole("button", { name: "Mark read" }).click();
  await page.waitForFunction(() =>
    document
      .querySelector('[data-attention-id="pending"] button:last-of-type')
      ?.hasAttribute("disabled"),
  );
  assert.equal(db.read<any>("interaction", "pending")?.status, "pending");
  assert.equal(await row("pending").count(), 1);
  results.push(
    "Marking a pending approval read leaves it visible and never approves or executes it",
  );
  await page.getByRole("button", { name: /Failed \(2\)/ }).click();
  await rpc("hold", "command");
  await row("history-0").getByRole("button", { name: "Mark read" }).click();
  await waitHeld("command");
  await rpc("bump-run");
  await refresh();
  await page.waitForFunction(() =>
    document.querySelector('[data-attention-id="history-0"]')?.textContent?.includes("#2"),
  );
  await rpc("release", "command");
  await page.waitForFunction(
    () =>
      !document
        .querySelector('[data-attention-id="history-0"] button:last-of-type')
        ?.hasAttribute("disabled"),
  );
  assert.equal(
    (await runtime.overview()).attention?.items.find((item) => item.id === "history-0")?.unread,
    true,
  );
  results.push(
    "A late old-attempt read ACK leaves attempt 2 unread in the component and durable owner",
  );
  await rpc("hold", "timeline:a");
  await row("history-0").getByRole("button", { name: "Open", exact: true }).click();
  await waitHeld("timeline:a");
  await row("b-failed").getByRole("button", { name: "Open", exact: true }).click();
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="attention-target"]')
      ?.textContent?.includes('"externalSessionId":"b"'),
  );
  await rpc("release", "timeline:a");
  await page.waitForFunction(
    () =>
      !document.querySelector('[data-attention-id="history-0"] button')?.hasAttribute("disabled"),
  );
  assert.equal(
    JSON.parse(await page.getByTestId("attention-target").textContent()).externalSessionId,
    "b",
  );
  await row("history-0").getByRole("button", { name: "Open", exact: true }).click();
  await page.locator('[data-studio-run-history="history-0"]').waitFor();
  const target = JSON.parse(await page.getByTestId("attention-target").textContent());
  assert.equal(target.workspacePath, "/synthetic/a");
  assert.equal(target.kernelId, "codex");
  assert.equal(target.focusRunId, "history-0");
  results.push(
    "Late A cannot replace B; opening historical A displays its real focused run history with original project/kernel/session/run",
  );
  await page.getByRole("button", { name: "All", exact: true }).click();
  while ((await row("native").count()) < 2)
    await page.getByRole("button", { name: /Show more/ }).click();
  await (page as any).evaluate(() => (window as any).attentionFixture.observeNative());
  await rpc("hold", "native-read");
  await row("native")
    .filter({ hasText: "Native a" })
    .getByRole("button", { name: "Mark read" })
    .click();
  await waitHeld("native-read");
  await rpc("bump-native");
  await (page as any).evaluate(() => (window as any).attentionFixture.observeNative());
  await refresh();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="native-marker"]')?.textContent === "101",
  );
  await rpc("release", "native-read");
  await page.waitForFunction(
    () =>
      !document
        .querySelector('[data-attention-id="native"] button:last-of-type')
        ?.hasAttribute("disabled"),
  );
  assert.equal(await page.getByTestId("native-marker").textContent(), "101");
  results.push(
    "Production React native read action preserves marker 101 after the delayed ACK for marker 100",
  );
  await rpc("restart");
  await page.reload();
  await page.getByTestId("studio-attention-row").first().waitFor();
  await page.getByRole("button", { name: /Needs attention \(1\)/ }).click();
  assert.equal(await row("pending").getByRole("button", { name: "Mark read" }).isDisabled(), true);
  assert.equal(
    (await runtime.overview()).attention?.items.find((item) => item.id === "history-0")?.unread,
    true,
  );
  results.push(
    "SQLite restart and browser reload preserve read watermarks separately from pending approvals and newer attempts",
  );
  assert.equal(forbiddenCalls, 0);
  assert.deepEqual(errors, []);
  const output = join(repo, "test-results", "studio-attention-browser");
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: join(output, "inbox.png") });
  await writeFile(
    join(output, "results.json"),
    JSON.stringify(
      {
        results,
        forbiddenCalls,
        pageErrors: errors,
        transport: "controlled public interfaces",
        runtime: "real StudioRuntimeService and SQLite",
        desktop: "not exercised",
      },
      null,
      2,
    ),
  );
  console.log(results.join("\n"));
} finally {
  for (const release of held.values()) release();
  await browser?.close();
  await server.close();
  await runtime.disposeAllAndWait();
  await rm(temporary, { recursive: true, force: true });
}
