import { pngChunk, syntheticApng, syntheticOrientedJpeg } from "./studio-image-data.js";
import {
  verifyImageCaptureScope,
  verifyStaticPngCapture,
  verifyImageCaptureCancellation,
} from "./studio-image-scope-browser.js";
// Actual external-chat React and SQLite, synthetic images and controlled public protocol only.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import { Event } from "@knorvia/rpc";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import { StudioDatabase } from "../../src/studio-runtime/adapters/studioDatabase.js";
import { StudioRuntimeService } from "../../src/studio-runtime/app/studioRuntimeService.js";
import { studioImageCodec } from "../../src/studio-runtime/adapters/imageCodec.js";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const require = createRequire(join(repo, "packages/desktop/package.json"));
const { createServer } = require("vite"),
  { chromium } = require("playwright-core");
const temporary = await mkdtemp(join(tmpdir(), "knorvia-image-browser-"));
let db = new StudioDatabase(join(temporary, "studio.sqlite"));
let holdCommand = false,
  dropAck = false,
  releaseAck: (() => void) | undefined;
let holdOptions = false,
  releaseOptions: (() => void) | undefined;
const make = () =>
  new StudioRuntimeService({
    db,
    images: studioImageCodec,
    clock: { id: randomUUID, now: Date.now, delay: async () => {} },
    kernels: {
      adapter: () => {
        throw new Error("No provider runs in browser acceptance");
      },
      inspect: async () => [],
      manage: async () => {
        throw new Error("unused");
      },
      dispose: async () => {},
      options: async () => ({
        defaultModel: "vision",
        models: [
          { id: "vision", label: "Vision", reasoning: [], inputModalities: ["text", "image"] },
          { id: "text-only", label: "Text only", reasoning: [], inputModalities: ["text"] },
        ],
      }),
    },
    workspaces: {
      prepare: async () => {
        throw new Error("No workspace mutation");
      },
      changes: async () => [],
      apply: async () => {},
    },
    onDidChange: Event.None,
    notify: () => {},
  });
let runtime = make();
for (const id of ["chat", "other"])
  await runtime.command({
    commandId: randomUUID(),
    type: "create-conversation",
    id,
    kernel: "codex",
    workspacePath: temporary,
  });
