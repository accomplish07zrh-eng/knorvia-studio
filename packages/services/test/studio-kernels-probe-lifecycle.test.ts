import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { ManagedKernels } from "../src/studio-runtime/adapters/kernels/managedKernels.js";
import { createStudioKernelRegistry } from "../src/studio-runtime/adapters/kernels/kernelRegistry.js";
import { hashFile } from "../src/studio-runtime/adapters/kernels/installSource.js";
import { captureVersion } from "../src/studio-runtime/adapters/kernels/processTransport.js";
import { probeErrorCode } from "../src/studio-runtime/adapters/kernels/probeResult.js";

test("a managed version probe holds a lease and disposal terminates only that probe before returning", async () => {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-probe-lifecycle-"));
  const marker = join(directory, "probe.pid");
  const manager = new ManagedKernels(
    directory,
    () => false,
    async (_kernel, stage) => {
      const executable = join(stage, "fixture.cjs");
      await writeFile(
        executable,
        `const fs=require('node:fs');if(__dirname.includes('.staging-')){console.log('fixture 1.2.3');}else{fs.writeFileSync(${JSON.stringify(marker)},String(process.pid));setInterval(()=>{},1000);}`,
      );
      return { version: "1.2.3", executable: "fixture.cjs", sha256: await hashFile(executable) };
    },
  );
  const registry = createStudioKernelRegistry({
    dataDir: directory,
    builtin: {
      async run() {
        return { status: "succeeded", resultKnown: true, text: "" };
      },
    },
  });
  let probing: ReturnType<typeof registry.inspect> | undefined;
  try {
    await manager.manage("codex", "install");
    const path = (await manager.current("codex"))!.path;
    const missing = { executablePath: join(directory, "missing"), permission: "ask" as const };
    probing = registry.inspect({
      knorvia: missing,
      codex: { ...missing, executablePath: path },
      "claude-code": missing,
      "grok-build": missing,
    });
    const deadline = Date.now() + 5000;
    let pid = 0;
    while (!pid) {
      try {
        pid = Number(await readFile(marker, "utf8"));
      } catch {}
      if (Date.now() > deadline) throw new Error("probe did not start");
      if (!pid) await sleep(10);
    }
    await assert.rejects(manager.manage("codex", "uninstall"), /运行|使用|内核管理操作正在执行/);
    await registry.dispose();
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    const statuses = await probing;
    const status = statuses.find((entry) => entry.id === "codex")!;
    assert.equal(status.installed, false);
    // 取消不再被折叠成泛化失败：定位证据保留，版本段给出取消代码。
    assert.equal(status.probe?.stages.locate.status, "ok");
    assert.equal(status.probe?.stages.version.status, "cancelled");
    assert.equal(status.probe?.stages.version.code, "version.cancelled");
    assert.equal(status.origin, "managed");
    await manager.manage("codex", "uninstall");
    await assert.rejects(readFile(path), { code: "ENOENT" });
  } finally {
    await Promise.all([manager.dispose(), registry.dispose()]);
    await probing;
  }
});

test("an already cancelled version check never starts the executable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-probe-cancelled-"));
  const marker = join(directory, "unexpected.txt");
  const script = join(directory, "fixture.cjs");
  await writeFile(script, `require('node:fs').writeFileSync(${JSON.stringify(marker)},'spawned')`);
  await assert.rejects(
    captureVersion(
      { path: script, command: process.execPath, args: [script] },
      AbortSignal.abort(),
    ),
    /abort/i,
  );
  await sleep(50);
  await assert.rejects(readFile(marker), { code: "ENOENT" });
});

test("版本探测的取消与超时是不同代码，超时不再冒充普通失败", async () => {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-probe-codes-"));
  const hanging = join(directory, "hang.cjs");
  await writeFile(hanging, "process.stdin.resume();setInterval(()=>{},1000);");
  const executable = { path: hanging, command: process.execPath, args: [hanging] };
  try {
    const controller = new AbortController();
    const probing = captureVersion(executable, controller.signal);
    setTimeout(() => controller.abort(), 60);
    const cancelled = await probing.catch((error: unknown) => error);
    assert.equal(probeErrorCode(cancelled), "version.cancelled");

    const timedOut = await captureVersion(executable, undefined, undefined, 60).catch(
      (error: unknown) => error,
    );
    assert.equal(probeErrorCode(timedOut), "version.timeout");
    assert.notEqual(probeErrorCode(cancelled), probeErrorCode(timedOut));
    assert.match(String((timedOut as Error).message), /超时/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
