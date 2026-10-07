// Synthetic services only: mounts the real handoff UI, store, draft builder and V4 transport.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, transformWithEsbuild } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidence = resolve(
  process.env.KNORVIA_HANDOFF_EVIDENCE_DIR || resolve(tmpdir(), "knorvia-handoff-ui"),
);
const executablePath =
  process.argv[2] ||
  process.env.KNORVIA_CHROMIUM_EXECUTABLE ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : chromium.executablePath());
const entry = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { StudioSessionActions } from '/packages/ui/src/studio/agents/StudioSessionActions.tsx';
import { studioAgentStore } from '/packages/ui/src/store/studioAgentStore.ts';
import { V4_WIRE_PROTOCOL_VERSION } from '@knorvia/shared/protocol-v4';
import '/packages/ui/src/styles.css';
const fixture = window.handoffFixture = { source: 'source', tail: false, failSend: true, nativeFail: true,
  missing: false, commands: [], nativeCommands: [], navigations: [], delayReference: false,
  delayNative: false, release: null };
const fileService = {
  async resolvePath({path}) {
    if (fixture.delayReference && path !== 'C:/project') { fixture.delayReference = false; await new Promise(resolve => { fixture.release = resolve; }); }
    if (fixture.missing && path.endsWith('report.pdf')) throw new Error('missing');
    if (path.endsWith('outside.txt')) return 'C:/other/file';
    return path;
  },
  async stat({path}) { return { path, type: 'file' }; }
};
const agentService = {
  async helloConversationV4() { return { kind: 'hello', protocolVersion: V4_WIRE_PROTOCOL_VERSION,
    connectionId: 'fixture', clientMode: 'desktop-continuous', deliveryProfile: 'continuous', serverTime: Date.now(),
    capabilities: { nativeDialogs: true, localTerminal: true, binaryFrames: false, compression: 'none',
      workspaceHookReview: true, independentPlanState: true }, auth: {} }; },
  async initializeConversationV4() {},
  async sendConversationCommandV4({envelope}) {
    fixture.nativeCommands.push(envelope);
    if (fixture.nativeFail) { fixture.nativeFail = false; throw new Error('native reply lost'); }
    if (fixture.delayNative) await new Promise(resolve => { fixture.release = resolve; });
    return { commandId: envelope.commandId, status: 'duplicate', revisionAtDecision: 1,
      result: { type: 'createSession', sessionId: 'native-target' } };
  }
};
window.handoffServices = { agentService, fileService };
const service = { async command(command) {
  fixture.commands.push(command);
  if (command.type === 'send' && fixture.failSend) { fixture.failSend = false; await new Promise(resolve => setTimeout(resolve, 200)); throw new Error('external reply lost'); }
  return { id: command.id || command.targetId, revision: 1 };
} };
const statuses = ['codex', 'claude-code', 'knorvia'].map(id => ({ id, installed: true, origin: 'external',
  capabilities: {resume:true, approval:true, questions:true, readOnly:true, fullAccess:true} }));
