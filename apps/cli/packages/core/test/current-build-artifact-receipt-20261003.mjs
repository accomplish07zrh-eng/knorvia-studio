// 当前 receipt 由真实项目编译确定；生成仅输出候选，运行时不会自动接纳新字节。
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = new URL("../../../../../", import.meta.url);
const root = fileURLToPath(repository);
const ts = createRequire(new URL("package.json", repository))("typescript");
const previousPath = "apps/cli/packages/core/test/current-artifact-receipt-20261003.json";
const currentPath = "apps/cli/packages/core/test/current-build-artifact-receipt-20261003.json";
const previousSha256 = "9ceb5294d0a9f5885a5eec65f85283e3bac6797407bf03809cc6e9ce52bdc714";
const currentSha256 = "02a3149427eaff8d6c2b3e1d68771abece7e869d7f150a2a47f9e2e4b1e95553";
const sourceCheckpoint = "c4f9bbb01cffa283e7179cc5adb53bc5956cb72a";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = (relative) => readFile(new URL(relative, repository), "utf8");
const previousText = await read(previousPath);
assert.equal(sha(previousText), previousSha256);
const previous = JSON.parse(previousText);
assert.equal(previous.formatVersion, 1);
assert.equal(ts.version, "6.0.2");
assert.equal(process.version, "v24.14.0");
const rootPackage = JSON.parse(await read("package.json"));
assert.equal(rootPackage.packageManager, "pnpm@10.33.2");
const files = { ...previous.files };
const configurations = [];
const outputs = new Set();

for (const packageRoot of ["apps/cli/packages/core", "apps/cli/packages/contracts"]) {
  const config = ts.readConfigFile(path.join(root, packageRoot, "tsconfig.json"), ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.join(root, packageRoot));
  assert.deepEqual(parsed.errors, []);
  const inputs = await Promise.all(
    parsed.fileNames.map(async (file) => [
      path.relative(root, file).split(path.sep).join("/"),
      sha(await readFile(file)),
    ]),
  );
  inputs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  configurations.push({
    packageRoot,
    tsconfigSha256: sha(await read(packageRoot + "/tsconfig.json")),
    packageJsonSha256: sha(await read(packageRoot + "/package.json")),
    sourceRoots: parsed.fileNames.length,
    inputSha256: sha(JSON.stringify(inputs)),
  });
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  // 整个项目按原 file roots 顺序 emit；孤立 declaration 会改变推导字段/联合的打印顺序。
  const emitted = program.emit(undefined, (file, text) => {
    const relative = path.relative(root, file).split(path.sep).join("/");
    if (!Object.hasOwn(previous.files, relative)) return;
    assert.ok(!outputs.has(relative), relative);
    outputs.add(relative);
    files[relative] = sha(text);
  });
  assert.equal(emitted.emitSkipped, false);
  assert.deepEqual(emitted.diagnostics, []);
}
assert.equal(outputs.size, 142);
// 非编译输出（包括源文件）维持原精确绑定，不从本地 dist 或任意运行时字节生成新 pin。
for (const [relative, expected] of Object.entries(previous.files)) {
  if (!outputs.has(relative)) assert.equal(sha(await read(relative)), expected, relative);
}
const candidate = {
  ...previous,
  formatVersion: 2,
  sourceCheckpoint,
  files,
  previousReceipt: { path: previousPath, sha256: previousSha256 },
  build: {
    node: "24.14.0",
    packageManager: "pnpm@10.33.2",
    typescript: ts.version,
    rootPackageSha256: sha(await read("package.json")),
    frozenLockfileSha256: sha(await read("pnpm-lock.yaml")),
    emit: "Original tsconfig and full project file-root order; registered outputs captured in memory",
    registeredCompilerOutputs: outputs.size,
    configurations,
  },
};
const candidateText = JSON.stringify(candidate, null, 2) + "\n";
const mode = process.argv.slice(2);
if (mode.length === 1 && mode[0] === "--candidate") {
  process.stdout.write(candidateText);
} else {
  assert.deepEqual(mode, []);
  const currentText = await read(currentPath);
  assert.equal(sha(currentText), currentSha256);
  assert.equal(currentText, candidateText, "Deterministic fixed current receipt");
  for (const [relative, expected] of Object.entries(files)) {
    assert.equal(sha(await read(relative)), expected, relative);
  }
  console.log(
    JSON.stringify(
      {
        result: "pass",
        receiptPath: currentPath,
        receiptSha256: sha(candidateText),
        registeredFiles: Object.keys(files).length,
        registeredCompilerOutputs: outputs.size,
        changedCurrentOutputs: Object.keys(files).filter(
          (file) => files[file] !== previous.files[file],
        ),
        typescript: ts.version,
        node: process.version,
        configurations,
      },
      null,
      2,
    ),
  );
}
