import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  externalUpdatePlan,
  nativeLauncherMatches,
  runExternalUpdate,
} from "../src/studio-runtime/adapters/kernels/externalUpdate.js";

test("only verified native executables expose their own update command", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-update-native-"));
  try {
    for (const [kernel, name] of [
      ["claude-code", "claude"],
      ["grok-build", "grok"],
      ["opencode", "opencode"],
      ["qoder", "qoder"],
      ["qoder-cn", "qoderclicn"],
      ["goose", "goose"],
      ["hermes", "hermes"],
    ] as const) {
      const executable = join(root, name + (process.platform === "win32" ? ".exe" : ""));
      await writeFile(executable, "fixture");
      const resolved = { path: executable, command: executable, args: [] };
      const plan = await externalUpdatePlan(kernel, resolved);
      assert.deepEqual(plan, {
        command: executable,
        args:
          kernel === "hermes"
            ? ["update", "--yes"]
            : kernel === "opencode"
              ? ["upgrade"]
              : ["update"],
        cwd: root,
        method: "native",
      });
      assert.equal(await externalUpdatePlan("antigravity", resolved), undefined);
      assert.equal(
        await externalUpdatePlan(kernel, { ...resolved, command: process.execPath }),
        undefined,
      );
      assert.equal(
        await externalUpdatePlan(kernel, { ...resolved, args: ["unexpected"] }),
        undefined,
      );
    }
    const wrong = join(root, process.platform === "win32" ? "other.exe" : "other");
    await writeFile(wrong, "fixture");
    assert.equal(
      await externalUpdatePlan("claude-code", { path: wrong, command: wrong, args: [] }),
      undefined,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("versioned Qoder targets require the stable same-directory launcher", () => {
  const native = { name: "qoderclicn", versionedTarget: true };
  const extension = process.platform === "win32" ? ".exe" : "";
  const stable = join(tmpdir(), `qoderclicn${extension}`);
  assert.equal(
    nativeLauncherMatches(native, stable, join(tmpdir(), `qoderclicn-1.2.3${extension}`)),
    true,
  );
  assert.equal(
    nativeLauncherMatches(native, stable, join(tmpdir(), "other", `qoderclicn-1.2.3${extension}`)),
    false,
  );
  assert.equal(
    nativeLauncherMatches(native, stable, join(tmpdir(), `other-1.2.3${extension}`)),
    false,
  );
});

test("Codex npm update stays in the detected prefix and rejects incomplete installs", async () => {
  if (process.platform !== "win32") return;
  const prefix = await mkdtemp(join(tmpdir(), "knorvia-update-codex-"));
  try {
    const packageRoot = join(prefix, "node_modules", "@openai", "codex");
    const entry = join(packageRoot, "bin", "codex.js");
    const npmCli = join(prefix, "node_modules", "npm", "bin", "npm-cli.js");
    const node = join(prefix, "node.exe");
    const shim = join(prefix, "codex.cmd");
    await mkdir(join(packageRoot, "bin"), { recursive: true });
    await mkdir(join(prefix, "node_modules", "npm", "bin"), { recursive: true });
    await Promise.all([
      writeFile(
        join(packageRoot, "package.json"),
        JSON.stringify({
          name: "@openai/codex",
          bin: { codex: "bin/codex.js" },
        }),
      ),
      writeFile(entry, "fixture"),
      writeFile(npmCli, "fixture"),
      writeFile(node, "fixture"),
      writeFile(shim, "fixture"),
    ]);
    const executable = { command: node, args: [entry], path: shim };
    assert.deepEqual(await externalUpdatePlan("codex", executable), {
      command: node,
      args: [npmCli, "install", "-g", "--prefix", prefix, "@openai/codex@latest"],
      cwd: prefix,
      method: "npm",
    });
    const geminiRoot = join(prefix, "node_modules", "@google", "gemini-cli");
    const geminiEntry = join(geminiRoot, "dist", "index.js");
    await mkdir(join(geminiRoot, "dist"), { recursive: true });
    await Promise.all([
      writeFile(
        join(geminiRoot, "package.json"),
        JSON.stringify({
          name: "@google/gemini-cli",
          bin: { gemini: "dist/index.js" },
        }),
      ),
      writeFile(geminiEntry, "fixture"),
      writeFile(join(prefix, "gemini.cmd"), "fixture"),
    ]);
    assert.deepEqual(
      await externalUpdatePlan("gemini-cli", {
        path: join(prefix, "gemini.cmd"),
        command: node,
        args: [geminiEntry],
      }),
      {
        command: node,
        args: [npmCli, "install", "-g", "--prefix", prefix, "@google/gemini-cli@latest"],
        cwd: prefix,
        method: "npm",
      },
    );
    await rm(npmCli);
    assert.equal(await externalUpdatePlan("codex", executable), undefined);
  } finally {
    await rm(prefix, { recursive: true, force: true });
  }
});

test("update runner uses an argv process and reports nonzero exit", async () => {
  const plan = {
    command: process.execPath,
    args: ["-e", "process.stdout.write('ok')"],
    cwd: tmpdir(),
    method: "native" as const,
  };
  await runExternalUpdate(plan);
  await assert.rejects(
    runExternalUpdate({ ...plan, args: ["-e", "process.exit(7)"] }),
    /退出 \(7\)/,
  );
});
