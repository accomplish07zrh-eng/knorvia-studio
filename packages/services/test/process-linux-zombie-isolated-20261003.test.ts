import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { test } from "node:test";
import { captureProcessTreeSnapshot } from "../src/process/processTreeSnapshot.js";
import { waitForProcessTreeTermination } from "../src/process/processTreeWaiter.js";
import type { ProcessIdentity } from "../src/process/processTreeTypes.js";

// 父进程保留 waitpid 所有权，测试结束必定回收子进程，不把 zombie 留给 PID1。
const supervisorProgram = String.raw`
import json, os, signal, sys
zombie = live = None
def interrupted(signum, frame):
    raise SystemExit(0)
signal.signal(signal.SIGTERM, interrupted)
try:
    zombie = os.fork()
    if zombie == 0:
        os._exit(0)
    live = os.fork()
    if live == 0:
        signal.signal(signal.SIGTERM, signal.SIG_DFL)
        while True:
            signal.pause()
    print(json.dumps(dict(root=os.getpid(), zombie=zombie, live=live)), flush=True)
    for line in sys.stdin:
        if line.strip() == 'quit':
            break
finally:
    if live:
        try:
            os.kill(live, signal.SIGTERM)
        except ProcessLookupError:
            pass
        os.waitpid(live, 0)
    if zombie:
        os.waitpid(zombie, 0)
    print(json.dumps(dict(reaped=True)), flush=True)
`;

async function bounded<T>(operation: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), 3000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

test(
  "isolated Linux unreaped child is complete while a real sleeping child stays remaining",
  { skip: process.platform !== "linux" },
  async (t) => {
    const supervisor = spawn("python3", ["-u", "-c", supervisorProgram], {
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
    });
    const replies = createInterface({ input: supervisor.stdout });
    const messages = replies[Symbol.asyncIterator]();
    const exited = once(supervisor, "exit");
    let reaped = false;
    t.after(async () => {
      supervisor.stdin.end("quit\n");
      try {
        const reply = await bounded(messages.next(), "isolated supervisor did not reap children");
        if (!reply.done) reaped = JSON.parse(reply.value).reaped === true;
        await bounded(exited, "isolated supervisor did not exit");
      } catch (error) {
        // 此句只作用于刚创建的 ChildProcess handle；Python 的 finally 仍负责 waitpid。
        supervisor.kill("SIGTERM");
        await bounded(exited, "isolated supervisor TERM cleanup did not exit");
        throw error;
      } finally {
        replies.close();
      }
      assert.equal(reaped, true);
      assert.equal(supervisor.exitCode, 0);
    });
    await once(supervisor, "spawn");
    const ready = await bounded(messages.next(), "isolated supervisor did not start");
    assert.equal(ready.done, false);
    const pids = JSON.parse(ready.value!) as { root: number; zombie: number; live: number };
    assert.equal(pids.root, supervisor.pid);
    let actualState = "";
    for (let attempt = 0; attempt < 100; attempt++) {
      const stat = await readFile(`/proc/${pids.zombie}/stat`, "utf8");
      actualState = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[0]!;
      if (actualState === "Z") break;
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(actualState, "Z");
    assert.equal(process.kill(pids.zombie, 0), true);
    assert.equal(process.kill(pids.live, 0), true);
    const snapshot = captureProcessTreeSnapshot(supervisor);
    assert.ok(snapshot);
    const zombie = snapshot.identities.find((identity) => identity.pid === pids.zombie);
    const live = snapshot.identities.find((identity) => identity.pid === pids.live);
    assert.ok(zombie && live);
    assert.equal(zombie.processGroupId, pids.root);
    assert.equal(live.processGroupId, pids.root);
    assert.match(zombie.startTime, /^linux-ticks:\d+$/);
    assert.match(live.startTime, /^linux-ticks:\d+$/);
    t.diagnostic(
      JSON.stringify({ kind: "test-owned-processes", ...pids, actualState, zombie, live }),
    );
    async function observe(identities: ProcessIdentity[]) {
      return waitForProcessTreeTermination(
        supervisor,
        { forceAfterMs: 10, waitAfterForceMs: 0 },
        // Supervisor 只负责持有和回收测试子进程，不在被允许终止的 identities 内。
        { childStillOwned: false, currentIdentities: identities, knownIdentities: identities },
        false,
        (_child, options) => {
          const bridge = options as typeof options & {
            onForceTimerScheduled(timer: ReturnType<typeof setTimeout>): void;
            onForceCleanup(result: { identities: ProcessIdentity[] }): void;
          };
          const timer = setTimeout(() => bridge.onForceCleanup({ identities }), 10);
          bridge.onForceTimerScheduled(timer);
        },
      );
    }
    assert.deepEqual(await observe([zombie]), { remainingPids: [] });
    assert.deepEqual(await observe([zombie, live]), { remainingPids: [pids.live] });
    assert.equal((zombie as ProcessIdentity & { linuxState?: string }).linuxState, "Z");
    assert.equal(process.kill(pids.live, 0), true);
  },
);
