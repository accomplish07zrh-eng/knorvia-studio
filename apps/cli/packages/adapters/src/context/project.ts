// SPDX-License-Identifier: Apache-2.0
// 工作区探测：项目根标记、类型/包管理器/构建文件的规则表，以及包脚本读取。
import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { PackageManager, ProjectContext, ProjectType } from "@knorvia/contracts";

const GIT_MARKER = ".git";

/** 类型判定按表顺序取第一个命中的规则；`python` 只在 node 之后。 */
const PROJECT_TYPE_RULES: readonly {
  files: readonly string[];
  type: Exclude<ProjectType, "unknown">;
}[] = [
  { files: ["package.json"], type: "node" },
  { files: ["requirements.txt", "pyproject.toml", "setup.py", "Pipfile"], type: "python" },
  { files: ["Cargo.toml"], type: "rust" },
  { files: ["go.mod"], type: "go" },
  { files: ["pom.xml", "build.gradle", "build.gradle.kts"], type: "java" },
];

const PACKAGE_MANAGER_RULES: readonly (readonly [string, PackageManager])[] = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
];

const BUILD_FILE_NAMES = [
  "Makefile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "Dockerfile",
] as const;

async function entryExists(path: string): Promise<boolean> {
  return await stat(path).then(
    () => true,
    () => false,
  );
}

async function entryIsFile(path: string): Promise<boolean> {
  return await stat(path).then(
    (info) => info.isFile(),
    () => false,
  );
}

/** 从起始目录向上的祖先链（不含文件系统根，与旧实现的停止条件一致）。 */
function ancestorDirectories(startDirectory: string): string[] {
  const chain: string[] = [];
  let current = resolve(startDirectory);
  while (dirname(current) !== current) {
    chain.push(current);
    current = dirname(current);
  }
  return chain;
}

export async function findProjectRoot(startDirectory: string): Promise<string | null> {
  const chain = ancestorDirectories(startDirectory);
  for (let index = 0; index < chain.length; index += 1) {
    const directory = chain[index]!;
    if (await entryExists(join(directory, GIT_MARKER))) return directory;
  }
  return null;
}

export async function detectProjectContext(projectRoot: string): Promise<ProjectContext> {
  const type = await detectProjectType(projectRoot);
  const context: ProjectContext = { type };
  const packageManager = await detectPackageManager(projectRoot);
  if (packageManager) context.packageManager = packageManager;
  if (type === "node") {
    const scripts = await readPackageScripts(join(projectRoot, "package.json"));
    if (scripts) context.scripts = scripts;
  }
  const buildFiles = await detectBuildFiles(projectRoot);
  if (buildFiles) context.buildFiles = buildFiles;
  return context;
}

async function detectProjectType(projectRoot: string): Promise<ProjectType> {
  for (const rule of PROJECT_TYPE_RULES) {
    for (const fileName of rule.files) {
      if (await entryIsFile(join(projectRoot, fileName))) return rule.type;
    }
  }
  return "unknown";
}

async function detectPackageManager(projectRoot: string): Promise<PackageManager | undefined> {
  for (const [lockFile, manager] of PACKAGE_MANAGER_RULES) {
    if (await entryIsFile(join(projectRoot, lockFile))) return manager;
  }
  return undefined;
}

/** `package.json` 存在即为 node 项目；scripts 只在能解析成对象时给出。 */
async function readPackageScripts(
  packageJsonPath: string,
): Promise<Record<string, string> | undefined> {
  return await readFile(packageJsonPath, "utf8").then(
    (text) => {
      const parsed = JSON.parse(text) as { scripts?: unknown };
      const scripts = parsed.scripts;
      return scripts && typeof scripts === "object"
        ? (scripts as Record<string, string>)
        : undefined;
    },
    () => undefined,
  );
}

async function detectBuildFiles(projectRoot: string): Promise<string[] | undefined> {
  const found: string[] = [];
  for (const fileName of BUILD_FILE_NAMES) {
    if (await entryIsFile(join(projectRoot, fileName))) found.push(fileName);
  }
  return found.length > 0 ? found : undefined;
}