function App() {
  const [, render] = useState(0);
  window.refreshHandoffFixture = () => render(n => n+1);
  const messages = fixture.tail ? Array.from({length: 60}, (_, i) => ({
    id: 'tail-'+i, sequence: i+100, targetId: fixture.wrongScope ? 'other' : fixture.source, runId: 'run', sender: 'codex',
    kind: 'text', text: 'Later progress '+i, createdAt: i+100, updatedAt: i+100,
  })) : [{ id: 'original', sequence: 1, targetId: fixture.wrongScope ? 'other' : fixture.source, runId: 'run', sender: 'user',
    kind: 'text', text: fixture.source === 'source' ? 'Original goal: preserve customer data.' : 'Second task objective.', createdAt:1, updatedAt:1 }];
  return <StudioSessionActions service={service} messages={messages} sourceKernel="codex" sourceSessionId={fixture.source}
    workspacePath="C:/project" historyStartKnown={!fixture.tail} title="Fixture" statuses={statuses}
    exportTranscript={async () => 'fixture transcript'}
    onHandoffComplete={(kernel,id) => fixture.navigations.push({kernel,id})}
    onNativeHandoffComplete={(id) => fixture.navigations.push({kernel:'knorvia',id})} />;
}
window.inspectHandoffStore = () => studioAgentStore.getState().handoffs;
createRoot(document.getElementById('root')).render(<App />);
`;
const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  cacheDir: resolve(tmpdir(), "knorvia-handoff-vite-cache"),
  resolve: {
    alias: [
      {
        find: "@knorvia/shared/protocol-v4",
        replacement: resolve(root, "packages/shared/src/protocol-v4/index.ts"),
      },
      { find: /^@knorvia\/shared$/, replacement: resolve(root, "packages/shared/src/index.ts") },
      { find: "@", replacement: resolve(root, "packages/ui/src") },
    ],
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "handoff-offline-fixture",
      enforce: "pre",
      resolveId(id) {
        if (id === "/handoff-harness.tsx") return "\0handoff-harness.tsx";
      },
      async load(id) {
        if (id === "\0handoff-harness.tsx")
          return (
            await transformWithEsbuild(entry, resolve(root, "handoff-harness.tsx"), {
              loader: "tsx",
              jsx: "automatic",
            })
          ).code;
      },
      transform(_code, id) {
        const path = id.replaceAll("\\", "/");
        if (path.endsWith("/hooks/useWorkspaceServices.tsx"))
          return "export function useBaseWorkspaceServices() { return window.handoffServices; }";
        if (path.endsWith("/hooks/usePlatform.tsx"))
          return "export function usePlatform() { return {}; }";
        if (path.endsWith("/i18n/IntlProvider.tsx"))
          return "export function useKnorviaIntl() { return { locale: 'en-US' }; }";
      },
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          if (request.url !== "/") return next();
          response.setHeader("Content-Type", "text/html");
          response.end(
            await server.transformIndexHtml(
              "/",
              '<!doctype html><html><body><div id="root"></div><script type="module" src="/handoff-harness.tsx"></script></body></html>',
            ),
          );
        });
      },
    },
  ],
  server: { host: "127.0.0.1", port: 0 },
});
let browser;
const results = [];
try {
  await server.listen();
  const address = server.httpServer.address();
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });
  page.setDefaultTimeout(30_000);
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error(error.message);
  });
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort(),
  );
  await page.goto(`http://127.0.0.1:${address.port}/`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  console.log("Synthetic handoff fixture loaded");
  const open = () => page.getByRole("button", { name: "Hand off", exact: true }).click();
  const preview = () => page.getByLabel("Editable summary", { exact: true });
  const choose = async (name) => {
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name, exact: true }).click();
  };
  const fixture = (work) => page.evaluate(work);
  await open();
  console.log("Handoff preview opened");
  await preview().waitFor();
  assert.match(await preview().inputValue(), /Original goal: preserve customer data/);
  assert.equal(await fixture(() => window.handoffFixture.commands.length), 0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await fixture(() => window.handoffFixture.commands.length), 0);
  await fixture(() => {
    window.handoffFixture.tail = true;
    window.refreshHandoffFixture();
  });
  await open();
  assert.match(await preview().inputValue(), /Original goal: preserve customer data/);
  assert.match(await preview().inputValue(), /omitted count unknown/);
  await page.getByText("Durable task notes (saved locally)", { exact: true }).click();
  await page.getByLabel("Constraints", { exact: true }).fill("No mobile; preserve all drafts.");
  await page
    .getByLabel("Relative file / artifact paths (one per line, max 20)")
    .fill("report.pdf\noutside.txt\n.env");
  await page
    .getByRole("button", { name: "Save task notes and refresh preview", exact: true })
    .click();
  await page.waitForFunction(() =>
    document.querySelector('textarea[maxlength="20000"]').value.includes("No mobile"),
  );
  assert.match(await preview().inputValue(), /references omitted 2/);
  await page.getByText("Durable task notes (saved locally)", { exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload();
  await fixture(() => {
    window.handoffFixture.tail = true;
    window.refreshHandoffFixture();
  });
  await open();
  assert.match(await preview().inputValue(), /No mobile; preserve all drafts/);
  results.push(
    "PASS persisted original goal and user constraints survive tail-only reload; cancel sends zero commands",
  );
  console.log(results.at(-1));
  await choose("Claude Code");
  await fixture(() => {
    window.handoffFixture.missing = true;
  });
  await page.getByRole("button", { name: "Confirm and send", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "References changed" }).waitFor();
  assert.equal(await fixture(() => window.handoffFixture.commands.length), 0);
  await page
    .getByRole("button", { name: "Refresh preview (replace full-text edits)", exact: true })
    .click();
  await page.waitForFunction(() => !document.querySelector('textarea[maxlength="20000"]').disabled);
  assert.equal((await preview().inputValue()).includes("report.pdf"), false);
  await preview().fill("Reviewed handoff. API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456");
  assert.equal((await preview().inputValue()).includes("sk-abcdefghijklmnopqrstuvwxyz"), false);
  await page.getByRole("button", { name: "Confirm and send", exact: true }).dblclick();
  await page.getByRole("alert").filter({ hasText: "external reply lost" }).waitFor();
  await page.getByRole("button", { name: "Retry handoff", exact: true }).click();
  await page.waitForFunction(() => window.handoffFixture.navigations.length === 1);
  const commands = await fixture(() => window.handoffFixture.commands);
  assert.equal(commands.length, 4);
  assert.equal(commands[0].commandId, commands[2].commandId);
  assert.equal(commands[1].commandId, commands[3].commandId);
  assert.equal(commands[1].text, "Reviewed handoff. API_KEY=[redacted]");
  results.push(
    "PASS stale references block submission; full preview edits redact; duplicate confirmation and external retry reuse commands",
  );
  console.log(results.at(-1));
  await open();
  await choose("Knorvia");
  await page.getByRole("button", { name: "Confirm and send", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "native reply lost" }).waitFor();
  await page.getByRole("button", { name: "Retry handoff", exact: true }).click();
  await page.waitForFunction(() => window.handoffFixture.navigations.length === 2);
  const native = await fixture(() => window.handoffFixture.nativeCommands);
  assert.equal(native.length, 2);
  assert.deepEqual(native[0], native[1]);
  results.push(
    "PASS native retry uses unchanged V4 createSession(firstInput) and duplicate ACK navigation",
  );
  console.log(results.at(-1));
  await open();
  await choose("Knorvia");
  await fixture(() => {
    window.handoffFixture.delayNative = true;
  });
  await page.getByRole("button", { name: "Confirm and send", exact: true }).click();
  await page.waitForFunction(() => typeof window.handoffFixture.release === "function");
  await fixture(() => {
    window.handoffFixture.source = "second";
    window.handoffFixture.tail = false;
    window.refreshHandoffFixture();
  });
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await fixture(() => {
    window.handoffFixture.release();
  });
  await open();
  assert.match(await preview().inputValue(), /Second task objective/);
  assert.equal((await preview().inputValue()).includes("Original goal"), false);
  assert.equal(await fixture(() => window.handoffFixture.navigations.length), 2);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await fixture(() => {
    Object.assign(window.handoffFixture, {
      source: "source",
      tail: true,
      missing: false,
      delayNative: false,
      release: null,
    });
    window.refreshHandoffFixture();
  });
  await open();
  await choose("Claude Code");
  await fixture(() => {
    window.handoffFixture.delayReference = true;
  });
  await page.getByRole("button", { name: "Confirm and send", exact: true }).click();
  await page.waitForFunction(() => typeof window.handoffFixture.release === "function");
  await fixture(() => {
    window.handoffFixture.source = "third";
    window.handoffFixture.tail = false;
    window.refreshHandoffFixture();
  });
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await fixture(() => {
    window.handoffFixture.release();
  });
  await open();
  assert.equal(await fixture(() => window.handoffFixture.commands.length), commands.length);
  assert.equal((await preview().inputValue()).includes("Original goal"), false);
  await page.setViewportSize({ width: 1360, height: 760 });
  await page.getByText("Durable task notes (saved locally)", { exact: true }).click();
  const cancelBox = await page.getByRole("button", { name: "Cancel", exact: true }).boundingBox();
  assert.ok(cancelBox.y >= 0 && cancelBox.y + cancelBox.height <= 760);
  results.push(
    "PASS scope change during reference recheck sends zero commands; expanded task editor keeps actions in the desktop viewport",
  );
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: resolve(evidence, "handoff-preview.png"), fullPage: true });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await fixture(() => {
    window.handoffFixture.wrongScope = true;
    window.handoffFixture.source = "wrong-scope";
    window.refreshHandoffFixture();
  });
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Hand off",
      )?.disabled,
  );
  results.push(
    "PASS source conversation change suppresses late native ACK, excludes other task context and disables handoff for unrelated messages",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(evidence, "results.json"),
    JSON.stringify(
      {
        results,
        errors,
        externalCommands: commands.length,
        nativeRetryCommands: native.length,
        totalNativeCommands: await fixture(() => window.handoffFixture.nativeCommands.length),
      },
      null,
      2,
    ),
  );
  for (const result of results.slice(3)) console.log(result);
  console.log(`Evidence: ${evidence}`);
} catch (error) {
  console.error(error.stack ?? String(error));
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
