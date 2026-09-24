import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as yauzl from "yauzl";

async function readZip(path: string): Promise<Map<string, Buffer>> {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (error, file) => {
      if (error || !file) reject(error ?? new Error("ZIP could not be opened"));
      else resolve(file);
    });
  });
  return new Promise((resolve, reject) => {
    const entries = new Map<string, Buffer>();
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
          entries.set(entry.fileName, Buffer.concat(chunks));
          zip.readEntry();
        });
      });
    });
    zip.readEntry();
  });
}

test("local diagnostic preview freezes a redacted, allowlisted ZIP", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-local-diagnostics-"));
  const previous = process.env.KNORVIA_DATA_BASE_DIR;
  process.env.KNORVIA_DATA_BASE_DIR = root;
  const source = join(root, "source");
  const secret = ["sk", "abcdefghijklmnopqrstuvwxyz123456"].join("-");
  const token = ["ghp", "abcdefghijklmnopqrstuvwxyz123456"].join("_");
  try {
    const { previewLocalDiagnostics, exportLocalDiagnostics } = await import("../src/main/localDiagnostics.js");
    await mkdir(join(source, "logs"), { recursive: true });
    await mkdir(join(source, "creation"), { recursive: true });
    await mkdir(join(source, "studio"), { recursive: true });
    const sourceLog = join(source, "logs", `apiKey=${secret}.log`);
    await writeFile(sourceLog, `ready: true\napiKey=${secret}\nAuthorization: Bearer ${token}\n`);
    await writeFile(join(source, "creation", "models.json"), secret);
    await writeFile(join(source, "studio", "runtime.sqlite"), secret);
    await writeFile(join(source, "credentials.json"), token);
    const preview = await previewLocalDiagnostics({
      inspection: "complete",
      kernels: [{ id: "codex", name: `Local ${secret}`, installed: true, version: token, origin: "external" }],
    }, {
      sourceDir: source,
      stageRootDir: join(root, "stage"),
    });
    assert.deepEqual(preview.files.map((file) => file.path), ["kernels.json", "logs/app-0001.log", "system.txt"]);
    assert.equal(preview.files.some((file) => file.snippet.includes(secret) || file.snippet.includes(token)), false);
    assert.match(preview.files.find((file) => file.path === "kernels.json")?.snippet ?? "", /\[redacted\]/);
    assert.equal(preview.files.find((file) => file.path === "system.txt")?.snippet.includes("Hostname"), false);

    await writeFile(sourceLog, "rotated log after preview\n");
    const result = await exportLocalDiagnostics(preview.id, {
      outputRootDir: join(root, "output"),
      showItemInFolder: async () => {},
    });
    assert.equal(result.success, true, result.error);
    assert(result.path);
    const entries = await readZip(result.path);
    assert.deepEqual([...entries.keys()].sort(), preview.files.map((file) => file.path));
    for (const file of preview.files) {
      const contents = entries.get(file.path);
      assert(contents);
      assert.equal(contents.length, file.bytes);
      assert.equal(createHash("sha256").update(contents).digest("hex"), file.sha256);
      assert.equal(contents.toString("utf8").includes(secret), false);
      assert.equal(contents.toString("utf8").includes(token), false);
    }
    assert.match(entries.get("logs/app-0001.log")?.toString("utf8") ?? "", /ready: true/);
    assert.doesNotMatch(entries.get("logs/app-0001.log")?.toString("utf8") ?? "", /rotated log/);
    assert.equal((await exportLocalDiagnostics(preview.id)).success, false);
    assert.equal((await exportLocalDiagnostics(join(root, "credentials.json"))).success, false);
  } finally {
    if (previous === undefined) delete process.env.KNORVIA_DATA_BASE_DIR;
    else process.env.KNORVIA_DATA_BASE_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
