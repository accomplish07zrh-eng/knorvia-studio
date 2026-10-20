// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-dsh-builtins B3 的隔离补充：内置能力挂载**不得**触碰真实用户目录与真实 DSH 主目录。
//
// 为什么单独写这一条：本包比 kernel-dsh-00 多挂了十个以上的 DSH 行（沙箱、托管环境、
// 文件系统、作业、技能、MCP 资源…）。每一行都是潜在的新读写面，所以除了「数据目录
// 建在临时根」之外，还要反向证明「真实用户目录一个字节都没被动过」。
//
// 安全约定（全队口径）：本文件只做**只读**判定，绝不删除、移动或写入任何真实路径；
// 也不按进程名清理任何进程——所有子进程都用 create 返回的句柄收尾。
import assert from "node:assert/strict";
import { readdir, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadKernel } from "./_kernel-entry.mjs";
import { QUIET_LOGGER, isolatedEnvironment } from "./_harness.mjs";

/** 诱饵文件的内容；用来判定真实候选目录有没有被改写。 */
const DECOY_CREDENTIAL = "fixture-decoy-credential-placeholder\n";
const DECOY_SESSION = "fixture-decoy-session-placeholder\n";
const DECOY_PATCH = "# fixture decoy patch; must never be read or rewritten\n";

/**
 * 在给定主目录下铺一份「看起来像真实用户 DSH 主目录」的诱饵：
 * 凭据、一个会话文件、一个 patch 文件。它们全都只含虚构占位串。
 *
 * @param home - 诱饵主目录。
 * @returns 诱饵 DSH 主目录的路径。
 */
async function plantDecoyDshHome(home) {
  const decoy = join(home, ".dsh");
  await mkdir(join(decoy, "sessions"), { recursive: true });
  await mkdir(join(decoy, "profiles"), { recursive: true });
  await writeFile(join(decoy, ".credentials.yaml"), DECOY_CREDENTIAL, "utf8");
  await writeFile(join(decoy, "sessions", "decoy-session.jsonl"), DECOY_SESSION, "utf8");
  await writeFile(join(decoy, "cordis.patch.yml"), DECOY_PATCH, "utf8");
  return decoy;
}

/**
 * 快照一个目录树里所有文件的「相对路径 → 内容 + mtime」。只读，不写。
 *
 * @param root - 要快照的目录。
 * @returns 排序后的条目列表。
 */
async function snapshotTree(root) {
  const entries = [];
  const walk = async (directory) => {
    const children = await readdir(directory, { withFileTypes: true });
    for (const child of children.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      const absolute = join(directory, child.name);
      if (child.isDirectory()) {
        await walk(absolute);
        continue;
      }
      const info = await stat(absolute);
      entries.push([absolute.slice(root.length), await readFile(absolute, "utf8"), info.mtimeMs]);
    }
  };
  await walk(root);
  return entries;
}

