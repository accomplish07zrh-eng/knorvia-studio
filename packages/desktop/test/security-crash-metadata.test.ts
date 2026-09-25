import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let crashReporterStarts = 0;
mock.module("electron", {
  namedExports: {
    app: { name: "Knorvia Studio", getName: () => "Knorvia Studio", setPath() {} },
    crashReporter: {
      start() {
        crashReporterStarts++;
      },
    },
  },
});

function annotation(key: string, value: string): Buffer {
  const keyBytes = Buffer.from(key);
  const valueBytes = Buffer.from(value);
  const valueOffset = (4 + keyBytes.length + 1 + 3) & ~3;
  const result = Buffer.alloc(valueOffset + 4 + valueBytes.length);
  result.writeUInt32LE(keyBytes.length, 0);
  keyBytes.copy(result, 4);
  result.writeUInt32LE(valueBytes.length, valueOffset);
  valueBytes.copy(result, valueOffset + 4);
  return result;
}

test("archived crash metadata hides credentials found in native annotations", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-crash-security-"));
  const paths = {
    rootDir: root,
    stagingDir: join(root, "live"),
    archiveDir: join(root, "archive"),
  };
  const marker = "sk-abcdefghijklmnopqrstuvwxyz123456";
  const sshPassword = "fake-ssh-password-never-archive";
  const token = "ghp_abcdefghijklmnopqrstuvwxyz123456";
  const privateBody = "FAKE_PRIVATE_KEY_MATERIAL_NEVER_ARCHIVE";
  try {
    const { archiveCrashDumps } = await import("../src/main/desktopCrashCapture.js");
    const reports = join(paths.stagingDir, "reports");
    await mkdir(reports, { recursive: true });
    await writeFile(
      join(reports, "test.dmp"),
      Buffer.concat([
        annotation("v8-oom-location", "OOM"),
        annotation("v8-oom-stack", `apiKey=${marker}`),
        annotation(
          "v8-oom-last-few-messages",
          `Authorization: Bearer ${token}\nsshPassword=${sshPassword}\n-----BEGIN OPENSSH PRIVATE KEY-----\n${privateBody}\n-----END OPENSSH PRIVATE KEY-----`,
        ),
      ]),
    );
    const result = archiveCrashDumps(paths, {
      platform: "win32",
      now: new Date(Date.now() + 2_000),
    });
    assert.equal(result.archivedDumps.length, 1);
    const metadata = await readFile(join(paths.archiveDir, "test.dmp.json"), "utf8");
    for (const secret of [marker, sshPassword, token, privateBody]) {
      assert.equal(metadata.includes(secret), false, secret);
      assert.equal(
        JSON.stringify(result.archivedDumps[0]?.v8OomSummary).includes(secret),
        false,
        secret,
      );
    }
    assert.match(metadata, /v8OomSummary/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("default desktop startup does not enable raw memory dump capture", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-crash-default-"));
  const previous = process.env.KNORVIA_DATA_BASE_DIR;
  process.env.KNORVIA_DATA_BASE_DIR = root;
  try {
    const { initializeCrashCapture } = await import("../src/main/desktopCrashCapture.js");
    const before = crashReporterStarts;
    const messages: string[] = [];
    initializeCrashCapture(
      {
        info: (...args) => messages.push(args.join(" ")),
        warn() {},
        error() {},
      },
      false,
    );
    assert.equal(crashReporterStarts, before);
    assert.ok(messages.some((message) => message.includes("raw local dumps disabled")));
  } finally {
    if (previous === undefined) delete process.env.KNORVIA_DATA_BASE_DIR;
    else process.env.KNORVIA_DATA_BASE_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
