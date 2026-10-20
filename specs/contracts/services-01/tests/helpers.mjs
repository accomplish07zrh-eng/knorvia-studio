// SPDX-License-Identifier: Apache-2.0
// services-01 测试公用件：临时数据目录 + 文件读写 + 用例级清理登记。
// 数据根通过公开的 setDataBaseDir 切换，不依赖 HOME 环境变量
// （仅命令目录/插件目录的用例按需改 HOME）。
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { servicesNode } from "./entry.mjs";

/**
 * Windows 上进程退出与句柄释放是异步的：子进程刚收到终止信号时，它当作 cwd 的目录
 * 仍被内核持有，立刻 `rm -r` 会 `EBUSY`/`EPERM`。重试是这个原生差异的唯一正解，
 * 不能靠「先 sleep 一会儿」凑时序（那只会把问题藏到更慢的机器上）。
 */
const DIR_REMOVE_RETRY = { maxRetries: 20, retryDelay: 100 };
const DIR_REMOVE_OPTIONS = { recursive: true, force: true, ...DIR_REMOVE_RETRY };

/**
 * 每个用例一份的清理登记表。
 *
 * 为什么不是「一个资源一个 `t.after`」：node:test 的 after 钩子按注册顺序 FIFO 执行，
 * 并且**某个钩子抛错后，后续钩子不再执行**。子进程与临时目录分散在多个钩子里时，
 * 「删临时目录」常常排在「收子进程」之前——Windows 上子进程仍把该目录当 cwd，
 * 删除抛 EBUSY，于是收子进程的钩子被顶掉，子进程常驻，runner 等不到事件循环清空，
 * 整个测试进程永不退出。挂点在用例体之外，`--test-timeout` 救不了。
 *
 * 因此这里把同一用例的全部清理收进**一个** after 钩子，并固定三段式顺序：
 * 1. 先跑全部「释放」步骤（终止子进程、退订监听、恢复环境变量），按登记的**逆序**
 *    展开，即后建立的资源先释放、它依赖的前置状态后还原（与栈展开同一语义）；
 * 2. 再删全部临时目录；
 * 3. 每步各自 catch，任一步失败都不阻断其余步骤；全部跑完再把失败合并抛出，
 *    让清理问题显性化成红灯，而不是被静默吞掉。
 *
 * 与顺序同样关键的一点：清理只能登记在 after 钩子里，不能写在用例体末尾。用例体
 * 一旦断言失败就中断，写在它下游的清理语句根本不会执行——这正是「应然失败」的
 * 用例最容易漏清理、进而挂死 runner 的原因。
 */
class TestCleanup {
  #releases = [];
  #directories = [];
  #armed = false;

  constructor(testContext) {
    this.testContext = testContext;
  }

  /** 登记一个「释放资源」步骤：先于任何目录删除执行。 */
  release(step) {
    this.#releases.push(step);
    this.#arm();
  }

  /**
   * 同上，但登记在**表头**。数据根还原这类「全局覆盖」必须在其它释放步骤全部跑完
   * 之后才恢复（否则被测对象持有的路径会在收尾期间指向已失效的目录），用它在建根
   * 时就占到队尾，不必等其它登记。
   */
  releaseLast(step) {
    this.#releases.unshift(step);
    this.#arm();
  }

  /** 登记一个待删临时目录：在所有释放步骤之后删除。 */
  directory(path) {
    this.#directories.push(path);
    this.#arm();
  }

  #arm() {
    if (this.#armed) return;
    this.#armed = true;
    this.testContext.after(() => this.#run());
  }

  async #run() {
    const failures = [];
    const attempt = async (label, action) => {
      try {
        await action();
      } catch (error) {
        failures.push(`${label}: ${describeFailure(error)}`);
      }
    };
    // 第一段：释放资源。按登记逆序展开：后建立的先释放，它依赖的前置状态后还原。
    const releases = [...this.#releases].reverse();
    for (const [index, step] of releases.entries()) {
      await attempt(`release#${index + 1}`, step);
    }
    // 第二段：删目录。此时子进程已终止，EBUSY 窗口只剩句柄延迟释放。
    for (const directoryPath of this.#directories) {
      await attempt(`rm ${directoryPath}`, () => rm(directoryPath, DIR_REMOVE_OPTIONS));
    }
    if (failures.length === 0) return;
    throw new Error(`cleanup failed: ${failures.join(" | ")}`);
  }
}

const describeFailure = (error) => {
  if (error instanceof Error) return `${error.code ?? error.name}: ${error.message}`;
  return String(error);
};

const cleanups = new WeakMap();

/**
 * 取该用例的清理登记表；同一 `t` 永远返回同一份，保证整条用例只有一个 after 钩子。
 * 钩子在**首次登记**时就挂好，因此后续登记不依赖「用例体是否跑到最后一步」。
 */
export function testCleanup(t) {
  let cleanup = cleanups.get(t);
  if (cleanup === undefined) {
    cleanup = new TestCleanup(t);
    cleanups.set(t, cleanup);
  }
  return cleanup;
}

/** 登记一个释放步骤（子进程、订阅、环境变量等）。 */
export function registerCleanup(t, step) {
  testCleanup(t).release(step);
}

/** 建一个隔离的数据根；用例结束后先还原覆盖、再由清理钩子统一删除。 */
export async function makeTempRoot(t) {
  const root = await mkdtemp(join(tmpdir(), "svc01-"));
  servicesNode.setDataBaseDir(root);
  const cleanup = testCleanup(t);
  // 还原全局数据根是「最后释放」：被测对象可能仍在收尾路径上读数据目录，
  // 提前把它指空会让收尾抛错（虽然不致命，但会掩盖真实的清理问题）。
  cleanup.releaseLast(() => servicesNode.setDataBaseDir(null));
  cleanup.directory(root);
  return root;
}

/** `KNORVIA_DATA_BASE_DIR` 指向 root 时的 Knorvia 数据目录。 */
export function knorviaDataRoot(root) {
  return join(root, ".knorvia-studio");
}

export async function writeText(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, { encoding: "utf8" });
}

export async function readText(path) {
  return readFile(path, "utf8");
}

export async function pathExists(path) {
  const info = await stat(path).catch(() => undefined);
  return info !== undefined;
}

/** 在测试期间临时改写一个环境变量，结束后恢复。 */
export function withEnv(t, key, value) {
  const previous = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  registerCleanup(t, () => {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  });
}

export const encPrefix = "enc:v1:";