test("B3 挂载全部内置能力后，诱饵主目录里的 ~/.dsh 一个字节都没变", async () => {
  const kernel = await loadKernel();
  const root = await mkdtemp(join(tmpdir(), "kernel-builtins-isolation-"));
  const fakeHome = join(root, "home");
  try {
    await mkdir(fakeHome, { recursive: true });
    // 诱饵放在**假主目录**里：它与真实 ~/.dsh 结构相同，但路径在临时根内，
    // 因此断言既精确又绝不会碰到用户真实数据。
    const decoy = await plantDecoyDshHome(fakeHome);
    const before = await snapshotTree(decoy);

    let host;
    try {
      host = await kernel.bootKernel({
        cwd: join(root, "ws"),
        // HOME 与 USERPROFILE 都重定向到诱饵主目录：如果内核去读 ~/.dsh，
        // 读到的就是这份诱饵。
        env: isolatedEnvironment({
          KNORVIA_DATA_BASE_DIR: join(root, "base"),
          HOME: fakeHome,
          USERPROFILE: fakeHome,
        }),
        logger: QUIET_LOGGER,
      });
      // DSH 主目录必须落在临时数据根下，而不是诱饵主目录。
      assert.equal(
        host.dshHome,
        join(root, "base", ".knorvia-studio", "dsh"),
        "DSH 主目录必须由数据根治派生，不取 HOME",
      );
      assert.equal(host.dshHome.startsWith(root), true, "本次启动的全部落盘都必须留在临时根内");
      assert.notEqual(host.dshHome, decoy, "内核不得把诱饵 ~/.dsh 当作自己的主目录");
    } finally {
      try {
        await host?.dispose();
      } catch {
        // 释放失败由 kernel-dsh-00 的用例负责。
      }
    }

    const after = await snapshotTree(decoy);
    assert.deepEqual(
      after,
      before,
      "挂载内置能力后，诱饵 ~/.dsh 的文件集合、内容与 mtime 都必须完全不变",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("B3 内核不把宿主继承的 DSH_HOME 当真：数据目录只由 KNORVIA 数据根决定", async () => {
  const kernel = await loadKernel();
  const root = await mkdtemp(join(tmpdir(), "kernel-builtins-isolation-home-"));
  const foreign = join(root, "foreign-dsh-home");
  try {
    await mkdir(foreign, { recursive: true });
    await writeFile(join(foreign, "decoy.txt"), DECOY_CREDENTIAL, "utf8");
    const before = await snapshotTree(foreign);

    let host;
    try {
      host = await kernel.bootKernel({
        cwd: join(root, "ws"),
        env: isolatedEnvironment({
          KNORVIA_DATA_BASE_DIR: join(root, "base"),
          HOME: join(root, "home"),
          USERPROFILE: join(root, "home"),
          // 宿主继承来的 DSH_HOME 指向诱饵目录；内核必须忽略它并用自己的数据根。
          DSH_HOME: foreign,
        }),
        logger: QUIET_LOGGER,
      });
      assert.notEqual(host.dshHome, foreign, "内核必须忽略宿主继承的 DSH_HOME");
      assert.equal(
        host.dshHome,
        join(root, "base", ".knorvia-studio", "dsh"),
        "DSH 主目录必须由 KNORVIA 数据根派生",
      );
    } finally {
      try {
        await host?.dispose();
      } catch {
        // 同上。
      }
    }

    assert.deepEqual(await snapshotTree(foreign), before, "宿主继承的 DSH_HOME 目录不得被读取改写");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("B3 内核不把真实 ~/.dsh 当数据根（只读判定，不触碰）", async () => {
  const kernel = await loadKernel();
  const root = await mkdtemp(join(tmpdir(), "kernel-builtins-isolation-real-"));
  // 注意：临时目录本身可能落在用户主目录下的 AppData/Temp，所以不能断言
  // 「不在主目录下」——正确的判据是「不在 ~/.dsh 里」且「不在主目录顶层」。
  const userDsh = join(homedir(), ".dsh");
  try {
    let host;
    try {
      host = await kernel.bootKernel({
        cwd: join(root, "ws"),
        env: isolatedEnvironment({
          KNORVIA_DATA_BASE_DIR: join(root, "base"),
          HOME: join(root, "home"),
          USERPROFILE: join(root, "home"),
        }),
        logger: QUIET_LOGGER,
      });
      // 只做字符串前缀判定：不 list、不 stat、不读不写真实路径。
      assert.equal(
        host.dshHome === userDsh ||
          host.dshHome.startsWith(`${userDsh}\\`) ||
          host.dshHome.startsWith(`${userDsh}/`),
        false,
        `内核的数据目录不得落在真实 ~/.dsh 里；实际=${host.dshHome}`,
      );
      assert.equal(host.dshHome.startsWith(root), true, "内核的数据目录必须落在本次的临时数据根下");
    } finally {
      try {
        await host?.dispose();
      } catch {
        // 同上。
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("B3 每个用例的临时根互不相同：并发执行不共享任何数据目录", async () => {
  const kernel = await loadKernel();
  const homes = [];
  try {
    for (let index = 0; index < 2; index += 1) {
      const root = await mkdtemp(join(tmpdir(), "kernel-builtins-isolation-serial-"));
      let host;
      try {
        host = await kernel.bootKernel({
          cwd: join(root, "ws"),
          env: isolatedEnvironment({
            KNORVIA_DATA_BASE_DIR: join(root, "base"),
            HOME: join(root, "home"),
            USERPROFILE: join(root, "home"),
          }),
          logger: QUIET_LOGGER,
        });
        homes.push(join(root, "base", ".knorvia-studio", "dsh"));
        assert.equal(host.dshHome, homes[index], "每次启动的主目录必须由本次数据根决定");
      } finally {
        try {
          await host?.dispose();
        } catch {
          // 同上。
        }
      }
    }
    assert.equal(homes.length, 2);
    assert.notEqual(homes[0], homes[1], "两次启动的数据目录必须不同");
  } finally {
    // 只清理本次自己造的临时根。
    for (const home of homes) {
      await rm(join(home, "..", "..", ".."), { recursive: true, force: true });
    }
  }
});
