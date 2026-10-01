import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { compactStudioTestArguments } from "./studio-test-arguments.mjs";

const run = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const names = [
  "ordinary.test.mjs",
  ".hidden.test.mjs",
  ".test.mjs",
  "space name.test.mjs",
  "[square]{brace}.test.mjs",
  "typed.test.ts",
];

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "knorvia-test-arguments-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "owned tests/nested"), { recursive: true });
  for (const name of names) {
    await writeFile(
      join(root, "owned tests", name),
      `import { test } from 'node:test'; test(${JSON.stringify(name)}, () => {});\n`,
    );
  }
  await writeFile(
    join(root, "owned tests/typed.test.ts"),
    "import assert from 'node:assert/strict'; import { test, mock } from 'node:test'; const value: number = 7; test('typed module mock', async () => { const handle = mock.module('node:os', { namedExports: { platform: () => 'owned' } }); try { const module = await import('node:os'); assert.equal(module.platform(), 'owned'); assert.equal(value, 7); } finally { handle.restore(); } });\n",
  );
  await writeFile(
    join(root, "owned tests/nested/poison.test.mjs"),
    "throw new Error('nested file must not run');\n",
  );
  await writeFile(
    join(root, "explicit.test.mjs"),
    "import { test } from 'node:test'; test('explicit', () => {});\n",
  );
  return {
    repoRoot: root,
    explicitTests: ["explicit.test.mjs"],
    testDirectories: ["owned tests"],
    discoveredTests: ["explicit.test.mjs", ...names.map((name) => `owned tests/${name}`)],
  };
}

const nodeFlags = [
  "--experimental-test-module-mocks",
  "--import",
  import.meta.resolve("tsx"),
  "--test",
  "--test-concurrency=2",
  "--test-timeout=120000",
  "--test-reporter=tap",
];

function childEnvironment() {
  const env = { ...process.env };
  // 子探针是独立的 Node CLI 调用，不能继承父测试工作进程的内部启动标记。
  delete env.NODE_TEST_CONTEXT;
  for (const key of Object.keys(env)) {
    if (/(?:API[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|SECRET|PASSWORD|_KEY)$/iu.test(key)) {
      delete env[key];
    }
  }
  return env;
}

test("native CLI compact selection includes hidden, empty-stem, metacharacter and TS names only at top level", async (t) => {
  const input = await fixture(t);
  const args = await compactStudioTestArguments(input);
  assert.deepEqual(args, ["explicit.test.mjs", "owned tests/{*.test,.*.test,.test}.{ts,mjs}"]);
  const { stdout } = await run(process.execPath, [...nodeFlags, ...args], {
    cwd: input.repoRoot,
    env: childEnvironment(),
    maxBuffer: 1024 * 1024,
  });
  assert.match(stdout, /# tests 7\b/u);
  assert.match(stdout, /# pass 7\b/u);
  assert.match(stdout, /# fail 0\b/u);
});

test("native compact runner preserves failure exit status", async (t) => {
  const input = await fixture(t);
  await writeFile(
    join(input.repoRoot, "owned tests/ordinary.test.mjs"),
    "import { test } from 'node:test'; test('owned failure', () => { throw new Error('owned failure'); });\n",
  );
  const args = await compactStudioTestArguments(input);
  await assert.rejects(
    run(process.execPath, [...nodeFlags, ...args], {
      cwd: input.repoRoot,
      env: childEnvironment(),
      maxBuffer: 1024 * 1024,
    }),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stdout, /# tests 7\b/u);
      assert.match(error.stdout, /# fail 1\b/u);
      return true;
    },
  );
});

test("missing explicit file is rejected rather than silently omitted by native globs", async (t) => {
  const input = await fixture(t);
  await rm(join(input.repoRoot, "explicit.test.mjs"));
  await assert.rejects(
    compactStudioTestArguments(input),
    /selection differs: missing=\["explicit.test.mjs"\]/u,
  );
});

test("a newly discovered or missing directory file cannot silently change selection", async (t) => {
  const input = await fixture(t);
  await writeFile(join(input.repoRoot, "owned tests/extra.test.mjs"), "");
  await assert.rejects(
    compactStudioTestArguments(input),
    /unexpected=\["owned tests\/extra.test.mjs"\]/u,
  );
  await rm(join(input.repoRoot, "owned tests/extra.test.mjs"));
  await rm(join(input.repoRoot, "owned tests/ordinary.test.mjs"));
  await assert.rejects(
    compactStudioTestArguments(input),
    /missing=\["owned tests\/ordinary.test.mjs"\]/u,
  );
});

test("empty and duplicate discovery fail closed", async (t) => {
  const input = await fixture(t);
  await assert.rejects(
    compactStudioTestArguments({ ...input, discoveredTests: [] }),
    /empty or contains duplicate/u,
  );
  await assert.rejects(
    compactStudioTestArguments({
      ...input,
      discoveredTests: [...input.discoveredTests, input.discoveredTests[0]],
    }),
    /empty or contains duplicate/u,
  );
});

test("case-insensitive native globs cannot widen case-sensitive discovery", async (t) => {
  const input = await fixture(t);
  await writeFile(join(input.repoRoot, "owned tests/extra.TEST.MJS"), "");
  if (process.platform === "win32" || process.platform === "darwin") {
    await assert.rejects(
      compactStudioTestArguments(input),
      /unexpected=\["owned tests\/extra.TEST.MJS"\]/u,
    );
  } else {
    assert.equal((await compactStudioTestArguments(input)).length, 2);
  }
});

test("long discovered path lists collapse to bounded native arguments without dropping files", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-long-test-arguments-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "owned"));
  const files = Array.from(
    { length: 420 },
    (_, index) => `owned/${"long-owned-name-".repeat(6)}${index}.test.mjs`,
  );
  await Promise.all(files.map((path) => writeFile(join(root, path), "")));
  assert.ok(files.join(" ").length > 32767);
  const args = await compactStudioTestArguments({
    repoRoot: root,
    explicitTests: [],
    testDirectories: ["owned"],
    discoveredTests: files,
  });
  assert.equal(args.length, 1);
  assert.ok(args.join(" ").length < 100);
});

test("runner retains execution flags, isolation and credential filtering", async () => {
  const source = await readFile(join(repoRoot, "scripts/test-studio.mjs"), "utf8");
  for (const fragment of [
    '"--experimental-test-module-mocks"',
    '"--import"',
    '"tsx"',
    '"--test-concurrency=2"',
    "`--test-timeout=${testTimeoutMs}`",
    "const DEFAULT_TEST_TIMEOUT_MS = 120_000;",
    'KNORVIA_ENV: "test"',
    "KNORVIA_DATA_BASE_DIR: testHome",
    "delete env[key]",
    "process.exitCode = result.code ?? 1",
    "await rm(testHome, { recursive: true, force: true })",
  ]) {
    assert.ok(source.includes(fragment), fragment);
  }
});
