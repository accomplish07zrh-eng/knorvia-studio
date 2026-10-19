// SPDX-License-Identifier: Apache-2.0
// kernel-dsh-00 B12/B13/B14/B18/B19：就绪标记、生命周期、失败语义、单次启动与日志。
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { loadKernel } from "./entry.mjs";
import { recordingLogger, silentLogger } from "./_kernel.mjs";
import {
  KERNEL_FAILED,
  KERNEL_READY,
  makeTempDir,
  removeTempDir,
  withTimeout,
} from "./_process.mjs";

function captureStream() {
  let text = "";
  const waiters = new Set();
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      text += chunk.toString("utf8");
      for (const check of [...waiters]) check();
      callback();
    },
  });
  return {
    stream,
    get text() {
      return text;
    },
    waitFor(needle, timeoutMs = 60_000) {
      if (text.includes(needle)) return Promise.resolve();
      return new Promise((resolveWait, rejectWait) => {
        const check = () => {
          if (!text.includes(needle)) return;
          clearTimeout(timer);
          waiters.delete(check);
          resolveWait();
        };
        const timer = setTimeout(() => {
          waiters.delete(check);
          rejectWait(
            new Error(
              `timed out waiting for ${JSON.stringify(needle)}; text=${JSON.stringify(text)}`,
            ),
          );
        }, timeoutMs);
        waiters.add(check);
      });
    },
  };
}

async function createLayout(root) {
  const workspace = join(root, "workspace");
  const home = join(root, "home");
  const dataBase = join(root, "base");
  await mkdir(workspace, { recursive: true });
  await mkdir(home, { recursive: true });
  return { workspace, home, dataBase };
}

function bootEnv(dataBase, home, extra = {}) {
  return {
    ...process.env,
    KNORVIA_DATA_BASE_DIR: dataBase,
    KNORVIA_KERNEL_ENGINE: "dsh",
    HOME: home,
    USERPROFILE: home,
    ...extra,
  };
}

function processHarness(kernel, layout, options = {}) {
  const input = new PassThrough();
  const output = captureStream();
  const stderr = captureStream();
  const signals = new EventEmitter();
  const logger = options.useDefaultLogger ? undefined : (options.logger ?? silentLogger());
  const run = kernel.runKernelProcess({
    cwd: layout.workspace,
    env: bootEnv(layout.dataBase, layout.home, options.env),
    input,
    output: output.stream,
    stderr: stderr.stream,
    signals,
    ...(logger === undefined ? {} : { logger }),
    ...(options.boot ?? {}),
  });
  return { input, output, stderr, signals, run };
}

function markerLines(text) {
  return text.split("\n").filter((line) => line.startsWith("knorvia-kernel-"));
}

test("B12 boot 成功只向 stderr 写一行就绪标记，stdout 无字节", async () => {
  const kernel = await loadKernel();
  const root = await makeTempDir("kernel-dsh-process-ready-");
  const layout = await createLayout(root);
  const harness = processHarness(kernel, layout);
  try {
    await harness.stderr.waitFor(KERNEL_READY);
    assert.equal(harness.stderr.text, `${KERNEL_READY}\n`);
    assert.equal(harness.output.text, "");
    harness.input.end();
    assert.equal(await withTimeout(harness.run, 30_000, "B12 shutdown"), 0);
    assert.equal(harness.stderr.text, `${KERNEL_READY}\n`);
    assert.equal(markerLines(harness.stderr.text).length, 1);
    assert.equal(harness.output.text, "");
  } finally {
    harness.input.destroy();
    await removeTempDir(root);
  }
});

