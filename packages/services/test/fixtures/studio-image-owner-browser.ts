// Actual React hook/client/store; synthetic image and controlled service A/B, no external execution.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { syntheticImage } from "./studio-image-data.js";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const require = createRequire(join(repo, "packages/desktop/package.json"));
const { createServer } = require("vite"),
  { chromium } = require("playwright-core");
const root = join(repo, ".tmp/image-owner-browser");
await mkdir(root, { recursive: true });
await writeFile(
  join(root, "index.html"),
  '<div id="root"></div><script type="module" src="/@fs/' +
    join(repo, "packages/ui/test/fixtures/studio-image-owner-browser.tsx").replaceAll("\\", "/") +
    '"></script>',
);
const image = syntheticImage();
const server = await createServer({
  configFile: join(repo, "packages/desktop/vite.config.ts"),
  root,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, fs: { allow: [repo] } },
  plugins: [
    {
      name: "owner-image",
      configureServer(server: any) {
        server.middlewares.use("/__owner_image", (_request: unknown, response: any) => {
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify(image));
        });
      },
    },
  ],
});
let browser: any;
const cases: Array<{ name: string; pass: boolean; error?: string }> = [];
const pageErrors: string[] = [];
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const run = async (name: string, verify: (page: any) => Promise<void>) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on("pageerror", (error: Error) => {
      pageErrors.push(error.message);
      process.stderr.write(error.message + "\n");
    });
    console.log("RUN " + name);
    try {
      await page.goto(origin);
      await page.waitForFunction(() => (window as any).imageOwnerFixture?.state().ready);
      await verify(page);
      cases.push({ name, pass: true });
    } catch (error) {
      cases.push({ name, pass: false, error: String(error) });
      console.log("CASE FAILED " + name + ": " + String(error));
    } finally {
      await context.close();
    }
  };
  const state = (page: any) => page.evaluate(() => (window as any).imageOwnerFixture.state());
  const call = (page: any, method: string, ...args: unknown[]) =>
    page.evaluate(({ method, args }: any) => (window as any).imageOwnerFixture[method](...args), {
      method,
      args,
    });
  const settle = async (page: any) => {
    await page.waitForFunction(() => (window as any).imageOwnerFixture.state().ready);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
  };
  const retain = async (page: any, cid: string) => {
    const value = await state(page);
    assert.equal(value.imageCount, 1);
    assert.equal(value.cid, cid);
  };
  for (const source of ["overview", "timeline"])
    await run(`foreign ${source} same target/CID cannot ACK A`, async (page) => {
      await call(page, "capture");
      await call(page, "seal", "shared-cid");
      await call(
        page,
        "configure",
        "B",
        source === "overview" ? { overviewCid: "shared-cid" } : { timelineCid: "shared-cid" },
      );
      await call(page, "select", "B");
      await settle(page);
      await retain(page, "shared-cid");
      assert.deepEqual((await state(page)).calls.B.admission, []);
    });
  await run("A delayed timeline after switching B remains unconfirmed", async (page) => {
    await call(page, "configure", "A", { holdTimeline: true });
    await call(page, "capture");
    await call(page, "seal", "late-cid");
    await page.waitForFunction(() =>
      (window as any).imageOwnerFixture.state().calls.A.admission.includes("late-cid"),
    );
    await call(page, "select", "B");
    await settle(page);
    await call(page, "releaseTimeline", "A");
    await settle(page);
    await retain(page, "late-cid");
  });
  await run("A delayed overview after switching B remains unconfirmed", async (page) => {
    await call(page, "configure", "A", { holdOverview: true });
    await call(page, "capture");
    await call(page, "seal", "late-overview-cid");
    await page.waitForFunction(
      () => (window as any).imageOwnerFixture.state().calls.A.heldOverviews === 1,
    );
    await call(page, "select", "B");
    await settle(page);
    await call(page, "releaseOverview", "A", "late-overview-cid");
    await settle(page);
    await retain(page, "late-overview-cid");
  });
  for (const kind of ["command", "retry"])
    await run(`A direct ${kind} late ACK cannot clear B scope`, async (page) => {
      await call(page, "configure", "A", { holdCommand: true });
      await call(page, "capture");
      if (kind === "retry") await call(page, "seal", "retry-cid");
      await call(page, "act", kind);
      await page.waitForFunction(
        () => (window as any).imageOwnerFixture.state().calls.A.commands.length === 1,
      );
      const cid = (await state(page)).cid;
      await call(page, "select", "B");
      await settle(page);
      await call(page, "releaseCommand", "A");
      await page.waitForFunction(() => (window as any).imageOwnerFixture.state().action.settled);
      await retain(page, cid);
    });
  await run("unsent A images cannot be submitted by B", async (page) => {
    await call(page, "capture");
    await call(page, "select", "B");
    await settle(page);
    for (const kind of ["assert", "command"]) {
      await call(page, "act", kind);
      await page.waitForFunction(() => (window as any).imageOwnerFixture.state().action.settled);
      assert.match((await state(page)).action.error, /Host/);
    }
    assert.equal((await state(page)).imageCount, 1);
    assert.equal((await state(page)).calls.B.commands.length, 0);
    await call(page, "select", "A");
    await settle(page);
    await call(page, "act", "command");
    await page.waitForFunction(() => (window as any).imageOwnerFixture.state().action.settled);
    assert.equal((await state(page)).action.error, "");
    assert.equal((await state(page)).imageCount, 0);
    assert.equal((await state(page)).calls.A.commands.length, 1);
  });
  for (const kind of ["command", "retry"])
    await run(`A direct ${kind} late rejection cannot release B scope`, async (page) => {
      await call(page, "configure", "A", {
        holdCommand: true,
        commandRejection: "Synthetic Host refusal",
      });
      await call(page, "capture");
      if (kind === "retry") await call(page, "seal", "reject-cid");
      await call(page, "act", kind);
      await page.waitForFunction(
        () => (window as any).imageOwnerFixture.state().calls.A.commands.length === 1,
      );
      const cid = (await state(page)).cid;
      await call(page, "select", "B");
      await settle(page);
      await call(page, "releaseCommand", "A");
      await page.waitForFunction(() => (window as any).imageOwnerFixture.state().action.settled);
      assert.match((await state(page)).action.error, /Host refusal/);
      await retain(page, cid);
    });
  for (const source of ["overview", "timeline"])
    await run(`same Host ${source} ACK and captured IDs clear normally`, async (page) => {
      await call(
        page,
        "configure",
        "A",
        source === "overview" ? { overviewCid: "own-cid" } : { timelineCid: "own-cid" },
      );
      await call(page, "capture");
      await call(page, "seal", "own-cid");
      await page.waitForFunction(() => !(window as any).imageOwnerFixture.state().cid);
      assert.equal((await state(page)).imageCount, 0);
    });
  await run(
    "same Host component remount retains owner proof and observes admission",
    async (page) => {
      await call(page, "configure", "A", { holdTimeline: true });
      await call(page, "capture");
      await call(page, "seal", "remount-cid");
      await page.waitForFunction(
        () => (window as any).imageOwnerFixture.state().calls.A.admission.length === 1,
      );
      await call(page, "remount");
      await page.waitForFunction(
        () => (window as any).imageOwnerFixture.state().calls.A.admission.length >= 2,
      );
      await call(page, "releaseTimeline", "A");
      await page.waitForFunction(() => !(window as any).imageOwnerFixture.state().cid);
      assert.equal((await state(page)).imageCount, 0);
    },
  );
  await run(
    "reload lacks owner proof: matching Host/CID cannot claim ACK or resend",
    async (page) => {
      await call(page, "capture");
      await call(page, "seal", "reload-cid");
      await page.reload();
      await settle(page);
      await call(page, "configure", "A", { overviewCid: "reload-cid", timelineCid: "reload-cid" });
      await page.waitForFunction(
        () => (window as any).imageOwnerFixture.state().overviewCid === "reload-cid",
      );
      await settle(page);
      await retain(page, "reload-cid");
      const value = await state(page);
      assert.equal(value.hasPendingOwner, false);
      assert.equal(value.hasBytes, false);
      assert.deepEqual(value.calls.A.admission, []);
      await call(page, "act", "retry");
      await page.waitForFunction(() => (window as any).imageOwnerFixture.state().action.settled);
      assert.match((await state(page)).action.error, /unconfirmed/);
      assert.equal((await state(page)).calls.A.commands.length, 0);
      await page
        .getByText(
          "Original Host ownership cannot be verified; submission reload-cid remains unconfirmed and original image bytes are unavailable. Inspect the original Host run history or start a separate conversation. No automatic resend.",
          { exact: true },
        )
        .waitFor();
      await call(page, "replaceExpired");
      await call(page, "act", "retry");
      await page.waitForFunction(() => (window as any).imageOwnerFixture.state().action.settled);
      assert.match((await state(page)).action.error, /unconfirmed/);
      await call(page, "act", "command");
      await page.waitForFunction(() => (window as any).imageOwnerFixture.state().action.settled);
      assert.match((await state(page)).action.error, /等待确认/);
      assert.equal((await state(page)).cid, "reload-cid");
      assert.equal((await state(page)).calls.A.commands.length, 0);
    },
  );
  await run(
    "unsubmitted expired images can be explicitly removed and captured again",
    async (page) => {
      await call(page, "capture");
      await page.reload();
      await settle(page);
      assert.equal((await state(page)).hasBytes, false);
      assert.equal((await state(page)).cid, undefined);
      await call(page, "replaceExpired");
      await call(page, "act", "command");
      await page.waitForFunction(() => (window as any).imageOwnerFixture.state().action.settled);
      assert.equal((await state(page)).action.error, "");
      assert.equal((await state(page)).calls.A.commands.length, 1);
      assert.equal((await state(page)).imageCount, 0);
    },
  );
  const output = join(repo, "test-results/studio-image-owner-browser");
  await mkdir(output, { recursive: true });
  await writeFile(
    join(output, "results.json"),
    JSON.stringify(
      { cases, pageErrors, provider: "controlled service ports; no external execution" },
      null,
      2,
    ),
  );
  for (const item of cases)
    console.log(
      `${item.pass ? "PASS" : "FAIL"} ${item.name}${item.error ? ": " + item.error : ""}`,
    );
  assert.deepEqual(pageErrors, []);
  assert.equal(cases.filter((item) => !item.pass).length, 0);
} finally {
  await browser?.close();
  await server.close();
}
