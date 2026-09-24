import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, symlink, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { ManagedKernels } from "../src/studio-runtime/adapters/kernels/managedKernels.js";
import {
  managedLock,
  safeManagedPath,
  safeManagedRoot,
} from "../src/studio-runtime/adapters/kernels/managedPaths.js";
import {
  downloadVerified,
  officialResponse,
  officialText,
  type Fetcher,
} from "../src/studio-runtime/adapters/kernels/download.js";
import {
  hashFile,
  installOfficialKernel,
} from "../src/studio-runtime/adapters/kernels/installSource.js";
import { extractOfficialPackage } from "../src/studio-runtime/adapters/kernels/tarExtract.js";

const signal = () => new AbortController().signal;
const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const temporary = () => mkdtemp(join(tmpdir(), "knorvia-install-"));
const fakeInstaller =
  (version: string, corrupt = false): typeof installOfficialKernel =>
  async (_kernel, stage) => {
    const executable = "fixture.cjs";
    await writeFile(join(stage, executable), `console.log('fixture ${version}')`);
    return {
      version,
      executable,
      sha256: corrupt ? "0".repeat(64) : await hashFile(join(stage, executable)),
    };
  };

test("managed install/update are verified and atomic; external installations are never uninstalled", async () => {
  const directory = await temporary();
  const first = new ManagedKernels(directory, () => false, fakeInstaller("1.2.3"));
  const bad = new ManagedKernels(directory, () => false, fakeInstaller("1.2.4", true));
  const next = new ManagedKernels(directory, () => false, fakeInstaller("1.2.4"));
  try {
    await assert.rejects(first.manage("codex", "uninstall"), /不会卸载系统安装/);
    await first.manage("codex", "install");
    const previous = await first.current("codex");
    assert.equal(previous?.entry.version, "1.2.3");
    await assert.rejects(bad.manage("codex", "update"), /完整性校验失败/);
    assert.equal((await first.current("codex"))?.path, previous?.path);
    assert.equal(await first.verifiedPath("codex"), previous?.path);
    await next.manage("codex", "update");
    assert.equal((await next.current("codex"))?.entry.version, "1.2.4");
    assert.equal(await next.verifiedPath("codex", previous?.path), previous?.path);
    assert.equal((await next.resolve("codex", previous?.path)).managed, true);
    assert.ok(
      !(await readdir(join(directory, "kernels"))).some((name) => name.startsWith(".staging-")),
    );
    await next.manage("codex", "uninstall");
    assert.equal(await next.current("codex"), undefined);
    await assert.rejects(readFile(previous!.path), { code: "ENOENT" });
  } finally {
    await Promise.all([first.dispose(), bad.dispose(), next.dispose()]);
    await rm(directory, { recursive: true, force: true });
  }
});

