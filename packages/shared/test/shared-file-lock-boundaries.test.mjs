// In-memory ports only: no native files, locks, PIDs, clocks, timers, hashing or permissions.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { build } from "esbuild";
const root = process.argv[2];
assert.ok(root, "Supply source root.");
const plain = (x) => JSON.parse(JSON.stringify(x));
const err = (code) => Object.assign(new Error("synthetic " + code), { code });
const ports = {
  "../errors.js": 'export const KNORVIA_FILE_LOCK_TIMEOUT_ERROR_CODE="KNORVIA_FILE_LOCK_TIMEOUT";',
  "./lockInstanceObserver.js":
    'export const createLockInstanceObserver=()=>{const seen=new Map();return(p,s,t)=>{const key=p+":"+s.dev+":"+s.ino;const value=seen.get(key)??t;seen.set(key,value);return value;};};',
  "./atomicFileLock.js": "export const acquireFileLock=(...a)=>fixture.acquire(...a);",
  "node:fs/promises":
    "export const mkdir=(...a)=>fixture.mkdir(...a);export const readFile=(...a)=>fixture.readFile(...a);export const readdir=(...a)=>fixture.readdir(...a);export const rmdir=(...a)=>fixture.rmdir(...a);export const rm=(...a)=>fixture.rm(...a);export const stat=(...a)=>fixture.stat(...a);export const writeFile=(...a)=>fixture.writeFile(...a);export const rename=(...a)=>fixture.rename(...a);export const chmod=(...a)=>fixture.chmod(...a);",
  "node:path":
    'export const join=(...p)=>p.join("/");export const dirname=p=>p.slice(0,p.lastIndexOf("/"));export const basename=p=>p.slice(p.lastIndexOf("/")+1);',
  "node:timers/promises": "export const setTimeout=n=>fixture.sleep(n);",
  "node:crypto":
    'export const createHash=a=>{if(a!=="sha256")throw new Error("algorithm");return{update:b=>{fixture.hashInput=b;return{digest:e=>{if(e!=="hex")throw new Error("encoding");return "0123456789abcdef".repeat(4);}};}}};',
};
async function load(name, fixture) {
  const out = await build({
    entryPoints: [resolve(root, name + ".ts")],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    plugins: [
      {
        name: "fake-owner-ports",
        setup(b) {
          b.onResolve({ filter: /(?:\.js$|^node:)/ }, (a) =>
            ports[a.path] ? { path: a.path, namespace: "synthetic" } : undefined,
          );
          b.onLoad({ filter: /.*/, namespace: "synthetic" }, (a) => ({ contents: ports[a.path] }));
        },
      },
    ],
  });
  const module = { exports: {} };
  runInNewContext(out.outputFiles[0].text, {
    module,
    exports: module.exports,
    fixture,
    Error,
    Date: { now: () => fixture.now },
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }),
    process: { pid: 47, kill: (pid, signal) => fixture.kill(pid, signal) },
  });
  return module.exports;
}

function lockMemory() {
  const files = new Map(),
    dirs = new Map(),
    trace = [];
  let inode = 10;
  return {
    files,
    dirs,
    trace,
    now: 100,
    async mkdir(p) {
      trace.push(["mkdir", p]);
      if (files.has(p) || dirs.has(p)) throw err("EEXIST");
      dirs.set(p, { ino: inode++, dev: 1, mtimeMs: 100, isDirectory: () => true });
    },
    async stat(p) {
      trace.push(["stat", p]);
      if (this.statError) throw this.statError;
      if (dirs.has(p)) return dirs.get(p);
      if (files.has(p)) return { ino: 1, dev: 1, mtimeMs: 0, isDirectory: () => false };
      throw err("ENOENT");
    },
    async readdir(p) {
      trace.push(["readdir", p]);
      return [...files.keys()]
        .filter((k) => k.startsWith(p + "/"))
        .map((k) => k.slice(p.length + 1));
    },
    async readFile(p, encoding) {
      assert.equal(encoding, "utf-8");
      trace.push(["read", p]);
      if (!files.has(p)) throw err("ENOENT");
      return files.get(p);
    },
    async writeFile(p, value, options) {
      assert.deepEqual(plain(options), { encoding: "utf-8", flag: "wx" });
      trace.push(["write", p]);
      if (files.has(p)) throw err("EEXIST");
      files.set(p, value);
    },
    async rm(p, options) {
      assert.deepEqual(plain(options), { force: true });
      trace.push(["rm", p]);
      files.delete(p);
    },
    async rmdir(p) {
      trace.push(["rmdir", p]);
      if ([...files.keys()].some((k) => k.startsWith(p + "/"))) throw err("ENOTEMPTY");
      dirs.delete(p);
    },
    async sleep(n) {
      trace.push(["sleep", n]);
      this.now += n;
    },
    kill(pid, signal) {
      assert.equal(signal, 0);
      trace.push(["kill", pid]);
      throw err("ESRCH");
    },
  };
}