test("B13 stdin EOF、SIGTERM 与 SIGINT 都正常退出并释放内核", async () => {
  const kernel = await loadKernel();
  for (const [index, signal] of [undefined, "SIGTERM", "SIGINT"].entries()) {
    const root = await makeTempDir(`kernel-dsh-process-life-${index}-`);
    const layout = await createLayout(root);
    const { entries, logger } = recordingLogger();
    const harness = processHarness(kernel, layout, { logger });
    try {
      await harness.stderr.waitFor(KERNEL_READY);
      if (signal === undefined) harness.input.end();
      else harness.signals.emit(signal);
      assert.equal(
        await withTimeout(harness.run, 30_000, `B13 ${signal ?? "stdin EOF"}`),
        0,
        `${signal ?? "stdin EOF"} 后应正常退出`,
      );
      const stopping = entries.filter((entry) => entry.message === "kernel.dsh.stopping");
      const stopped = entries.filter((entry) => entry.message === "kernel.dsh.stopped");
      assert.equal(stopping.length, 1);
      assert.equal(stopping[0].level, "info");
      assert.equal(stopped.length, 1);
      assert.equal(stopped[0].level, "info");

      const host = await kernel.bootKernel({
        cwd: layout.workspace,
        env: bootEnv(layout.dataBase, layout.home),
        logger: silentLogger(),
      });
      await host.dispose();
    } finally {
      harness.input.destroy();
      await removeTempDir(root);
    }
  }
});

test("B14 相对 cwd 与不可写数据根都写 config 失败行并退出 1", async () => {
  const kernel = await loadKernel();
  const root = await makeTempDir("kernel-dsh-process-config-");
  const layout = await createLayout(root);
  const blocked = join(root, "blocked");
  await writeFile(blocked, "not a directory\n");
  try {
    const relative = processHarness(kernel, { ...layout, workspace: "relative/path" });
    relative.input.end();
    assert.equal(await withTimeout(relative.run, 30_000, "B14 relative cwd"), 1);
    assert.equal(relative.output.text, "");
    const relativeLines = relative.stderr.text.split("\n").filter(Boolean);
    assert.deepEqual(relativeLines.slice(0, 1), [`${KERNEL_FAILED}config`]);
    assert.match(relativeLines[1], /^Error: .*absolute path/u);
    assert.ok(relativeLines[1].includes("relative/path"));
    assert.equal(markerLines(relative.stderr.text).length, 1);

    const unwritable = processHarness(kernel, { ...layout, dataBase: blocked });
    unwritable.input.end();
    assert.equal(await withTimeout(unwritable.run, 30_000, "B14 blocked data root"), 1);
    assert.equal(unwritable.output.text, "");
    const blockedLines = unwritable.stderr.text.split("\n").filter(Boolean);
    assert.deepEqual(blockedLines.slice(0, 1), [`${KERNEL_FAILED}config`]);
    assert.match(blockedLines[1], /^Error: /u);
    assert.equal(markerLines(unwritable.stderr.text).length, 1);

    const host = await kernel.bootKernel({
      cwd: layout.workspace,
      env: bootEnv(layout.dataBase, layout.home),
      logger: silentLogger(),
    });
    await host.dispose();
  } finally {
    await removeTempDir(root);
  }
});

test("B14 依赖解析失败写 boot 失败行并退出 1", async () => {
  const kernel = await loadKernel();
  const root = await makeTempDir("kernel-dsh-process-boot-");
  const layout = await createLayout(root);
  const emptyBase = pathToFileURL(join(root, "empty", "index.mjs")).href;
  try {
    const harness = processHarness(kernel, layout, { boot: { moduleBaseUrl: emptyBase } });
    harness.input.end();
    assert.equal(await withTimeout(harness.run, 60_000, "B14 boot failure"), 1);
    assert.equal(harness.output.text, "");
    const lines = harness.stderr.text.split("\n").filter(Boolean);
    assert.deepEqual(lines.slice(0, 1), [`${KERNEL_FAILED}boot`]);
    assert.match(lines[1], /^Error: /u);
    assert.equal(markerLines(harness.stderr.text).length, 1);

    const host = await kernel.bootKernel({
      cwd: layout.workspace,
      env: bootEnv(layout.dataBase, layout.home),
      logger: silentLogger(),
    });
    await host.dispose();
  } finally {
    await removeTempDir(root);
  }
});

