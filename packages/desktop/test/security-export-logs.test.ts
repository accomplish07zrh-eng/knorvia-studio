import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as yauzl from "yauzl";

async function readZipText(path: string): Promise<Map<string, string>> {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (error, file) => {
      if (error || !file) reject(error ?? new Error("ZIP could not be opened"));
      else resolve(file);
    });
  });
  return new Promise((resolve, reject) => {
    const entries = new Map<string, string>();
    zip.on("error", reject);
    zip.on("end", () => resolve(entries));
    zip.on("entry", (entry: yauzl.Entry) => {
      zip.openReadStream(entry, (error, stream) => {
        if (error || !stream) {
          reject(error ?? new Error("ZIP entry could not be opened"));
          return;
        }
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => {
          entries.set(entry.fileName, Buffer.concat(chunks).toString("utf8"));
          zip.readEntry();
        });
      });
    });
    zip.readEntry();
  });
}

test("diagnostic export excludes private state and removes credentials from actual output", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-security-export-"));
  const previous = process.env.KNORVIA_DATA_BASE_DIR;
  process.env.KNORVIA_DATA_BASE_DIR = root;
  const source = join(root, "source");
  const apiKey = "sk-abcdefghijklmnopqrstuvwxyz123456";
  const token = "ghp_abcdefghijklmnopqrstuvwxyz123456";
  const sshPassword = "fake-ssh-password-never-export";
  const privateBody = "FAKE_PRIVATE_KEY_MATERIAL_NEVER_EXPORT";
  try {
    const { exportLogs } = await import("../src/main/exportLogs.js");
    for (const path of [
      "logs",
      "studio/shared-mcp/turn-1-test",
      "creation",
      "crash/archive",
      "other",
    ]) {
      await mkdir(join(source, path), { recursive: true });
    }
    await writeFile(
      join(source, "logs", "today.log"),
      [
        "ready: true",
        `apiKey=${apiKey}`,
        `Authorization: Bearer ${token}`,
        `ssh_password=${sshPassword}`,
        "-----BEGIN OPENSSH PRIVATE KEY-----",
        privateBody,
        "-----END OPENSSH PRIVATE KEY-----",
        `unstructured ${token}`,
        "last line: usable",
      ].join("\n"),
    );
    await writeFile(join(source, "studio", "shared-mcp", "turn-1-test", "mcp.json"), apiKey);
    await writeFile(join(source, "creation", "models.json"), apiKey);
    await writeFile(join(source, "crash", "archive", "memory.dmp"), Buffer.from(`\0${apiKey}\0`));
    await writeFile(join(source, "other", "unknown.bin"), Buffer.from(`\0${token}\0`));
    await writeFile(join(source, "credentials.json"), apiKey);
    const result = await exportLogs({
      getKnorviaDataDir: () => source,
      getExportLogDir: () => join(root, "output"),
      getExportLogStageDir: () => join(root, "stage"),
      writeLogArchiveZip: async () => {
        throw new Error("exercise directory export");
      },
      showItemInFolder: async () => {},
    });
    assert.equal(result.success, true);
    assert(result.path);
    const log = await readFile(join(result.path, "logs", "today.log"), "utf8");
    assert.match(log, /ready: true/);
    assert.match(log, /last line: usable/);
    for (const secret of [apiKey, token, sshPassword, privateBody]) {
      assert.equal(log.includes(secret), false);
    }
    for (const path of [
      "studio/shared-mcp/turn-1-test/mcp.json",
      "creation/models.json",
      "crash/archive/memory.dmp",
      "other/unknown.bin",
      "credentials.json",
    ]) {
      await assert.rejects(stat(join(result.path, path)), { code: "ENOENT" }, path);
    }

    const zipped = await exportLogs({
      getKnorviaDataDir: () => source,
      getExportLogDir: () => join(root, "output"),
      getExportLogStageDir: () => join(root, "stage"),
      showItemInFolder: async () => {},
    });
    assert.equal(zipped.success, true);
    assert(zipped.path?.endsWith(".zip"));
    const entries = await readZipText(zipped.path);
    assert.deepEqual([...entries.keys()].sort(), ["about.txt", "logs/today.log"]);
    assert.equal(entries.get("logs/today.log"), log);
    for (const secret of [apiKey, token, sshPassword, privateBody]) {
      assert.equal(
        [...entries.values()].some((value) => value.includes(secret)),
        false,
      );
    }
  } finally {
    if (previous === undefined) delete process.env.KNORVIA_DATA_BASE_DIR;
    else process.env.KNORVIA_DATA_BASE_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
