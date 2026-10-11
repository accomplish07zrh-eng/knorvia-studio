// SPDX-License-Identifier: Apache-2.0
// M0-10 契约测试收录的回归：夹具与断言同时兼容 Windows 与 POSIX（见 specs/knorvia-contract-test-collection.md）。
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { explicitTests, testDirectories } from "./studio-test-manifest.mjs";
import {
  CONTRACT_TESTS_ROOT,
  discoverContractTests,
  selectStudioTests,
} from "./studio-test-selection.mjs";

const run = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runnerModules = [
  "scripts/test-studio.mjs",
  "scripts/studio-test-selection.mjs",
  "scripts/studio-test-arguments.mjs",
];
// 夹具清单与真实清单同构，但只含夹具自己的两条入口：真实清单由每次 pnpm test:studio 实跑覆盖，
// 这里要验证的是入口把「扫描结果 → 收录结果 → 原生 glob 对账 → 测试运行器」串起来。
const fixtureManifest = [
  'export const testDirectories = ["owned"];',
  'export const explicitTests = ["explicit.test.mjs"];',
  "",
].join("\n");
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

function passingTest(name) {
  return `import { test } from 'node:test';\ntest(${JSON.stringify(name)}, () => {});\n`;
}

async function createRepository(t) {
  const root = await mkdtemp(join(tmpdir(), "knorvia-contract-tests-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "owned"), { recursive: true });
  await writeFile(join(root, "owned/owned.test.mjs"), passingTest("owned fixture"));
  await writeFile(join(root, "explicit.test.mjs"), passingTest("explicit fixture"));
  return root;
}

async function writeContractTest(root, packageId, name, content = passingTest(name)) {
  const directory = join(root, CONTRACT_TESTS_ROOT, packageId, "tests");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, name), content);
  return `${CONTRACT_TESTS_ROOT}/${packageId}/tests/${name}`;
}

function fixtureSelectionInput(root) {
  return {
    repoRoot: root,
    explicitTests: ["explicit.test.mjs"],
    testDirectories: ["owned"],
  };
}

function runTests(root, argumentsList, maxBuffer = 1024 * 1024) {
  return run(process.execPath, [...nodeFlags, ...argumentsList], {
    cwd: root,
    env: childEnvironment(),
    maxBuffer,
  });
}

async function createRunnerRepository(t, contractTests = []) {
  const root = await createRepository(t);
  await mkdir(join(root, "scripts"), { recursive: true });
  for (const path of runnerModules) {
    await writeFile(join(root, path), await readFile(join(repoRoot, path)));
  }
  await writeFile(join(root, "scripts/studio-test-manifest.mjs"), fixtureManifest);
  // 入口会设置 TSX_TSCONFIG_PATH；给夹具一个最小 tsconfig，避免测试配置缺失影响解析。
  await mkdir(join(root, "packages/ui"), { recursive: true });
  await writeFile(join(root, "packages/ui/tsconfig.json"), '{\n  "compilerOptions": {}\n}\n');
  // `--import tsx` 按 cwd 解析裸模块名；夹具只放一行转发到真实 tsx 载入器的包，
  // 不替换 TypeScript 转译实现（夹具用例本身是纯 ESM）。
  await mkdir(join(root, "node_modules/tsx"), { recursive: true });
  await writeFile(
    join(root, "node_modules/tsx/package.json"),
    `${JSON.stringify({ name: "tsx", version: "0.0.0-fixture", type: "module", exports: "./index.mjs" }, null, 2)}\n`,
  );
  await writeFile(
    join(root, "node_modules/tsx/index.mjs"),
    `import ${JSON.stringify(import.meta.resolve("tsx"))};\nexport {};\n`,
  );
  for (const contractTest of contractTests) {
    await writeContractTest(root, contractTest.packageId, contractTest.name, contractTest.content);
  }
  return root;
}

function runEntryPoint(root, entryEnvironment = {}) {
  const env = childEnvironment();
  // 入口选择必须由每次调用显式给定，不能让父测试进程的环境意外决定探针结果。
  delete env.KNORVIA_CONTRACT_ENTRY;
  Object.assign(env, entryEnvironment);
  return run(process.execPath, ["scripts/test-studio.mjs"], {
    cwd: root,
    env,
    maxBuffer: 4 * 1024 * 1024,
  });
}

// 入口子进程不指定 --test-reporter：Node 在非 TTY 下选哪种默认报告器随版本变化，
// 因此只断言两种报告器共有的摘要语义（TAP 的 `# fail 1` 与 spec 的 `ℹ fail 1`）。
function hasSummary(stdout, label, count) {
  return new RegExp(`^(?:#|ℹ) ${label} ${count}$`, "mu").test(stdout);
}

