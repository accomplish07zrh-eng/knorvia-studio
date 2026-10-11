// SPDX-License-Identifier: Apache-2.0
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { compactStudioTestArguments } from "./studio-test-arguments.mjs";

// M0-10：合同目录 specs/contracts/<包 ID>/tests 下的契约测试必须被 pnpm test:studio 收录，
// 让已合并的合同在 CI 里持续守住旧行为；还没有合同时按空集合通过，不报错也不静默漏跑。
// 规则与判定表见 specs/knorvia-contract-test-collection.md。
export const CONTRACT_TESTS_ROOT = "specs/contracts";
// 与既有测试目录同一命名规则：*.test.ts / *.test.mjs（含 .hidden.test.mjs 这类点开头名字）。
export const STUDIO_TEST_FILE_PATTERN = /\.test\.(?:ts|mjs)$/u;
// 合同目录名会进入原生 glob 参数；含元字符的名字无法可靠表达选择集，直接失败而不是猜。
const SAFE_CONTRACT_DIRECTORY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

function repositoryPath(...segments) {
  return segments.join("/");
}

async function readEntries(directory) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    // 目录不存在不是错误：合同尚未合并时收录结果必须是空集合（规格 R2）。
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function testFileNames(entries) {
  return entries
    .filter((entry) => entry.isFile() && STUDIO_TEST_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

async function discoverListedTestDirectories({ repoRoot, directories }) {
  const tests = [];
  for (const directory of directories) {
    const entries = await readdir(resolve(repoRoot, directory), { withFileTypes: true });
    const names = testFileNames(entries);
    if (names.length === 0) throw new Error(`No offline studio tests found in ${directory}`);
    tests.push(...names.map((name) => repositoryPath(directory, name)));
  }
  return tests;
}

export async function discoverContractTests({ repoRoot, contractsRoot = CONTRACT_TESTS_ROOT }) {
  const entries = await readEntries(resolve(repoRoot, contractsRoot));
  if (entries === null) return { tests: [], directories: [] };
  const tests = [];
  const directories = [];
  const packageNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const packageName of packageNames) {
    if (!SAFE_CONTRACT_DIRECTORY_PATTERN.test(packageName)) {
      throw new Error(
        `Contract package directory cannot be selected with a native glob: ${repositoryPath(contractsRoot, packageName)}`,
      );
    }
    const testsDirectory = repositoryPath(contractsRoot, packageName, "tests");
    const testEntries = await readEntries(resolve(repoRoot, testsDirectory));
    // 计划书五.2 的正常终态：契约测试移入对应包的 test/ 后，合同目录只剩文档，不能因此失败。
    if (testEntries === null) continue;
    const names = testFileNames(testEntries);
    if (names.length === 0) {
      throw new Error(
        `Contract tests directory has no runnable test file: ${testsDirectory} (expected *.test.ts or *.test.mjs at the top level)`,
      );
    }
    tests.push(...names.map((name) => repositoryPath(testsDirectory, name)));
    directories.push(testsDirectory);
  }
  return { tests, directories };
}

export async function selectStudioTests({
  repoRoot,
  explicitTests,
  testDirectories,
  contractsRoot = CONTRACT_TESTS_ROOT,
}) {
  const directoryTests = await discoverListedTestDirectories({
    repoRoot,
    directories: testDirectories,
  });
  const contracts = await discoverContractTests({ repoRoot, contractsRoot });
  const tests = [...explicitTests, ...directoryTests, ...contracts.tests];
  // 收录结果是唯一来源；原生 glob 参数只是 argv 载体，两者必须逐文件相等。
  const argumentsList = await compactStudioTestArguments({
    repoRoot,
    explicitTests,
    testDirectories,
    contractTestDirectories: contracts.directories,
    discoveredTests: tests,
  });
  return {
    tests,
    argumentsList,
    contractTests: contracts.tests,
    contractTestDirectories: contracts.directories,
  };
}
