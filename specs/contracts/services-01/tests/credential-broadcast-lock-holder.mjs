// SPDX-License-Identifier: Apache-2.0
// S16 跨进程锁夹具：按 atomicFileLock 的锁目录协议（`<file>.lock` 目录 + 唯一 `owner-*.json`）
// 占住凭据文件的锁，等 stdin 收到 RELEASE 行再释放退出。
// 纯 node 夹具，不需要 tsx：让父进程用真实的凭据服务去抢同一把锁，验证锁是跨进程的。
import { mkdir, rmdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";

const lockPath = process.argv[2];
if (!lockPath) {
  process.stderr.write("usage: lock-holder.mjs <lock-dir>\n");
  process.exit(2);
}

const serial = `pid-${process.pid}-${Date.now()}`;
const ownerPath = join(lockPath, `owner-${serial}.json`);
const record = `${JSON.stringify({ pid: process.pid, createdAt: Date.now(), token: serial })}\n`;

await mkdir(lockPath);
await writeFile(ownerPath, record, "utf8");
process.stdout.write(`HELD ${process.pid}\n`);

const lines = createInterface({ input: process.stdin });
for await (const line of lines) {
  if (line.trim() === "RELEASE") {
    break;
  }
}
lines.close();

await rm(ownerPath, { force: true });
await rmdir(lockPath);
process.stdout.write("RELEASED\n");
