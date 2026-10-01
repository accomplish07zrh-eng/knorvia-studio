// Actual caller acceptance uses only owned synthetic application/CLI/helper directories.
import assert from "node:assert/strict";
import { mkdir, readFile, readdir, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  archiveFixture,
  archiveEntries,
  archiveNow,
} from "./feedback-archive-fixtures-fast-20261001.js";

test("desktop feedback caller selects owned app, CLI and direct helper logs without modifying sources", async (t) => {
  const f = await archiveFixture(t);
  const values = {
    KNORVIA_ENV: "test",
    KNORVIA_DATA_BASE_DIR: f.root,
    KNORVIA_STORAGE_DIR: join(f.root, "owned-cli-storage"),
    KNORVIA_E2E_RUNTIME_LOG_DIR: join(f.root, "owned-runtime-logs"),
  };
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const emitted = process.env.KNORVIA_FEEDBACK_ARCHIVE_TARGET === "dist";
  const desktopUrl = new URL(
    `../../desktop/${emitted ? "out/typecheck-main/main/exportLogs.js" : "src/main/exportLogs.ts"}`,
    import.meta.url,
  );
  const {
    createFeedbackLogArchiveFromExportLogs,
  }: typeof import("../../desktop/src/main/exportLogs.js") = await import(desktopUrl.href);
  const { getAppConfigDir }: typeof import("../src/node.js") =
    await import("@knorvia/services/node");
  assert.equal(getAppConfigDir(), join(f.root, ".knorvia-studio", "v2"));
  if (emitted) {
    assert.equal(
      import.meta.resolve("@knorvia/services/node"),
      new URL("../dist/node.js", import.meta.url).href,
    );
    assert.match(desktopUrl.href, /\/out\/typecheck-main\/main\/exportLogs\.js$/);
  }
  const dataRoot = join(f.root, ".knorvia-studio");
  const fixtures = [
    [join(f.source, "logs", "app.log"), 'lifecycle app started\napiKey="synthetic-app-key"\n'],
    [
      join(dataRoot, "cli", "log", "cli.log"),
      'lifecycle cli started\n{"input":"synthetic-private-payload"}\n',
    ],
    [
      join(dataRoot, "computer-use", "run", "helper.exit.log"),
      "helper exit status 0\nsynthetic.person@example.test\n",
    ],
    [join(dataRoot, "computer-use", "run", "broker.tokens"), "synthetic-broker-token"],
    [join(dataRoot, "computer-use", "run", "nested", "child.exit.log"), "synthetic-nested-private"],
    [join(f.source, "logs", "credentials.json"), "synthetic-excluded-account"],
  ];
  for (const [path, text] of fixtures) {
    await mkdir(dirname(path!), { recursive: true });
    await writeFile(path!, text!);
    await utimes(path!, archiveNow, archiveNow);
  }
  const progress: object[] = [];
  const result = await createFeedbackLogArchiveFromExportLogs(f.source, {
    outputRootDir: f.outputRootDir,
    now: () => archiveNow,
    onProgress: (event) => progress.push(event),
  });
  const entries = await archiveEntries(result.path);
  assert.deepEqual(
    entries.map((entry) => entry.name),
    [
      "logs/app.log",
      ".knorvia-studio/cli/log/cli.log",
      ".knorvia-studio/computer-use/run/helper.exit.log",
      "about.txt",
    ],
  );
  const contents = entries.map((entry) => entry.data.toString()).join("\n");
  assert.match(contents, /lifecycle app started/);
  assert.match(contents, /lifecycle cli started/);
  assert.match(contents, /helper exit status 0/);
  assert.doesNotMatch(
    contents,
    /synthetic-(?:app-key|private-payload|broker-token|nested-private|excluded-account)|synthetic\.person@example\.test/,
  );
  assert.deepEqual(progress, [
    { processedBytes: 0, totalBytes: 0 },
    { processedBytes: result.size, totalBytes: result.size },
  ]);
  for (const [path, text] of fixtures) assert.equal(await readFile(path!, "utf8"), text);
});

test("actual ZIP construction rejects unsafe archive names and removes the owned operation", async (t) => {
  const f = await archiveFixture(t);
  await f.file("a.log", "synthetic safe lifecycle");
  const emitted = process.env.KNORVIA_FEEDBACK_ARCHIVE_TARGET === "dist";
  const {
    createFeedbackDiagnosticArchive,
  }: typeof import("../src/feedback/feedbackLogArchive.js") = await import(
    process.env.KNORVIA_FEEDBACK_ARCHIVE_MODULE ??
      new URL(
        `../${emitted ? "dist" : "src"}/feedback/feedbackLogArchive.${emitted ? "js" : "ts"}`,
        import.meta.url,
      ).href
  );
  await assert.rejects(
    createFeedbackDiagnosticArchive({
      sources: [{ directory: f.source, archivePrefix: "../unsafe" }],
      outputRootDir: f.outputRootDir,
      now: () => archiveNow,
    }),
    /invalid relative path/,
  );
  assert.deepEqual(await readdir(f.outputRootDir), []);
  assert.equal(await readFile(join(f.source, "a.log"), "utf8"), "synthetic safe lifecycle");
});
