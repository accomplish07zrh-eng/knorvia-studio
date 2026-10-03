// SPDX-License-Identifier: Apache-2.0
// 最终定向合同检查；不 emit/build，不把范围外错误伪装成成功。
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const ts = createRequire(import.meta.url)("typescript");
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const outputIndex = process.argv.indexOf("--json-out");
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
if (outputIndex >= 0 && !outputPath) throw new Error("--json-out requires a path");
const checkpoint = "19f6ccf74ba1064ca81d93194b4f25a36030e361";
const relativeOwner = "packages/ui/src/workspace-file-tree/fileTreePanelInteractionOwner.ts";
const ownerPath = path.join(repo, relativeOwner);
const wirePath = path.join(repo, "packages/ui/test/__virtual-final-loader-contract.mts");
const wireSource = `import type { WorkspaceFileTreeDataOwner } from "../src/workspace-file-tree/fileTreeDataOwner.js";
import type { FileTreePanelPorts } from "../src/workspace-file-tree/fileTreePanelInteractionOwner.js";
declare const producerLoader: WorkspaceFileTreeDataOwner["loadDirectory"];
export const consumerLoader: FileTreePanelPorts["loadDirectory"] = producerLoader;
`;
const configPath = path.join(repo, "packages/ui/tsconfig.json");
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error)
  throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));
const targets = [
  "packages/ui/src/workspace-file-tree/WorkspaceFileTree.tsx",
  relativeOwner,
  "packages/ui/src/workspace-file-tree/fileTreeDataOwner.ts",
  "packages/ui/test/ui-next-file-tree-panel-20261003.test.ts",
  "packages/ui/test/ui-next-file-tree-data-owner-20261003.test.ts",
  "packages/ui/src/v4/taskListItemStabilization.ts",
  "packages/ui/src/workspace-grouped-tasks/groupedDragProjection.ts",
  "packages/ui/test/ui-next-task-list-stabilization-20261003.test.ts",
  "packages/ui/test/ui-next-grouped-drag-projection-20261003.test.ts",
  "packages/ui/test/ui-next-grouped-section-dom-20261003.test.ts",
];
// 不 emit 或构建前置产物；通过真实 package 入口解析源码依赖。
const options = {
  ...config.options,
  types: [...new Set([...(config.options.types ?? []), "node"])],
  composite: false,
  noEmit: true,
  rootDir: repo,
};
const receipt = JSON.parse(
  await readFile(new URL("./final-consumer-contract-repair.json", import.meta.url), "utf8"),
);
const owned = new Set(receipt.checks.find((check) => check.id === "scoped-lint").files);
const roots = [wirePath, ...targets.map((file) => path.join(repo, file))];
// 正常 UI 工程由这个已有源文件提供 ImportMeta 全局声明。
roots.push(path.join(repo, "packages/ui/src/test-actions.ts"));
roots.push(path.join(repo, "packages/ui/src/env.d.ts"));
function inspect(before) {
  const host = ts.createCompilerHost(options),
    originalRead = host.readFile,
    originalExists = host.fileExists;
  const prior = before
    ? execFileSync("git", ["show", `${checkpoint}:${relativeOwner}`], {
        cwd: repo,
        encoding: "utf8",
      })
    : null;
  host.fileExists = (file) => path.resolve(file) === wirePath || originalExists(file);
  host.readFile = (file) =>
    path.resolve(file) === wirePath
      ? wireSource
      : prior !== null && path.resolve(file) === ownerPath
        ? prior
        : originalRead(file);
  const program = ts.createProgram({ rootNames: roots, options, host });
  const diagnostics = ts.getPreEmitDiagnostics(program).map((diagnostic) => {
    const file = diagnostic.file
      ? path.relative(repo, diagnostic.file.fileName).split(path.sep).join("/")
      : null;
    const position =
      diagnostic.file && diagnostic.start !== undefined
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
        : null;
    return {
      path: file,
      line: position ? position.line + 1 : null,
      code: diagnostic.code,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    };
  });
  const current = diagnostics.filter(
    (diagnostic) => diagnostic.path === path.relative(repo, wirePath) || owned.has(diagnostic.path),
  );
  const external = diagnostics.filter((diagnostic) => !current.includes(diagnostic));
  return {
    inspectedSourceFiles: program.getSourceFiles().length,
    ownDiagnostics: current,
    externalDiagnostics: external,
  };
}
const before = inspect(true),
  after = inspect(false);
const reproduced =
  before.ownDiagnostics.some(
    (diagnostic) =>
      diagnostic.code === 2322 &&
      diagnostic.path === "packages/ui/src/workspace-file-tree/WorkspaceFileTree.tsx",
  ) &&
  before.ownDiagnostics.some(
    (diagnostic) => diagnostic.code === 2322 && diagnostic.path === path.relative(repo, wirePath),
  );
const record = {
  checkpoint,
  typescript: ts.version,
  roots: targets,
  supportingAmbientRoots: ["packages/ui/src/test-actions.ts", "packages/ui/src/env.d.ts"],
  temporaryWire:
    "In-memory virtual module under UI/test: producer method assigned to real FileTreePanelPorts loadDirectory",
  configuration:
    "Existing UI parser options plus installed Node ambient types for the selected node:test files and existing UI globals; composite=false/rootDir=repository/noEmit=true; real source dependencies, no project-reference emit/build",
  baselineErrorReproduced: reproduced,
  before,
  after,
};
if (outputPath) await writeFile(outputPath, JSON.stringify(record, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      baselineErrorReproduced: reproduced,
      currentOwnDiagnostics: after.ownDiagnostics,
      outsideOwnScope: after.externalDiagnostics.length,
      inspectedSourceFiles: after.inspectedSourceFiles,
    },
    null,
    2,
  ),
);
process.exitCode =
  !reproduced || after.ownDiagnostics.length ? 1 : after.externalDiagnostics.length ? 2 : 0;
