import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StudioKernelConfig, StudioKernelId } from "../src/studio-runtime/kernelTypes.js";
import { ManagedKernels } from "../src/studio-runtime/adapters/kernels/managedKernels.js";
import { createStudioKernelRegistry } from "../src/studio-runtime/adapters/kernels/kernelRegistry.js";
import {
  hashFile,
  type installOfficialKernel,
} from "../src/studio-runtime/adapters/kernels/installSource.js";

const receiptName = ".knorvia-managed.json";
const builtin = {
  async run() {
    return { status: "succeeded" as const, text: "", resultKnown: true };
  },
};
const installer =
  (version: string): typeof installOfficialKernel =>
  async (_kernel, stage) => {
    await writeFile(join(stage, "fixture.cjs"), `console.log('fixture ${version}')`);
    await writeFile(join(stage, "agent.cjs"), "// companion executable");
    return {
      version,
      executable: "fixture.cjs",
      sha256: await hashFile(join(stage, "fixture.cjs")),
    };
  };
async function setup() {
  const data = await mkdtemp(join(tmpdir(), "knorvia-versions-"));
  const first = new ManagedKernels(data, () => false, installer("1.2.3"));
  const next = new ManagedKernels(data, () => false, installer("1.2.4"));
  const registry = createStudioKernelRegistry({ dataDir: data, builtin });
  return {
    data,
    first,
    next,
    registry,
    async cleanup() {
      await Promise.all([first.dispose(), next.dispose(), registry.dispose()]);
      await rm(data, { recursive: true, force: true });
    },
  };
}
function configurations(data: string, codex: string): Record<StudioKernelId, StudioKernelConfig> {
  const missing = { executablePath: join(data, "not-installed"), permission: "ask" as const };
  return {
    knorvia: missing,
    codex: { ...missing, executablePath: codex },
    "claude-code": missing,
    "grok-build": missing,
  };
}
async function run(context: Awaited<ReturnType<typeof setup>>, executablePath: string) {
  return context.registry.adapter("codex").run(
    {
      runId: "run",
      turnId: "turn",
      conversationId: "chat",
      kernel: "codex",
      workspacePath: context.data,
      executablePath,
      permission: "ask",
      text: "fixture",
    },
    {
      async emit() {},
      async ask() {
        throw new Error("must not reach protocol");
      },
    },
    new AbortController().signal,
  );
}

test("retained versions have independently verifiable receipts and remain managed after an update", async () => {
  const context = await setup();
  try {
    await context.first.manage("codex", "install");
    const previous = (await context.first.current("codex"))!;
    const receipt = JSON.parse(
      await readFile(join(context.data, "kernels", previous.entry.directory, receiptName), "utf8"),
    );
    assert.equal(receipt.owner, "knorvia-studio");
    assert.equal(receipt.kernel, "codex");
    assert.equal(receipt.directory, previous.entry.directory);
    assert.equal(receipt.files["fixture.cjs"], previous.entry.sha256);
    assert.ok(receipt.files["agent.cjs"]);
    await context.next.manage("codex", "update");
    assert.notEqual((await context.next.current("codex"))!.path, previous.path);
    assert.equal(await context.next.verifiedPath("codex", previous.path), previous.path);
    const statuses = await context.registry.inspect(configurations(context.data, previous.path));
    const status = statuses.find((entry) => entry.id === "codex")!;
    assert.equal(status.installed, true, status.error);
    assert.equal(status.origin, "managed");
    assert.equal(status.version, "1.2.3");
  } finally {
    await context.cleanup();
  }
});

test("explicit managed paths reject tampering before version probes or execution", async () => {
  const context = await setup();
  try {
    await context.first.manage("codex", "install");
    const previous = (await context.first.current("codex"))!;
    await context.next.manage("codex", "update");
    const marker = join(context.data, "must-not-execute");
    await writeFile(
      previous.path,
      `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'bad');console.log('fixture 1.2.3')`,
    );
    await assert.rejects(context.next.verifiedPath("codex", previous.path), /完整性已改变/);
    const status = (
      await context.registry.inspect(configurations(context.data, previous.path))
    ).find((entry) => entry.id === "codex")!;
    assert.equal(status.installed, false);
    assert.match(status.error!, /完整性已改变/);
    const result = await run(context, previous.path);
    assert.equal(result.status, "failed");
    assert.equal(result.resultKnown, true);
    assert.match(result.error!, /完整性已改变/);
    await assert.rejects(stat(marker), { code: "ENOENT" });
  } finally {
    await context.cleanup();
  }
});

test("companion program changes invalidate the version even when its primary executable matches", async () => {
  const context = await setup();
  try {
    await context.first.manage("codex", "install");
    const current = (await context.first.current("codex"))!;
    await writeFile(
      join(context.data, "kernels", current.entry.directory, "agent.cjs"),
      "// changed",
    );
    assert.equal(await hashFile(current.path), current.entry.sha256);
    await assert.rejects(context.first.resolve("codex", current.path), /完整性已改变/);
    await assert.rejects(context.first.manage("codex", "uninstall"), /完整性已改变/);
    assert.equal((await context.first.current("codex"))!.path, current.path);
  } finally {
    await context.cleanup();
  }
});