const status = {
  id: "codex",
  installed: true,
  origin: "external",
  capabilities: { resume: true, approval: true, questions: true, readOnly: true, fullAccess: true },
};
const handle = async (method: string, args: any[]) => {
  if (method === "overview") return runtime.overview();
  if (method === "timeline") return runtime.timeline(args[0], args[1], args[2], args[3], args[4]);
  if (method === "inspect") return [status];
  if (method === "options") {
    if (holdOptions) {
      holdOptions = false;
      await new Promise<void>((resolve) => {
        releaseOptions = resolve;
      });
    }
    return runtime.kernelOptions(args[0]);
  }
  if (method === "command") {
    const result = await runtime.command(args[0]);
    if (args[0].type === "send" && holdCommand) {
      holdCommand = false;
      await new Promise<void>((resolve) => {
        releaseAck = resolve;
      });
    }
    if (args[0].type === "send" && dropAck) {
      dropAck = false;
      throw new Error("Synthetic lost ACK");
    }
    return result;
  }
  if (method === "control") {
    if (args[0] === "start") runtime.tick();
    if (args[0] === "hold") holdCommand = true;
    if (args[0] === "drop") dropAck = true;
    if (args[0] === "release") {
      releaseAck?.();
      releaseAck = undefined;
    }
    if (args[0] === "hold-options") holdOptions = true;
    if (args[0] === "release-options") {
      releaseOptions?.();
      releaseOptions = undefined;
    }
    if (args[0] === "restart") {
      await runtime.disposeAllAndWait();
      db = new StudioDatabase(join(temporary, "studio.sqlite"));
      runtime = make();
    }
    return { held: Boolean(releaseAck), optionsHeld: Boolean(releaseOptions) };
  }
  throw new Error(`Unsupported method ${method}`);
};
const fixtureRoot = join(repo, ".tmp", "image-browser");
await mkdir(fixtureRoot, { recursive: true });
await writeFile(
  join(fixtureRoot, "index.html"),
  '<div id="root"></div><script type="module" src="/@fs/' +
    join(repo, "packages/ui/test/fixtures/studio-image-browser.tsx").replaceAll("\\", "/") +
    '"></script>',
);
const server = await createServer({
  configFile: join(repo, "packages/desktop/vite.config.ts"),
  root: fixtureRoot,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, fs: { allow: [repo] } },
  plugins: [
    {
      name: "image-controlled-protocol",
      configureServer(server: any) {
        server.middlewares.use("/__image_test", async (request: any, response: any) => {
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
const pixels = Buffer.from([127, 11, 31, 255, 33, 77, 201, 255]);
const png = PNG.sync.write({ width: 2, height: 1, data: pixels }),
  jpg = jpeg.encode({ width: 2, height: 1, data: pixels }, 90).data;
const file = (bytes: Buffer, name = "合成.png", type = "image/png") => ({
  data: bytes.toString("base64"),
  name,
  type,
});
const results: string[] = [];
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const control = async (action: string) => {
    const r = await fetch(origin + "/__image_test", {
      method: "POST",
      body: JSON.stringify({ method: "control", args: [action] }),
    });
    return r.json();
  };
  browser = await chromium.launch({
    executablePath: process.argv[2] || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } }),
    errors: string[] = [];
  page.on("pageerror", (error: Error) => errors.push(error.message));
  page.on("console", (msg: any) => {
    if (msg.type() === "error") process.stderr.write(msg.text().slice(0, 300) + "\n");
  });
  await page.goto(origin);
  await page.getByTestId("studio-external-composer-input").waitFor();
  const input = () => page.getByTestId("studio-external-composer-input");
  const send = () => page.getByRole("button", { name: "Send", exact: true });
  const paste = async (files: any[], kind = "paste") =>
    page.evaluate(
      ({ files, kind }: any) => {
        const transfer = new DataTransfer();
        for (const f of files) {
          const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
          transfer.items.add(new File([bytes], f.name, { type: f.type }));
        }
        const target = document.querySelector('[data-testid="studio-external-composer-input"]')!;
        target.dispatchEvent(
          kind === "paste"
            ? new ClipboardEvent("paste", {
                bubbles: true,
                cancelable: true,
                clipboardData: transfer,
              })
            : new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }),
        );
      },
      { files, kind },
    );
  const draft = () => page.evaluate(() => (window as any).imageFixture.draft());
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Send"]')?.hasAttribute("disabled") === true,
  );
  // Catalog and status are read-only public observations; wait until image capture is actually allowed.
  await page.waitForFunction(() => document.body.textContent?.includes("Vision"));
  await verifyImageCaptureScope(page, paste, file(png));
  results.push(
    "Delayed capture failures after model/connection changes cannot write errors or end another scope",
  );
  await verifyStaticPngCapture(
    page,
    paste,
    file(Buffer.from(syntheticApng().dataBase64, "base64")),
    file(
      Buffer.concat([
        png.subarray(0, 33),
        pngChunk("tEXt", Buffer.from("x")),
        png.subarray(33, -1),
      ]),
    ),
  );
  for (const bad of [
    [file(Buffer.alloc(2 * 1024 * 1024 + 1))],
    [file(png, "vector.svg", "image/svg+xml")],
    [file(Buffer.from("invalid png"))],
    Array.from({ length: 5 }, (_, i) => file(png, `count-${i}.png`)),
  ]) {
    await paste(bad);
    await page.getByRole("alert").waitFor();
    assert.equal((await draft()).images?.length ?? 0, 0);
    assert.equal((await runtime.overview()).runs.length, 0);
  }
  const rotated = syntheticOrientedJpeg(jpg);
  await paste([file(rotated, "方向.jpg", "image/jpeg")]);
  await page.getByRole("button", { name: "Remove 方向.jpg", exact: true }).waitFor();
  assert.equal(
    (await draft()).images[0].sha256,
    createHash("sha256").update(rotated).digest("hex"),
  );
  await page.getByRole("button", { name: "Remove 方向.jpg", exact: true }).click();
  await verifyImageCaptureCancellation(page, paste, file(png));
  results.push(
    "Bad MIME/data, APNG declarations, damaged chunks and count/size budgets reject; EXIF JPEG retains exact bytes; cancelled or old-session reads cannot append bytes",
  );
  await paste([file(png)]);
  await page.getByRole("button", { name: "Preview 合成.png", exact: true }).waitFor();
  await paste([file(png)], "drop");
  await page.waitForFunction(() => (window as any).imageFixture.draft()?.images?.length === 1);
  const captured = (await draft()).images[0];
  assert.equal(captured.sha256, createHash("sha256").update(png).digest("hex"));
  const previewPixels = await page
    .locator('[data-testid="studio-image-attachments"] img')
    .first()
    .evaluate((img: any) => {
      const c = document.createElement("canvas");
      c.width = 2;
      c.height = 1;
      const x = c.getContext("2d")!;
      x.drawImage(img, 0, 0);
      return [...x.getImageData(0, 0, 2, 1).data];
    });
  assert.deepEqual(previewPixels, [...pixels]);
  await send().click();
  await page.waitForFunction(() => !(window as any).imageFixture.draft()?.images?.length);
  const first = (await runtime.overview()).runs[0];
  assert.equal(first.input, "");
  assert.equal(first.attachments?.[0].sha256, captured.sha256);
  assert.equal(first.state, "queued");
  results.push(
    "Image-only PNG, exact preview pixels/hash, duplicate paste/drop and queued owner ACK",
  );
  await paste([file(png), file(jpg, "中文.jpg", "image/jpeg")]);
  await page.getByRole("button", { name: "Remove 中文.jpg", exact: true }).waitFor();
  await input().fill("compare two images");
  await control("hold");
  await send().click();
  await page.waitForFunction(async () => {
    const r = await fetch("/__image_test", {
      method: "POST",
      body: JSON.stringify({ method: "control", args: ["status"] }),
    });
    return (await r.json()).held;
  });
  await page.evaluate(() => {
    const remove = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.getAttribute("aria-label") === "Remove 合成.png",
    );
    remove?.click();
  });
  await paste([file(png)]);
  await input().fill("new draft survives");
  await control("release");
  await page.waitForFunction(
    () =>
      (window as any).imageFixture.draft()?.text === "new draft survives" &&
      (window as any).imageFixture.draft()?.images?.length === 1,
  );
  const retained = (await draft()).images[0];
  assert.notEqual(retained.id, captured.id);
  results.push("Text plus PNG/JPEG; late ACK preserves re-added same-byte capture and edited text");
  // Known model refusal does not submit any command and retains the image.
  const count = (await runtime.overview()).runs.length;
  await page.evaluate(() => (window as any).imageFixture.selectModel("text-only"));
  await send().click();
  await page.getByRole("alert").filter({ hasText: "不支持图片" }).waitFor();
  assert.equal((await runtime.overview()).runs.length, count);
  assert.equal((await draft()).images.length, 1);
  await page.evaluate(() => (window as any).imageFixture.selectModel("vision"));
  await control("drop");
  await send().click();
  await page.getByRole("alert").filter({ hasText: "lost ACK" }).waitFor();
  const acceptedCount = (await runtime.overview()).runs.length;
  const retry = page.getByRole("button", { name: "Retry original submission", exact: true });
  if (await retry.count()) await retry.click();
  await page.waitForFunction(() => !(window as any).imageFixture.draft()?.imageSubmission);
  assert.equal((await runtime.overview()).runs.length, acceptedCount);
  results.push(
    "Known unsupported model preserves draft; lost ACK retry uses same command with no duplicate run",
  );
  await paste([file(png)]);
  await page.getByRole("button", { name: "Remove 合成.png", exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Switch session", exact: true }).click();
  assert.equal((await draft())?.images?.length ?? 0, 0);
  await page.getByRole("button", { name: "Switch session", exact: true }).click();
  await page.getByRole("button", { name: "Remove 合成.png", exact: true }).first().waitFor();
  await page.reload();
  await page.getByText("Image unavailable; add it again", { exact: true }).first().waitFor();
  await send().click();
  await page.getByRole("alert").filter({ hasText: "Image content unavailable" }).waitFor();
  assert.equal((await runtime.overview()).runs.length, acceptedCount);
  results.push(
    "Session isolation and reload: uncaptured bytes are explicitly unavailable, never silently dropped",
  );
  // 本地控制协议模拟一个可取消的运行，实际 run/turn/lease/cancel 状态仍由生产 owner 维护。
  await control("start");
  await page.waitForFunction(async () => {
    const r = await fetch("/__image_test", {
      method: "POST",
      body: JSON.stringify({ method: "timeline", args: ["chat"] }),
    });
    return (await r.json()).runs.some((run: any) => run.state === "running");
  });
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await control("start");
  await page.waitForFunction(async () => {
    const r = await fetch("/__image_test", {
      method: "POST",
      body: JSON.stringify({ method: "timeline", args: ["chat"] }),
    });
    return (await r.json()).runs.some((run: any) => run.state === "cancelled");
  });
  results.push("Queued image run enters running state; original Stop owner confirms cancellation");
  assert.deepEqual(errors, []);
  const output = join(repo, "test-results", "studio-image-browser");
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: join(output, "composer.png") });
  await writeFile(
    join(output, "results.json"),
    JSON.stringify(
      {
        results,
        pageErrors: errors,
        syntheticPixels: [...pixels],
        pngSha256: captured.sha256,
        transport: "production public command/timeline",
        runtime: "real SQLite owner",
        desktop: "not exercised",
        provider: "no paid/provider turn",
      },
      null,
      2,
    ),
  );
  console.log(results.join("\n"));
} finally {
  releaseAck?.();
  releaseOptions?.();
  await browser?.close();
  await server.close();
  await runtime.disposeAllAndWait();
  await rm(temporary, { recursive: true, force: true });
}
