// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-legacy 黑盒驱动：spawn 真实 app-server --stdio，只读写 NDJSON。
// 不 import 桥或 bootstrap 内部模块；同一套用例在默认引擎与 dsh 引擎上原样复跑。

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { assertBridgeEntry, resolveBridgeEntry } from "./entry.mjs";

const DEFAULT_TIMEOUT_MS = 30_000;

// 反向请求的最小应答：Host 侧对 session/requestRuntimePreferences 的既有形状。
const RUNTIME_PREFERENCES = {
  nativeSearchEnhancementsEnabled: false,
  memoryEnabled: false,
  askUserQuestionAutoResolutionEnabled: true,
};

export async function makeTempWorkspace(prefix) {
  const home = await mkdtemp(join(tmpdir(), prefix));
  const workspace = join(home, "ws");
  await mkdir(workspace, { recursive: true });
  return { home, workspace };
}

/**
 * 删临时目录。Windows 上子进程可能仍把目录当 cwd，句柄释放有延迟 → EBUSY/EPERM；
 * 用重试覆盖延迟，并显式给 maxRetries，避免 after 钩子抛错把后续清理钩子一并跳过。
 */
export function removeTempDir(directory) {
  return rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

/**
 * 子进程环境：隔离 HOME/数据目录，清掉外部 DSH_* 与供应商凭据。
 * 引擎只由产品开关 KNORVIA_KERNEL_ENGINE 选择（缺省 = 旧运行时）；测试不新造变量。
 */
export function protocolEnv({ home, engine, extra = {} }) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (key.toUpperCase().startsWith("DSH_")) continue;
    if (key === "KNORVIA_KERNEL_ENGINE") continue;
    if (/(?:API[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|SECRET|PASSWORD|_KEY)$/iu.test(key)) {
      continue;
    }
    env[key] = value;
  }
  Object.assign(env, {
    KNORVIA_ENV: "test",
    KNORVIA_DATA_BASE_DIR: join(home, "data"),
    KNORVIA_STORAGE_DIR: join(home, "cli"),
    HOME: home,
    USERPROFILE: home,
  });
  if (engine === "dsh") env.KNORVIA_KERNEL_ENGINE = "dsh";
  Object.assign(env, extra);
  return env;
}

export function workspaceRef(workspacePath) {
  return { workspacePath, workspaceKey: workspacePath };
}

/**
 * 启动一个 app-server 子进程并返回可观测句柄。
 *
 * `replyBody` 只给「反向请求应答结构」类用例用（B17）：默认用上面的
 * RUNTIME_PREFERENCES；传入自定义对象可让应答的 result 里带上特定字段
 * （例如含 "method" 键的对象，用于验证桥的结构判定不看子串）。
 */