// 契约测试入口（R9）：夹具用例把实际读到的入口写回合同目录，父测试据此断言传导结果，
// 而不是让「夹具期望哪个入口」和「本次运行用哪个入口」互相绑定。
function contractEntryRecorder(name) {
  return [
    "import { writeFileSync } from 'node:fs';",
    "import { join } from 'node:path';",
    "import { test } from 'node:test';",
    `test(${JSON.stringify(name)}, () => {`,
    "  writeFileSync(join(import.meta.dirname, 'observed-contract-entry.txt'), process.env.KNORVIA_CONTRACT_ENTRY ?? '<unset>', 'utf8');",
    "});",
    "",
  ].join("\n");
}

function observedEntryPath(root) {
  return join(root, CONTRACT_TESTS_ROOT, "core-01", "tests", "observed-contract-entry.txt");
}

function startupFileCountLine(stdout) {
  return stdout.match(/\[test:studio\] \d+ offline test files/u)?.[0];
}

test("a repository without specs/contracts keeps an empty contract selection and passes", async (t) => {
  const root = await createRepository(t);
  assert.deepEqual(await discoverContractTests({ repoRoot: root }), { tests: [], directories: [] });
  const selection = await selectStudioTests(fixtureSelectionInput(root));
  assert.deepEqual(selection.tests, ["explicit.test.mjs", "owned/owned.test.mjs"]);
  assert.deepEqual(selection.contractTests, []);
  assert.deepEqual(selection.contractTestDirectories, []);
  assert.deepEqual(selection.argumentsList, [
    "explicit.test.mjs",
    "owned/{*.test,.*.test,.test}.{ts,mjs}",
  ]);
  const { stdout } = await runTests(root, selection.argumentsList);
  assert.match(stdout, /# tests 2\b/u);
  assert.match(stdout, /# fail 0\b/u);
});

test("contract tests under specs/contracts/*/tests join the validated selection and execute", async (t) => {
  const root = await createRepository(t);
  const behavior = await writeContractTest(
    root,
    "core-01",
    "behavior.test.mjs",
    passingTest("contract behavior"),
  );
  const interfaceTest = await writeContractTest(
    root,
    "ui-01",
    "interface.test.ts",
    "import { test } from 'node:test';\nconst value: number = 7;\ntest('contract interface', () => {\n  if (value !== 7) throw new Error('typed fixture drifted');\n});\n",
  );
  assert.deepEqual(await discoverContractTests({ repoRoot: root }), {
    tests: [behavior, interfaceTest],
    directories: ["specs/contracts/core-01/tests", "specs/contracts/ui-01/tests"],
  });
  const selection = await selectStudioTests(fixtureSelectionInput(root));
  assert.deepEqual(selection.contractTests, [behavior, interfaceTest]);
  assert.deepEqual(selection.tests, [
    "explicit.test.mjs",
    "owned/owned.test.mjs",
    behavior,
    interfaceTest,
  ]);
  assert.deepEqual(selection.argumentsList, [
    "explicit.test.mjs",
    "owned/{*.test,.*.test,.test}.{ts,mjs}",
    "specs/contracts/core-01/tests/{*.test,.*.test,.test}.{ts,mjs}",
    "specs/contracts/ui-01/tests/{*.test,.*.test,.test}.{ts,mjs}",
  ]);
  const { stdout } = await runTests(root, selection.argumentsList);
  assert.match(stdout, /# tests 4\b/u);
  assert.match(stdout, /# pass 4\b/u);
  assert.match(stdout, /# fail 0\b/u);
  assert.match(stdout, /contract behavior/u);
  assert.match(stdout, /contract interface/u);
});

test("glob metacharacters and spaces in contract test names stay selected exactly once", async (t) => {
  const root = await createRepository(t);
  const metacharacters = await writeContractTest(root, "core-01", "[square]{brace}.test.mjs");
  const spaced = await writeContractTest(root, "core-01", "space name.test.mjs");
  const selection = await selectStudioTests(fixtureSelectionInput(root));
  assert.deepEqual(selection.contractTests, [metacharacters, spaced]);
  const { stdout } = await runTests(root, selection.argumentsList);
  assert.match(stdout, /# tests 4\b/u);
  assert.match(stdout, /# fail 0\b/u);
});

test("a contract directory without tests keeps an empty selection after replacement", async (t) => {
  const root = await createRepository(t);
  const directory = join(root, CONTRACT_TESTS_ROOT, "replaced-01");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "README.md"), "# replaced contract\n");
  // 计划书五.2：替换完成后契约测试移入对应包的 test/，合同目录只剩文档，此时不能失败。
  assert.deepEqual(await discoverContractTests({ repoRoot: root }), { tests: [], directories: [] });
  const selection = await selectStudioTests(fixtureSelectionInput(root));
  assert.deepEqual(selection.tests, ["explicit.test.mjs", "owned/owned.test.mjs"]);
});

test("a contract tests directory without a top-level test file fails closed", async (t) => {
  const root = await createRepository(t);
  const helpersOnly = join(root, CONTRACT_TESTS_ROOT, "broken-01", "tests");
  await mkdir(helpersOnly, { recursive: true });
  await writeFile(join(helpersOnly, "helpers.mjs"), "export const helper = 1;\n");
  await writeFile(join(helpersOnly, "behavior.spec.ts"), "export const spec = 1;\n");
  await assert.rejects(
    discoverContractTests({ repoRoot: root }),
    /specs\/contracts\/broken-01\/tests/u,
  );

  const nestedOnly = join(root, CONTRACT_TESTS_ROOT, "nested-01", "tests", "nested");
  await rm(join(root, CONTRACT_TESTS_ROOT, "broken-01"), { recursive: true, force: true });
  await mkdir(nestedOnly, { recursive: true });
  await writeFile(join(nestedOnly, "behavior.test.mjs"), passingTest("nested contract"));
  await assert.rejects(
    discoverContractTests({ repoRoot: root }),
    /specs\/contracts\/nested-01\/tests/u,
  );
});

test("a contract directory name a native glob cannot express fails closed", async (t) => {
  const root = await createRepository(t);
  await writeContractTest(root, "core[01]", "behavior.test.mjs");
  await assert.rejects(discoverContractTests({ repoRoot: root }), /specs\/contracts\/core\[01\]/u);
});

test("case-insensitive native globs cannot widen contract discovery", async (t) => {
  const root = await createRepository(t);
  const behavior = await writeContractTest(
    root,
    "core-01",
    "behavior.test.mjs",
    passingTest("contract behavior"),
  );
  // 大小写变体的额外文件：大小写敏感的文件系统不会收录它（文件名不匹配契约测试规则），
  // 大小写不敏感的文件系统会被原生 glob 顺带匹配到，必须按 R3 失败封闭而不是多跑一个文件。
  await writeFile(
    join(root, CONTRACT_TESTS_ROOT, "core-01", "tests", "Helper.TEST.MJS"),
    passingTest("case variant"),
  );
  if (process.platform === "win32" || process.platform === "darwin") {
    await assert.rejects(
      selectStudioTests(fixtureSelectionInput(root)),
      /unexpected=\["specs\/contracts\/core-01\/tests\/Helper\.TEST\.MJS"\]/u,
    );
  } else {
    const selection = await selectStudioTests(fixtureSelectionInput(root));
    assert.deepEqual(selection.contractTests, [behavior]);
  }
});

test("a failing contract test fails the aggregate run instead of being skipped", async (t) => {
  const root = await createRepository(t);
  await writeContractTest(root, "core-01", "behavior.test.mjs", passingTest("contract behavior"));
  await writeContractTest(
    root,
    "core-01",
    "cancel.test.mjs",
    "import { test } from 'node:test';\ntest('contract cancel', () => {\n  throw new Error('contract cancel regression');\n});\n",
  );
  const selection = await selectStudioTests(fixtureSelectionInput(root));
  await assert.rejects(runTests(root, selection.argumentsList), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stdout, /# tests 4\b/u);
    assert.match(error.stdout, /# fail 1\b/u);
    assert.match(error.stdout, /contract cancel regression/u);
    assert.match(error.stdout, /contract behavior/u);
    return true;
  });
});

test("the studio entry point passes without any contract directory", async (t) => {
  const root = await createRunnerRepository(t);
  const { stdout } = await runEntryPoint(root);
  assert.match(stdout, /\[test:studio\] 2 offline test files/u);
  assert.doesNotMatch(stdout, /contract test files/u);
  assert.ok(hasSummary(stdout, "tests", 2), stdout);
  assert.ok(hasSummary(stdout, "fail", 0), stdout);
});

test("the studio entry point includes contract tests and reports them", async (t) => {
  const root = await createRunnerRepository(t, [
    { packageId: "core-01", name: "behavior.test.mjs", content: passingTest("contract behavior") },
  ]);
  const { stdout } = await runEntryPoint(root);
  assert.match(stdout, /\[test:studio\] 3 offline test files/u);
  assert.match(stdout, /\[test:studio\] 1 contract test files from specs\/contracts/u);
  assert.ok(hasSummary(stdout, "tests", 3), stdout);
  assert.ok(hasSummary(stdout, "fail", 0), stdout);
  assert.match(stdout, /contract behavior/u);
});

test("the studio entry point exits non-zero when a contract test fails", async (t) => {
  const root = await createRunnerRepository(t, [
    { packageId: "core-01", name: "behavior.test.mjs", content: passingTest("contract behavior") },
    {
      packageId: "core-01",
      name: "cancel.test.mjs",
      content:
        "import { test } from 'node:test';\ntest('contract cancel', () => {\n  throw new Error('contract cancel regression');\n});\n",
    },
  ]);
  await assert.rejects(runEntryPoint(root), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stdout, /\[test:studio\] 4 offline test files/u);
    assert.match(error.stdout, /contract cancel regression/u);
    assert.ok(hasSummary(error.stdout, "fail", 1), error.stdout);
    return true;
  });
});

test("the studio entry point conveys the source contract entry by default", async (t) => {
  const root = await createRunnerRepository(t, [
    {
      packageId: "core-01",
      name: "entry.test.mjs",
      content: contractEntryRecorder("contract entry recorder"),
    },
  ]);
  const { stdout } = await runEntryPoint(root);
  assert.match(stdout, /\[test:studio\] 3 offline test files/u);
  assert.match(
    stdout,
    /\[test:studio\] 1 contract test files from specs\/contracts \(entry: source\)/u,
  );
  assert.ok(hasSummary(stdout, "pass", 3), stdout);
  assert.ok(hasSummary(stdout, "fail", 0), stdout);
  // 夹具用例确实执行并读到默认入口，才算传导成立。
  assert.equal(await readFile(observedEntryPath(root), "utf8"), "source");
});

test("the studio entry point conveys the dist contract entry without changing the collected set", async (t) => {
  const root = await createRunnerRepository(t, [
    {
      packageId: "core-01",
      name: "entry.test.mjs",
      content: contractEntryRecorder("contract entry recorder"),
    },
  ]);
  const source = await runEntryPoint(root);
  assert.equal(await readFile(observedEntryPath(root), "utf8"), "source");
  const dist = await runEntryPoint(root, { KNORVIA_CONTRACT_ENTRY: "dist" });
  assert.equal(await readFile(observedEntryPath(root), "utf8"), "dist");
  assert.match(dist.stdout, /\[test:studio\] 3 offline test files/u);
  assert.match(
    dist.stdout,
    /\[test:studio\] 1 contract test files from specs\/contracts \(entry: dist\)/u,
  );
  assert.ok(hasSummary(dist.stdout, "pass", 3), dist.stdout);
  assert.ok(hasSummary(dist.stdout, "fail", 0), dist.stdout);
  // 入口不是收录过滤器：两种入口下收录文件数必须一致。
  assert.equal(startupFileCountLine(dist.stdout), startupFileCountLine(source.stdout));
});

test("an unknown contract entry fails closed before any contract test runs", async (t) => {
  const root = await createRunnerRepository(t, [
    {
      packageId: "core-01",
      name: "entry.test.mjs",
      content: contractEntryRecorder("contract entry recorder"),
    },
  ]);
  await assert.rejects(runEntryPoint(root, { KNORVIA_CONTRACT_ENTRY: "both" }), (error) => {
    assert.equal(error.code, 1);
    const output = `${error.stdout}${error.stderr}`;
    assert.match(output, /KNORVIA_CONTRACT_ENTRY/u);
    assert.match(output, /source \| dist/u);
    // 未启动任何用例：没有测试运行器摘要。
    assert.doesNotMatch(output, /# tests \d/u);
    return true;
  });
  // 夹具用例没有执行过：记录文件不存在。
  await assert.rejects(readFile(observedEntryPath(root), "utf8"), { code: "ENOENT" });
});

test("the checked-in manifest selection stays consistent with the repository tree", async () => {
  const selection = await selectStudioTests({ repoRoot, explicitTests, testDirectories });
  assert.equal(
    new Set(selection.tests).size,
    selection.tests.length,
    "selection must not contain duplicate paths",
  );
  assert.ok(selection.tests.length >= explicitTests.length + testDirectories.length);
  const discovered = await discoverContractTests({ repoRoot });
  assert.deepEqual(selection.contractTests, discovered.tests);
  for (const path of selection.contractTests) {
    assert.match(path, /^specs\/contracts\/[^/]+\/tests\/[^/]+\.test\.(?:ts|mjs)$/u);
  }
});