test("missing legacy receipts never authorize explicit execution or directory removal", async () => {
  const context = await setup();
  try {
    await context.first.manage("codex", "install");
    const current = (await context.first.current("codex"))!;
    await rm(join(context.data, "kernels", current.entry.directory, receiptName));
    await assert.rejects(context.first.resolve("codex", current.path), /缺少有效 Studio 版本收据/);
    await assert.rejects(context.first.manage("codex", "uninstall"), /缺少有效 Studio 版本收据/);
    assert.equal(await hashFile(current.path), current.entry.sha256);
  } finally {
    await context.cleanup();
  }
});

test("a receipt cannot be reassigned to another owner, kernel or version directory", async () => {
  const context = await setup();
  try {
    await context.first.manage("codex", "install");
    const current = (await context.first.current("codex"))!;
    const path = join(context.data, "kernels", current.entry.directory, receiptName);
    const receipt = JSON.parse(await readFile(path, "utf8"));
    for (const changed of [
      { owner: "another-app" },
      { kernel: "claude-code" },
      { directory: "codex-another-version", executable: "codex-another-version/fixture.cjs" },
      { sha256: "0".repeat(64) },
    ]) {
      await writeFile(path, JSON.stringify({ ...receipt, ...changed }));
      await assert.rejects(context.first.resolve("codex", current.path), /收据/);
      assert.equal(await hashFile(current.path), current.entry.sha256);
    }
    await writeFile(path, JSON.stringify(receipt));
    assert.equal((await context.first.resolve("codex", current.path)).managed, true);
  } finally {
    await context.cleanup();
  }
});

test("uninstall removes every owned version and leaves unknown, foreign and other-kernel directories", async () => {
  const context = await setup();
  try {
    await context.first.manage("codex", "install");
    const old = (await context.first.current("codex"))!;
    await context.next.manage("codex", "update");
    const current = (await context.next.current("codex"))!;
    await context.first.manage("claude-code", "install");
    const other = (await context.first.current("claude-code"))!;
    const unknown = join(context.data, "kernels", "codex-user-files");
    const foreign = join(context.data, "kernels", "codex-foreign");
    const external = join(context.data, "system-cli");
    for (const directory of [unknown, foreign, external]) {
      await mkdir(directory);
      await writeFile(join(directory, "keep"), "user data");
    }
    await writeFile(
      join(foreign, receiptName),
      JSON.stringify({ owner: "another-app", kernel: "codex" }),
    );
    await context.next.manage("codex", "uninstall");
    assert.equal(await context.next.current("codex"), undefined);
    for (const path of [old.path, current.path])
      await assert.rejects(stat(path), { code: "ENOENT" });
    assert.equal(await context.first.verifiedPath("claude-code"), other.path);
    for (const directory of [unknown, foreign, external])
      assert.equal(await readFile(join(directory, "keep"), "utf8"), "user data");
  } finally {
    await context.cleanup();
  }
});

test("an unrecognized file aborts the whole uninstall before any owned version is removed", async () => {
  const context = await setup();
  try {
    await context.first.manage("codex", "install");
    const old = (await context.first.current("codex"))!;
    await context.next.manage("codex", "update");
    const current = (await context.next.current("codex"))!;
    const userFile = join(context.data, "kernels", old.entry.directory, "notes.txt");
    await writeFile(userFile, "keep my notes");
    await assert.rejects(context.next.manage("codex", "uninstall"), /未知文件/);
    assert.equal(await readFile(userFile, "utf8"), "keep my notes");
    assert.equal(await hashFile(old.path), old.entry.sha256);
    assert.equal(await hashFile(current.path), current.entry.sha256);
    assert.equal((await context.first.current("codex"))!.path, current.path);
  } finally {
    await context.cleanup();
  }
});

test("managed and external junction aliases cannot bypass version ownership", async () => {
  const context = await setup();
  try {
    await context.first.manage("codex", "install");
    const current = (await context.first.current("codex"))!;
    const target = join(context.data, "kernels", current.entry.directory);
    const external = join(context.data, "external-alias");
    const internal = join(context.data, "kernels", "codex-alias");
    const kind = process.platform === "win32" ? "junction" : "dir";
    await symlink(target, external, kind);
    await symlink(target, internal, kind);
    await assert.rejects(context.first.resolve("codex", join(external, "fixture.cjs")), /重定向/);
    await assert.rejects(context.first.resolve("codex", join(internal, "fixture.cjs")), /符号链接/);
    await assert.rejects(context.first.manage("codex", "uninstall"), /符号链接/);
    assert.equal(await hashFile(current.path), current.entry.sha256);
    await rm(external);
    await rm(internal);
  } finally {
    await context.cleanup();
  }
});

test("owned orphan versions can be removed after the current manifest was already removed", async () => {
  const context = await setup();
  try {
    await context.first.manage("codex", "install");
    const old = (await context.first.current("codex"))!;
    await context.next.manage("codex", "update");
    const current = (await context.next.current("codex"))!;
    await rm(join(context.data, "kernels", "codex.json"));
    await context.next.manage("codex", "uninstall");
    for (const path of [old.path, current.path])
      await assert.rejects(stat(path), { code: "ENOENT" });
  } finally {
    await context.cleanup();
  }
});
