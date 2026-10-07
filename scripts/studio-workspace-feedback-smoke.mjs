// SPDX-License-Identifier: Apache-2.0
// Real DiffViewer/component -> public command -> SQLite/runtime -> local kernel fixture.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import fs from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { workspaceReviewFixture } from "../packages/services/test/studio-workspace-feedback-fixture.ts";

const cleanup = [];
const f = await workspaceReviewFixture({ after: (fn) => cleanup.push(fn) });
const uiRoot = resolve("packages/ui/src");
const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    sourcefile: "workspace-feedback-browser.tsx",
    loader: "tsx",
    contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import {StudioWorkspaceFeedback} from './packages/ui/src/studio/runtime/StudioWorkspaceFeedback.tsx';
import {StudioWorkspaceReviewCard} from './packages/ui/src/studio/runtime/StudioWorkspaceReviewCard.tsx';
import {ConfirmDialogHost} from './packages/ui/src/ConfirmDialog.tsx';
import {KnorviaIntlProvider} from './packages/ui/src/i18n/IntlProvider.tsx';
const service={async timeline(target){return (await fetch('/timeline')).json();},async command(command){const response=await fetch('/command',{method:'POST',body:JSON.stringify(command)});const result=await response.json();if(!response.ok)throw new Error(result.error);return result;}};
const changes=await(await fetch('/changes')).json();
createRoot(document.getElementById('root')).render(<KnorviaIntlProvider initialLocale="en-US"><StudioWorkspaceFeedback service={service} targetId="review" runId="original" stepId="step" zh={false} onPersistenceRisk={()=>{}}>{feedback=>changes.map(change=><StudioWorkspaceReviewCard key={change.path} change={change} zh={false} busy={false} applying={false} selected={false} onToggle={()=>{}} onApply={()=>{}} feedback={feedback}/>)}</StudioWorkspaceFeedback><ConfirmDialogHost/></KnorviaIntlProvider>);`,
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
      name: "review-platform",
      setup(builder) {
        builder.onResolve({ filter: /store\/StoreProvider\.js$/ }, () => ({
          path: "store",
          namespace: "review-fixture",
        }));
        builder.onLoad({ filter: /.*/, namespace: "review-fixture" }, () => ({
          contents: `export function useKnorviaStore(selector){return selector({theme:'light',codePreviewSettings:{fontSizePx:12,lightTheme:'github-light',darkTheme:'github-dark'}});}`,
          loader: "js",
        }));
        builder.onResolve({ filter: /^@\// }, async (args) =>
          builder.resolve(resolve(uiRoot, args.path.slice(2)), {
            kind: args.kind,
            resolveDir: uiRoot,
          }),
        );
      },
    },
  ],
});
const source = bundle.outputFiles[0].text;
const server = createServer(async (request, response) => {
  try {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/command") {
      let body = "";
      for await (const chunk of request) body += chunk;
      const result = await f.service.command(JSON.parse(body));
      response.end(JSON.stringify(result));
      f.service.tick();
    } else if (request.url === "/timeline")
      response.end(JSON.stringify(await f.service.timeline("review")));
    else if (request.url === "/changes")
      response.end(
        JSON.stringify(await f.service.workspaceChanges({ runId: "original", stepId: "step" })),
      );
    else if (request.url === "/app.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end(source);
    } else {
      response.setHeader("Content-Type", "text/html");
      response.end(
        '<html><head><style>body{font:14px sans-serif;padding:24px;}textarea{display:block;width:90%;min-height:60px;}button{margin:5px;}[data-diff-viewer]{min-height:100px;max-width:1000px;}pre{white-space:pre-wrap;}</style></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>',
      );
    }
  } catch (error) {
    response.statusCode = 400;
    response.end(JSON.stringify({ error: error.message }));
  }
});
let browser;
try {
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  browser = await chromium.launch({
    executablePath: process.argv[2] ?? "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const url = `http://127.0.0.1:${server.address().port}`;
  const expand = async () => {
    await page.getByRole("button", { name: "a.txt · Modified", exact: true }).click();
    await page.locator('[data-gutter] [data-line-type="change-addition"]').waitFor();
  };
  await page.goto(url);
  await expand();
  await page
    .locator('[data-gutter] [data-line-type="change-addition"][data-column-number="2"]')
    .click();
  const editor = page.getByRole("textbox", { name: "Inline comment", exact: true });
  await editor.waitFor();
  await editor.fill("Please correct this exact line.");
  await page.reload();
  await expand();
  await editor.waitFor();
  assert.equal(await editor.inputValue(), "Please correct this exact line.");
  assert.equal(f.calls.length, 0);
  await page.getByRole("button", { name: "Save comments", exact: true }).click();
  await page.getByText("Saved to Host", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Preview feedback", exact: true }).click();
  await page.locator("[data-review-summary]").waitFor();
  await page.getByRole("button", { name: "Return to original Agent", exact: true }).click();
  await page.getByRole("button", { name: /^Cancel/ }).click();
  assert.equal(f.calls.length, 0);
  await fs.writeFile(join(f.source, "a.txt"), "user changed source\n");
  await page.getByRole("button", { name: "Return to original Agent", exact: true }).click();
  await page.getByRole("button", { name: /^Confirm and send/ }).click();
  await page.getByRole("alert").filter({ hasText: "批注文件已变化" }).waitFor();
  assert.equal(f.calls.length, 0);
  await fs.writeFile(join(f.source, "a.txt"), "dirty source\nold\n");
  await page.getByRole("button", { name: "Return to original Agent", exact: true }).click();
  await page.getByRole("button", { name: /^Confirm and send/ }).click();
  await page.locator("[data-review-delivery]").waitFor();
  // UI 回执只表示入队；浏览器测试必须等待真实 adapter 调用，不能把受理当成已经派发。
  const dispatchDeadline = Date.now() + 10000;
  while (f.calls.length === 0 && Date.now() < dispatchDeadline) await sleep(10);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].nativeSessionId, "native-original");
  assert.equal(f.calls[0].kernel, "codex");
  assert.equal(f.calls[0].workspacePath, f.working);
  while (
    (await f.service.timeline("review")).reviewDrafts[0].lastDelivery.state !== "succeeded" &&
    Date.now() < dispatchDeadline
  )
    await sleep(10);
  assert.equal(
    (await f.service.timeline("review")).reviewDrafts[0].lastDelivery.state,
    "succeeded",
  );
  await page.reload();
  await page.locator("[data-review-delivery]").waitFor();
  assert.equal(f.calls.length, 1);
  assert.equal(await fs.readFile(join(f.source, "a.txt"), "utf8"), "dirty source\nold\n");
  await expand();
  await editor.fill("Retain this text after a concurrent delete.");
  const draft = (await f.service.timeline("review")).reviewDrafts[0];
  await f.service.command({
    type: "workspace-review",
    action: "delete-comment",
    commandId: crypto.randomUUID(),
    runId: "original",
    stepId: "step",
    draftId: draft.id,
    baseRevision: draft.revision,
    commentId: draft.comments[0].id,
  });
  await page.getByRole("button", { name: "Reload comments", exact: true }).click();
  const orphan = page.getByRole("textbox", {
    name: "Local draft for deleted comment",
    exact: true,
  });
  await orphan.waitFor();
  assert.equal(await orphan.inputValue(), "Retain this text after a concurrent delete.");
  await page.getByRole("button", { name: "Discard local edit", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Discard local edit/ })
    .click();
  await orphan.waitFor({ state: "detached" });
  assert.equal(f.calls.length, 1);
  assert.deepEqual(errors, []);
  console.log(
    "Workspace feedback browser smoke passed: real diff line selection, edit reload/save, cancel, stale source, original-session dispatch once, concurrent-delete draft retention and explicit discard",
  );
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
  for (const finish of cleanup.reverse()) await finish();
}
