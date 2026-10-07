// SPDX-License-Identifier: Apache-2.0
// Run with: node --import tsx scripts/studio-workspace-runtime-smoke.mjs [chromium path]
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import {
  runtimeFixture,
  serverCommand,
} from "../packages/services/test/studio-workspace-runtime-fixture.ts";

const cleanup = [];
const f = await runtimeFixture({ after: (fn) => cleanup.push(fn) });
const workspace = await f.add("browser");
const uiRoot = resolve("packages/ui/src");
const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    sourcefile: "workspace-runtime-browser.tsx",
    loader: "tsx",
    contents: `import React from 'react';
import {createRoot} from 'react-dom/client';
import {StudioWorkspaceRuntimeCard} from './packages/ui/src/studio/runtime/StudioWorkspaceRuntimeCard.tsx';
import {ConfirmDialogHost} from './packages/ui/src/ConfirmDialog.tsx';
import {KnorviaIntlProvider} from './packages/ui/src/i18n/IntlProvider.tsx';
createRoot(document.getElementById('root')).render(<KnorviaIntlProvider initialLocale="en-US"><StudioWorkspaceRuntimeCard runId="browser" stepId="step"/><ConfirmDialogHost/></KnorviaIntlProvider>);`,
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  tsconfig: "packages/ui/tsconfig.json",
  logLevel: "silent",
  plugins: [
    {
      name: "runtime-test-transport",
      setup(builder) {
        builder.onResolve({ filter: /useWorkspaceServices\.js$/ }, () => ({
          path: "runtime-service",
          namespace: "runtime-fixture",
        }));
        builder.onLoad({ filter: /.*/, namespace: "runtime-fixture" }, () => ({
          contents: `
const service = {onDidChange: () => ({dispose() {}}), async workspaceRuntime(params) {
const response = await fetch('/runtime', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(params)});
const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
}};
export function useBaseWorkspaceServices() { return {studioRuntimeService: service}; }`,
          loader: "js",
        }));
        builder.onResolve({ filter: /^@\// }, async (args) => {
          const location = resolve(uiRoot, args.path.slice(2));
          return builder.resolve(location, { kind: args.kind, resolveDir: uiRoot });
        });
      },
    },
  ],
});
const source = bundle.outputFiles[0].text;
const server = createServer(async (request, response) => {
  if (request.url === "/runtime" && request.method === "POST") {
    try {
      let body = "";
      for await (const chunk of request) body += chunk;
      const state = await f.owner.request(JSON.parse(body));
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(state));
    } catch (error) {
      response.statusCode = 400;
      response.end(JSON.stringify({ error: error.message }));
    }
  } else if (request.url === "/app.js") {
    response.setHeader("Content-Type", "text/javascript");
    response.end(source);
  } else
    response.end(
      '<html><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>',
    );
});
let browser;
try {
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  browser = await chromium.launch({
    executablePath: process.argv[2] ?? "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}`);
  await page.getByText("Workspace runtime", { exact: true }).click();
  const state = page.getByTestId("studio-workspace-runtime-status");
  await state.getByText("Environment not prepared", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Prepare environment", exact: true }).click();
  await page.getByRole("dialog").getByText(workspace.working, { exact: false }).waitFor();
  await page.getByRole("button", { name: /^Cancel/ }).click();
  assert.equal((await workspace.request()).phase, "idle");
  await page.getByLabel("Runtime executable", { exact: true }).fill(process.execPath);
  await page
    .getByLabel("Runtime arguments (JSON array)")
    .fill(JSON.stringify(["-e", "process.exit(9)"]));
  await page.getByRole("button", { name: "Prepare environment", exact: true }).click();
  await page.getByRole("button", { name: /^Allow once/ }).click();
  await state.getByText("Runtime failed", { exact: true }).waitFor();
  await page
    .getByText("Setup failed. Review the command and prepare again.", { exact: true })
    .waitFor();
  assert(await page.getByRole("button", { name: "Start service", exact: true }).isDisabled());
  await page.getByRole("button", { name: "Prepare environment", exact: true }).click();
  await page.getByRole("button", { name: /^Allow once/ }).click();
  await state.getByText("Environment prepared", { exact: true }).waitFor();
  await page.getByLabel("Runtime executable", { exact: true }).fill(serverCommand.executable);
  await page.getByLabel("Runtime arguments (JSON array)").fill(JSON.stringify(serverCommand.args));
  await page.getByRole("button", { name: "Start service", exact: true }).click();
  await page.getByRole("button", { name: /^Allow once/ }).click();
  await state.getByText("Service ready", { exact: true }).waitFor();
  const preview = page.getByTestId("studio-workspace-runtime-preview");
  const url = await preview.getAttribute("href");
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  assert.equal((await context.request.get(url)).status(), 200);
  await page.getByRole("button", { name: "Stop runtime", exact: true }).click();
  await state.getByText("Runtime stopped", { exact: true }).waitFor();
  assert.equal(await preview.count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "Workspace runtime browser smoke passed: cancel approval, setup failure, prepare, owned preview, stop",
  );
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
  for (const finish of cleanup.reverse()) await finish();
}