test("atomic owner preserves unique release, dead-owner reclamation and deadline/permission identity", async () => {
  const f = lockMemory();
  const a = await load("atomicFileLock", f);
  const release = await a.acquireFileLock("/fixture/file", [1], 10, 100);
  const own = [...f.files.keys()][0];
  const payload = f.files.get(own);
  assert.equal(payload, '{"pid":47,"createdAt":100,"token":"47-100-i"}\n');
  f.files.delete(own);
  f.files.set("/fixture/file.lock/owner-later.json", "fixture later owner");
  await release();
  await release();
  assert.ok(f.files.has("/fixture/file.lock/owner-later.json"));
  assert.equal(f.trace.filter((x) => x[0] === "rm" && x[1] === own).length, 2);
  const dead = lockMemory();
  dead.dirs.set("/fixture/dead.lock", { ino: 2, dev: 1, mtimeMs: 0, isDirectory: () => true });
  dead.files.set("/fixture/dead.lock/owner-old.json", '{"pid":9,"createdAt":0}');
  const d = await load("atomicFileLock", dead);
  const done = await d.acquireFileLock("/fixture/dead", [1], 10, 100);
  assert.ok(!dead.files.has("/fixture/dead.lock/owner-old.json"));
  assert.ok(dead.trace.some((x) => x[0] === "kill" && x[1] === 9));
  assert.ok(!dead.trace.some((x) => x[0] === "sleep"));
  await done();
  const deadline = lockMemory();
  deadline.dirs.set("/fixture/deadline.lock", {
    ino: 2,
    dev: 1,
    mtimeMs: 0,
    isDirectory: () => true,
  });
  const t = await load("atomicFileLock", deadline);
  await assert.rejects(
    t.acquireFileLock("/fixture/deadline", [1], 0, 0),
    (e) =>
      e.code === "KNORVIA_FILE_LOCK_TIMEOUT" &&
      e.path === "/fixture/deadline" &&
      e.syscall === "mkdir" &&
      e.cause.code === "EEXIST",
  );
  assert.ok(!deadline.trace.some((x) => ["stat", "read", "rm", "rmdir"].includes(x[0])));
  const permission = lockMemory();
  permission.dirs.set("/fixture/permission.lock", {
    ino: 2,
    dev: 1,
    mtimeMs: 0,
    isDirectory: () => true,
  });
  const sentinel = err("EACCES");
  permission.statError = sentinel;
  const p = await load("atomicFileLock", permission);
  await assert.rejects(
    p.acquireFileLock("/fixture/permission", [], 10, 100),
    (e) => e === sentinel,
  );
});