export async function spawnAppServer({ workspace, home, engine, replyBody = RUNTIME_PREFERENCES }) {
  const entry = resolveBridgeEntry();
  assertBridgeEntry(entry);
  const child = spawn(process.execPath, [entry, "app-server", "--stdio"], {
    cwd: workspace,
    env: protocolEnv({ home, engine }),
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  const state = { stdoutLines: [], stderrText: "", exit: undefined, invalidLines: [] };
  const messages = [];
  const reverseRequests = [];
  const reverseScopes = [];
  const waiters = new Set();
  let nextId = 0;

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    state.stderrText += chunk;
  });

  const reader = createInterface({ input: child.stdout });
  reader.on("line", (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      state.invalidLines.push(line);
      return;
    }
    state.stdoutLines.push(line);
    messages.push(message);
    // 服务端反向请求必须应答，否则 CLI 侧等待会一直挂到超时。
    if (message.method !== undefined && message.id !== undefined) {
      reverseRequests.push(message.method);
      // 记录 scope（session/requestRuntimePreferences 的两档之一），供 B11 断言。
      const scope = message.params?.scope;
      if (typeof scope === "string") reverseScopes.push(scope);
      child.stdin.write(`${JSON.stringify({ id: message.id, result: replyBody })}\n`);
    }
    for (const waiter of [...waiters]) {
      if (waiter.predicate(message)) {
        waiters.delete(waiter);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      }
    }
  });

  const exited = new Promise((resolve) => {
    child.once("error", (error) => {
      state.exit = { code: null, error: String(error) };
      resolve(state.exit);
    });
    child.once("exit", (code, signal) => {
      state.exit = { code, signal };
      for (const waiter of waiters) {
        waiters.delete(waiter);
        clearTimeout(waiter.timer);
        waiter.reject(new Error(`app-server exited early; stderr tail=${tail(state.stderrText)}`));
      }
      resolve(state.exit);
    });
  });
  exited.catch(() => {});

  function waitFor(predicate, { label = "message", timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    for (const message of messages) {
      if (predicate(message)) return Promise.resolve(message);
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          waiters.delete(waiter);
          reject(
            new Error(
              `timed out waiting for ${label} after ${timeoutMs}ms; stderr tail=${tail(
                state.stderrText,
              )}`,
            ),
          );
        }, timeoutMs),
      };
      waiters.add(waiter);
    });
  }

  async function request(method, params, { timeoutMs } = {}) {
    const id = `c-${(nextId += 1)}-${method.replaceAll("/", "-")}`;
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    return await waitFor((message) => message.id === id && message.method === undefined, {
      label: `${method} response`,
      timeoutMs,
    });
  }

  function writeRaw(line) {
    child.stdin.write(`${line}\n`);
  }

  async function close() {
    reader.close();
    child.stdin.end();
    // 收尾必须无条件返回并释放句柄：子进程卡住或 dispose 慢时，用例仍要给出结论，
    // 测试进程也不能被残留的管道读端留在事件循环里。
    const killTimer = setTimeout(() => child.kill("SIGKILL"), 10_000);
    killTimer.unref?.();
    let fallbackTimer;
    const exit = await Promise.race([
      exited,
      new Promise((resolve) => {
        fallbackTimer = setTimeout(
          () => resolve({ code: null, signal: null, forced: true }),
          15_000,
        );
        fallbackTimer.unref?.();
      }),
    ]);
    clearTimeout(killTimer);
    if (fallbackTimer !== undefined) clearTimeout(fallbackTimer);
    if (state.exit === undefined) child.kill("SIGKILL");
    // 无论子进程是否已退出，都断开父进程侧的管道：「引用计数归零」由本函数负责，
    // 不依赖子进程的 dispose 完成时间。
    reader.close();
    child.stdin.destroy();
    child.stdout.destroy();
    child.stderr.destroy();
    child.unref();
    return exit;
  }

  return {
    state,
    messages,
    reverseRequests,
    reverseScopes,
    request,
    writeRaw,
    waitFor,
    close,
    requestCount: () => nextId,
    /**
     * 一次注册清理：先收子进程，再删临时目录，且两步互不阻塞。
     *
     * 为什么必须由夹具统一注册（2026-10-20 实测教训）：node:test 的 after 钩子按注册
     * FIFO 执行，且前一个钩子抛错后**后续钩子不再执行**。若把 close 写在用例体里、
     * 只把 rm 挂进 after，则断言失败时用例体后面的 close 根本不会跑到 —— 子进程常驻，
     * runner 等不到事件循环清空，整个测试进程永不退出（--test-timeout 也救不了，
     * 挂点在用例体之外）。这里把 close 与 rm 放进同一个钩子，且各自 catch，
     * 保证任何一步失败都不会阻断另一步，也不会阻断其它测试的清理。
     */
    registerCleanup(t, directories = []) {
      t.after(async () => {
        let closeFailure;
        try {
          await close();
        } catch (error) {
          closeFailure = error;
        }
        const rmFailures = [];
        for (const directory of directories) {
          try {
            await removeTempDir(directory);
          } catch (error) {
            rmFailures.push(`${directory}: ${error.code ?? error.message}`);
          }
        }
        // 清理失败不当作用例失败：用例的结论由断言决定；这里只报告诊断信息。
        if (closeFailure !== undefined) {
          console.error(`[cleanup] close failed: ${closeFailure.message ?? closeFailure}`);
        }
        if (rmFailures.length > 0) {
          console.error(`[cleanup] rm failed: ${rmFailures.join("; ")}`);
        }
      });
    },
  };
}

/** 结果是否是协议 error。 */
export function isError(message) {
  return message !== undefined && message.error !== undefined;
}

/** 断言响应不是 error，返回 result。 */
export function expectResult(message, label) {
  assert.equal(
    message?.error,
    undefined,
    `${label}: unexpected protocol error ${JSON.stringify(message)}`,
  );
  return message.result;
}

/**
 * 断言「方法已被应答」：不是 -32601（未实现），而是结果或既有错误码。
 * 允许的错误码集合来自旧运行时实测（见 known-differences.md 与 behavior.md §B7）。
 */
export const LEGACY_ERROR_CODES = new Set([-32003, -32004, -32009, -32010, -32018, -32031]);

export function classifyResponse(message, label) {
  assert.ok(message !== undefined, `${label}: no response`);
  if (!isError(message)) return { kind: "result", result: message.result };
  assert.notEqual(
    message.error.code,
    -32601,
    `${label}: legacy method must not answer Method not found (code -32601)`,
  );
  assert.notEqual(
    message.error.code,
    -32602,
    `${label}: params were schema-valid, unexpected -32602 ${JSON.stringify(message.error)}`,
  );
  assert.ok(
    LEGACY_ERROR_CODES.has(message.error.code),
    `${label}: unexpected error code ${message.error.code} ${JSON.stringify(message.error)}`,
  );
  assert.equal(
    typeof message.error.message,
    "string",
    `${label}: error message must be a non-empty string`,
  );
  assert.ok(message.error.message.length > 0, `${label}: error message must not be empty`);
  return { kind: "error", code: message.error.code, message: message.error.message };
}

function tail(text, limit = 1200) {
  return JSON.stringify(text.slice(-limit));
}