test("cross-instance run leases and filesystem locks prevent installation mutation during execution", async () => {
  const directory = await temporary();
  const first = new ManagedKernels(directory, () => false, fakeInstaller("1.2.3"));
  const other = new ManagedKernels(directory, () => false, fakeInstaller("1.2.4"));
  try {
    await first.manage("codex", "install");
    const leases = await Promise.all([first.lease("codex"), other.lease("codex")]);
    await assert.rejects(other.manage("codex", "update"), /另一个窗口仍有运行任务/);
    await Promise.all(leases.map((release) => release()));
    const root = await safeManagedRoot(directory);
    const unlock = await managedLock(root);
    try {
      await assert.rejects(other.manage("codex", "update"), /另一个内核管理操作/);
    } finally {
      await unlock();
    }
    await other.manage("codex", "update");
    assert.equal((await first.current("codex"))?.entry.version, "1.2.4");
  } finally {
    await first.dispose();
    await other.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});

test("dead-owner locks are recoverable and managed paths reject traversal and junctions", async () => {
  const directory = await temporary();
  try {
    const root = await safeManagedRoot(directory);
    await writeFile(
      join(root, ".manage.lock"),
      JSON.stringify({ pid: 2147483647, token: randomUUID() }),
    );
    const unlock = await managedLock(root);
    await unlock();
    await assert.rejects(safeManagedPath(root, "../outside"), /越出/);
    const outside = join(directory, "outside");
    await mkdir(outside);
    await symlink(
      outside,
      join(root, "redirect"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await assert.rejects(safeManagedPath(root, "redirect/file"), /符号链接/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("disposing management aborts a staged installation and removes only its own stage", async () => {
  const directory = await temporary();
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const manager = new ManagedKernels(
    directory,
    () => false,
    async (_kernel, stage, abort) => {
      await writeFile(join(stage, "partial"), "fixture");
      started();
      await new Promise<void>((_resolve, reject) =>
        abort.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }),
      );
      throw new Error("unreachable");
    },
  );
  try {
    const running = manager.manage("codex", "install");
    const rejected = assert.rejects(running, /cancelled/);
    await ready;
    await manager.dispose();
    await rejected;
    assert.deepEqual(await readdir(join(directory, "kernels")), []);
  } finally {
    await manager.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});

test("official download verifies integrity and refuses missing checksum, tampering, and foreign redirects", async () => {
  const directory = await temporary();
  const body = "native fixture";
  const fetcher = (async () => new Response(body)) as Fetcher;
  try {
    const destination = join(directory, "good");
    const digest = await downloadVerified({
      url: "https://registry.npmjs.org/fixture.tgz",
      destination,
      signal: signal(),
      integrity: { algorithm: "sha256", encoding: "hex", value: sha(body) },
      fetcher,
    });
    assert.equal(digest, sha(body));
    assert.equal(await readFile(destination, "utf8"), body);
    await assert.rejects(
      downloadVerified({
        url: "https://registry.npmjs.org/bad.tgz",
        destination: join(directory, "bad"),
        signal: signal(),
        integrity: { algorithm: "sha256", encoding: "hex", value: "0".repeat(64) },
        fetcher,
      }),
      /完整性校验失败/,
    );
    assert.ok(!(await readdir(directory)).includes("bad"));
    await assert.rejects(
      downloadVerified({
        url: "https://registry.npmjs.org/missing.tgz",
        destination: join(directory, "missing"),
        signal: signal(),
        fetcher,
      }),
      /未提供完整性/,
    );
    const redirected = (async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://untrusted.example/binary" },
      })) as Fetcher;
    await assert.rejects(
      officialResponse("https://x.ai/cli/file", signal(), redirected),
      /拒绝非官方/,
    );
    const huge = (async () => new Response(new Uint8Array(2_000_001))) as Fetcher;
    await assert.rejects(
      officialText("https://registry.npmjs.org/metadata", signal(), huge),
      /元数据过大/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function archive(name: string, kind = "0", body = "fixture"): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0);
  header.write("0000755\0", 100);
  header.write(Buffer.byteLength(body).toString(8).padStart(11, "0") + "\0", 124);
  header.fill(32, 148, 156);
  header.write(kind, 156);
  header.write("ustar\0", 257);
  const sum = header.reduce((value, byte) => value + byte, 0);
  header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
  return gzipSync(
    Buffer.concat([
      header,
      Buffer.from(body),
      Buffer.alloc((512 - (Buffer.byteLength(body) % 512)) % 512),
      Buffer.alloc(1024),
    ]),
  );
}

test("package extraction rejects traversal/symlinks and verifies TAR headers", async () => {
  const directory = await temporary();
  try {
    const valid = join(directory, "valid.tgz");
    await writeFile(valid, archive("package/bin/fixture"));
    await extractOfficialPackage(valid, directory, signal());
    assert.equal(await readFile(join(directory, "package/bin/fixture"), "utf8"), "fixture");
    const traversal = join(directory, "traversal.tgz");
    await writeFile(traversal, archive("package/../../escape"));
    await assert.rejects(extractOfficialPackage(traversal, directory, signal()), /越界路径/);
    const linked = join(directory, "link.tgz");
    await writeFile(linked, archive("package/link", "2"));
    await assert.rejects(extractOfficialPackage(linked, directory, signal()), /不允许的链接/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