test("persistence FIFO progresses after release errors and keeps different paths independent", async () => {
  const trace = [];
  const counts = new Map();
  const releaseError = err("FIXTURE_RELEASE");
  let unblock;
  const gate = new Promise((r) => {
    unblock = r;
  });
  const f = {
    now: 100,
    trace,
    async mkdir(p, options) {
      assert.deepEqual(plain(options), { recursive: true });
      trace.push("mkdir:" + p);
    },
    async acquire(p, delays, grace, wait) {
      assert.deepEqual(plain(delays), [25, 50, 100, 200, 400]);
      assert.equal(grace, 100);
      assert.equal(wait, 8000);
      const n = counts.get(p) ?? 0;
      counts.set(p, n + 1);
      trace.push("acquire:" + p + ":" + n);
      return async () => {
        trace.push("release:" + p + ":" + n);
        if (p === "/fixture/same" && n === 0) throw releaseError;
      };
    },
  };
  const a = await load("privateFilePersistence", f);
  const result = { synthetic: true };
  const first = a.withFileLock("/fixture/same", async () => {
    trace.push("op:first");
    await gate;
    return "first";
  });
  const firstRejected = assert.rejects(first, (e) => e === releaseError);
  const second = a.withFileLock("/fixture/same", async () => {
    trace.push("op:second");
    return result;
  });
  const different = a.withFileLock("/fixture/different", async () => {
    trace.push("op:different");
    return "different";
  });
  assert.equal(await different, "different");
  assert.ok(trace.includes("op:first"));
  assert.ok(!trace.includes("op:second"));
  unblock();
  await firstRejected;
  assert.strictEqual(await second, result);
  assert.ok(trace.indexOf("release:/fixture/same:0") < trace.indexOf("acquire:/fixture/same:1"));
});

test("persistence preserves admitted rename retries, cleanup error precedence and deterministic backup bytes", async () => {
  const trace = [];
  const bytes = new Uint8Array([1, 2, 3]);
  const backups = new Map();
  let renameCount = 0;
  const original = err("EIO");
  const f = {
    now: 100,
    trace,
    async mkdir(p, o) {
      assert.deepEqual(plain(o), { recursive: true });
      trace.push(["mkdir", p]);
    },
    async writeFile(p, value, o) {
      trace.push(["write", p, value, plain(o)]);
      if (p.endsWith(".bak")) {
        assert.strictEqual(value, bytes);
        assert.deepEqual(plain(o), { flag: "wx", mode: 0o600 });
        if (backups.has(p)) throw err("EEXIST");
        backups.set(p, value);
      } else assert.deepEqual(plain(o), { encoding: "utf-8", mode: 0o600 });
    },
    async rename(from, to) {
      trace.push(["rename", from, to]);
      if (this.codeGetterError) {
        const e = this.codeGetterError;
        this.codeGetterError = undefined;
        throw e;
      }
      if (this.failRename) throw original;
      if (renameCount++ < 2) throw err("EBUSY");
    },
    async sleep(n) {
      trace.push(["sleep", n]);
    },
    async rm(p, o) {
      assert.deepEqual(plain(o), { force: true });
      trace.push(["rm", p]);
      if (this.failRename) throw err("FIXTURE_CLEANUP");
    },
    async readFile(p) {
      trace.push(["read", p]);
      return bytes;
    },
    async chmod(p, mode) {
      assert.equal(mode, 0o600);
      trace.push(["chmod", p]);
    },
  };
  const a = await load("privateFilePersistence", f);
  await a.atomicWritePrivateTextFile("/fixture/private.txt", "synthetic exact bytes", [2, 3]);
  assert.deepEqual(
    trace.filter((x) => x[0] === "sleep").map((x) => x[1]),
    [2, 3],
  );
  assert.equal(trace.filter((x) => x[0] === "rename").length, 3);
  assert.ok(!trace.some((x) => x[0] === "rm"));
  f.failRename = true;
  await assert.rejects(
    a.atomicWritePrivateTextFile("/fixture/fail.txt", "fixture"),
    (e) => e === original,
  );
  assert.equal(trace.filter((x) => x[0] === "rm").length, 1);
  let codeReads = 0;
  const dynamicCode = new Error("synthetic dynamic errno");
  Object.defineProperty(dynamicCode, "code", {
    get() {
      codeReads += 1;
      return codeReads === 1 ? "EBUSY" : "EIO";
    },
  });
  f.failRename = false;
  f.codeGetterError = dynamicCode;
  await a.atomicWritePrivateTextFile("/fixture/dynamic.txt", "fixture", [1]);
  assert.equal(codeReads, 1, "unknown errno code must be captured once");
  const one = await a.backupCorruptFile("/fixture/corrupt");
  const two = await a.backupCorruptFile("/fixture/corrupt");
  assert.equal(one, "/fixture/corrupt.corrupt-0123456789abcdef01234567.bak");
  assert.equal(two, one);
  assert.strictEqual(f.hashInput, bytes);
  assert.equal(backups.size, 1);
  assert.equal(trace.filter((x) => x[0] === "chmod").length, 2);
});
