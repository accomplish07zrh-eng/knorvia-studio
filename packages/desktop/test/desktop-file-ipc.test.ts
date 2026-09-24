import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock, test } from "node:test";

const handlers = new Map<string, (event: unknown, payload: unknown) => Promise<unknown>>();
let showSaveDialog: () => Promise<{ canceled: boolean; filePath: string }>;
mock.module("electron", { namedExports: {
  ipcMain: { handle: (channel: string, handler: (event: unknown, payload: unknown) => Promise<unknown>) => handlers.set(channel, handler) },
  BrowserWindow: { fromWebContents: () => null },
  dialog: { showSaveDialog: () => showSaveDialog() },
} });

test("save keeps the validated bytes across an asynchronous dialog", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "knorvia-file-ipc-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let finishDialog: ((value: { canceled: boolean; filePath: string }) => void) | undefined;
  const dialogWait = new Promise<{ canceled: boolean; filePath: string }>((resolve) => { finishDialog = resolve; });
  showSaveDialog = () => dialogWait;
  const { PlatformChannels } = await import("@knorvia/shared");
  const { registerDesktopSaveFileIpcHandler } = await import("../src/main/desktopSaveFile.js");
  registerDesktopSaveFileIpcHandler({ warn() {} });
  const handler = handlers.get(PlatformChannels.SaveFile);
  assert.ok(handler);
  const original = Uint8Array.from([1, 2, 3]).buffer;
  const payload = { suggestedName: "snapshot.bin", data: original };
  const result = handler({ sender: { id: 1 } }, payload);
  payload.data = Uint8Array.from([9, 9, 9]).buffer;
  finishDialog?.({ canceled: false, filePath: join(dir, "snapshot.bin") });
  assert.deepEqual(await result, { success: true, path: join(dir, "snapshot.bin") });
  assert.deepEqual([...await readFile(join(dir, "snapshot.bin"))], [1, 2, 3]);
  assert.deepEqual(await handler({ sender: { id: 1 } }, { suggestedName: "blocked.bin", sourceUrl: "http://127.0.0.1/secret" }), { success: false, error: "remote_address_not_allowed" });
});

test("PDF export returns exact bytes from a pooled Buffer view", async () => {
  const { PlatformChannels } = await import("@knorvia/shared");
  const { registerDesktopPrintToPdfIpcHandler } = await import("../src/main/desktopPrintToPdf.js");
  registerDesktopPrintToPdfIpcHandler({ warn() {} });
  const handler = handlers.get(PlatformChannels.PrintToPdf);
  assert.ok(handler);
  const pool = Buffer.allocUnsafe(4096);
  pool.fill(0);
  pool.set([37, 80, 68, 70, 45], 32);
  const result = await handler({ sender: { id: 7, printToPDF: async () => pool.subarray(32, 37) } });
  assert.ok(result && typeof result === "object" && "success" in result && result.success === true && "data" in result && result.data instanceof ArrayBuffer);
  assert.deepEqual([...new Uint8Array(result.data)], [37, 80, 68, 70, 45]);
  assert.equal(result.data.byteLength, 5);
});
