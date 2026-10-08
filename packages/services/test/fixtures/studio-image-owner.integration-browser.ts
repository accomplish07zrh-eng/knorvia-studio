// SPDX-License-Identifier: Apache-2.0
// Independent actual hook/store browser acceptance; synthetic services and image only.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { independentImages } from "./studio-independent-images.integration.js";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const require = createRequire(join(repo, "packages/desktop/package.json"));
const { build } = require("esbuild");
const { chromium } = require("playwright-core");
const ui = resolve(repo, "packages/ui/src");
const data = (await independentImages()).baselinePng!;
const input = {
  id: "owned-image",
  filename: "owned.png",
  mimeType: data.mime,
  sizeBytes: data.bytes,
  width: data.width,
  height: data.height,
  sha256: data.sha256,
  dataBase64: data.dataBase64,
};
const compiled = await build({
  stdin: {
    resolveDir: repo,
    sourcefile: "independent-image-host-owner.tsx",
    loader: "tsx",
    contents: `
import React,{useRef,useState} from 'react';import{createRoot}from'react-dom/client';
import{useStudioChatImages}from'./packages/ui/src/studio/agents/useStudioChatImages.tsx';
import{studioAgentStore,useStudioAgentStore}from'./packages/ui/src/store/studioAgentStore.ts';
const id='same-target',cid='same-command';const image=${JSON.stringify(input)};
const hostA={timeline:async()=>({runs:[],messages:[],interactions:[]})};
const hostB={timeline:async()=>({runs:[],messages:[],interactions:[],admission:{commandId:cid,runId:'host-b-run'}})};
if(!sessionStorage.getItem('independent-owner-seeded')){
 studioAgentStore.getState().setDraftImages(id,'codex',[image],hostA);
 studioAgentStore.getState().sealImageSubmission(id,hostA,{commandId:cid,type:'send',kind:'chat',targetId:id,text:'',attachments:[image]});
 sessionStorage.setItem('independent-owner-seeded','1');
}
function Fixture(){const[other,setOther]=useState(false);const mounted=useRef(true);const draft=useStudioAgentStore(s=>s.drafts[id]);
 const runtime={service:other?hostB:hostA,connectionKey:other?2:1,overview:{runs:other?[{id:'host-b-run',targetId:id,admissionCommandId:cid}]:[]}};
 useStudioChatImages({sessionId:id,kernelId:'codex',workspacePath:'/synthetic/shared-path',selection:{model:'vision'},config:{permission:'read-only',executablePath:''},modelOptions:{options:{models:[{id:'vision',label:'Vision',reasoning:[],inputModalities:['text','image']}]}},runtime,draft,zh:false,mounted,setError:()=>{}});
 Object.assign(window,{independentOwner:{draft:()=>studioAgentStore.getState().drafts[id]}});
 return <><button onClick={()=>setOther(true)}>Switch execution Host</button><p data-host>{other?'b':'a'}</p><p data-count>{draft?.images?.length??0}</p><p data-pending>{draft?.imageSubmission?'pending':'clear'}</p></>;
}createRoot(document.getElementById('root')).render(<Fixture/>);`,
  },
  bundle: true,
  write: false,
  outfile: join(repo, "test-results/studio-image-owner-integration/app.js"),
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  tsconfig: resolve(repo, "packages/ui/tsconfig.json"),
  logLevel: "silent",
  plugins: [
    {
      name: "independent-alias",
      setup(b) {
        b.onResolve({ filter: /\?url$/ }, (args) => ({
          path: args.path,
          namespace: "unused-fixture-url",
        }));
        b.onLoad({ filter: /.*/, namespace: "unused-fixture-url" }, () => ({
          contents: 'export default "/unused-pdf-worker";',
          loader: "js",
        }));
        b.onResolve({ filter: /^@\// }, async (args) =>
          b.resolve(resolve(ui, args.path.slice(2)), { kind: args.kind, resolveDir: ui }),
        );
      },
    },
  ],
});
const server = createServer((req, res) => {
  if (req.url === "/app.js") {
    res.setHeader("content-type", "text/javascript");
    res.end(compiled.outputFiles[0].text);
  } else {
    res.setHeader("content-type", "text/html");
    res.end(
      '<html><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>',
    );
  }
});
let browser;
try {
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${(server.address() as any).port}`);
  await page.locator("[data-pending]").filter({ hasText: "pending" }).waitFor({ timeout: 5000 });
  assert.equal(await page.locator("[data-count]").textContent(), "1");
  await page.getByRole("button", { name: "Switch execution Host" }).click();
  await page.locator("[data-host]").filter({ hasText: "b" }).waitFor({ timeout: 5000 });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const state = await page.evaluate(() => ({
    count: (window as any).independentOwner.draft()?.images?.length,
    pending: !!(window as any).independentOwner.draft()?.imageSubmission,
  }));
  assert.deepEqual(errors, []);
  assert.equal(
    state.count,
    1,
    "Another Host with the same target/CID must not clear the original owned image",
  );
  assert.equal(
    state.pending,
    true,
    "Another Host cannot acknowledge the pending original Host submission",
  );
  assert.equal(
    await page.evaluate(() =>
      Object.values(localStorage).some((value) => value.includes("dataBase64")),
    ),
    false,
    "Durable UI metadata must not include screenshot bytes",
  );
  await page.reload();
  await page.locator("[data-pending]").filter({ hasText: "pending" }).waitFor({ timeout: 5000 });
  assert.equal(await page.locator("[data-count]").textContent(), "1");
  assert.equal(
    await page.evaluate(() => !!(window as any).independentOwner.draft()?.images?.[0]?.dataBase64),
    false,
    "Reload restores metadata, not the lost in-memory screenshot",
  );
  await page.getByRole("button", { name: "Switch execution Host" }).click();
  await page.locator("[data-host]").filter({ hasText: "b" }).waitFor({ timeout: 5000 });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const restored = await page.evaluate(() => ({
    count: (window as any).independentOwner.draft()?.images?.length,
    pending: !!(window as any).independentOwner.draft()?.imageSubmission,
  }));
  assert.equal(
    restored.count,
    1,
    "A different Host cannot clear metadata after the original in-memory owner is lost",
  );
  assert.equal(
    restored.pending,
    true,
    "An unknown original Host cannot be acknowledged by a CID collision after reload",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Original Host draft and reloaded pending metadata survived different Host target/CID collisions",
  );
} finally {
  await browser?.close();
  await new Promise<void>((done) => server.close(() => done()));
}