test("B18 第二次 boot 立即拒绝，dispose 幂等且之后可以重新 boot", async () => {
  const kernel = await loadKernel();
  const root = await makeTempDir("kernel-dsh-process-single-");
  const layout = await createLayout(root);
  const options = {
    cwd: layout.workspace,
    env: bootEnv(layout.dataBase, layout.home),
    logger: silentLogger(),
  };
  try {
    let firstSettled = false;
    const first = kernel.bootKernel(options);
    first.then(
      () => {
        firstSettled = true;
      },
      () => {
        firstSettled = true;
      },
    );
    const second = kernel.bootKernel(options);
    const rejection = await second.then(
      () => undefined,
      (error) => error,
    );
    assert.equal(rejection?.code, "KERNEL_ALREADY_BOOTED");
    assert.equal(firstSettled, false, "后到者必须立即拒绝，不等待先到者");

    const host = await first;
    assert.equal(host.engine, "dsh");
    assert.equal(host.dshVersion, kernel.KERNEL_DSH_VERSION);
    const firstDispose = host.dispose();
    assert.equal(host.dispose(), firstDispose, "重复 dispose 返回同一 promise");
    await firstDispose;
    await host.dispose();

    const again = await kernel.bootKernel(options);
    await again.dispose();
  } finally {
    await removeTempDir(root);
  }
});

test("B19 logger 抛错不影响启动与关闭，默认日志只写 stderr 且不含环境值", async () => {
  const kernel = await loadKernel();
  const root = await makeTempDir("kernel-dsh-process-log-");
  const layout = await createLayout(root);
  const secret = "kernel-dsh-log-secret-value";
  const throwing = {
    debug() {
      throw new Error("logger debug failed");
    },
    info() {
      throw new Error("logger info failed");
    },
    warn() {
      throw new Error("logger warn failed");
    },
    error() {
      throw new Error("logger error failed");
    },
  };
  try {
    const host = await kernel.bootKernel({
      cwd: layout.workspace,
      env: bootEnv(layout.dataBase, layout.home, { KNORVIA_LOG_SENTINEL: secret }),
      logger: throwing,
    });
    await host.dispose();

    const harness = processHarness(kernel, layout, {
      env: { KNORVIA_LOG_SENTINEL: secret },
      useDefaultLogger: true,
    });
    await harness.stderr.waitFor(KERNEL_READY);
    harness.input.end();
    assert.equal(await withTimeout(harness.run, 30_000, "B19 default logger"), 0);

    const lines = harness.stderr.text.split("\n").filter(Boolean);
    for (const line of lines) {
      assert.ok(
        line === KERNEL_READY || line.startsWith("[knorvia-kernel] "),
        `默认日志行必须带前缀：${line}`,
      );
    }
    const logs = lines.filter((line) => line.startsWith("[knorvia-kernel] "));
    assert.ok(logs.some((line) => line.includes("info kernel.dsh.home")));
    assert.ok(logs.some((line) => line.includes("info kernel.dsh.stopping")));
    assert.ok(logs.some((line) => line.includes("info kernel.dsh.stopped")));
    assert.equal(
      logs.some((line) => line.startsWith("[knorvia-kernel] error ")),
      false,
    );
    assert.equal(harness.stderr.text.includes(secret), false, "日志不得记录环境变量值");
    assert.equal(harness.output.text, "");
  } finally {
    await removeTempDir(root);
  }
});

// 该用例会让模块级活动 host 标记保持占用（dispose 失败后不可再次 boot），必须放在文件末尾。
test("B13 dispose 超过 5000ms 时以 KERNEL_DISPOSE_FAILED 结束并记录 error", async () => {
  const kernel = await loadKernel();
  const root = await makeTempDir("kernel-dsh-process-dispose-");
  const layout = await createLayout(root);
  const { entries, logger } = recordingLogger();
  try {
    const host = await kernel.bootKernel({
      cwd: layout.workspace,
      env: bootEnv(layout.dataBase, layout.home),
      logger,
    });
    const original = host.context.fiber.dispose;
    host.context.fiber.dispose = () => new Promise(() => {});
    const started = Date.now();
    try {
      await assert.rejects(host.dispose(), (error) => error.code === "KERNEL_DISPOSE_FAILED");
    } finally {
      host.context.fiber.dispose = original;
    }
    assert.ok(Date.now() - started >= 4_900, "dispose 必须等待满 5000ms 才超时");
    const errors = entries.filter((entry) => entry.level === "error");
    assert.ok(
      errors.some((entry) => entry.message === "kernel.dsh.dispose.timeout"),
      JSON.stringify(entries),
    );
  } finally {
    await removeTempDir(root);
  }
});
