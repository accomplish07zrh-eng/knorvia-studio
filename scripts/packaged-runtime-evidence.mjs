import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
    throw error;
  }
}

async function packageFile(path, packageRoot) {
  let canonical;
  try {
    canonical = await realpath(path);
    if (!(await stat(canonical)).isFile()) throw new Error("not a regular file");
  } catch (error) {
    throw new Error(`Incomplete packaged runtime: ${path}`, { cause: error });
  }
  const withinPackage = relative(packageRoot, canonical);
  if (isAbsolute(withinPackage) || withinPackage === ".." || withinPackage.startsWith(`..${sep}`)) {
    throw new Error(`Packaged runtime points outside the copied package: ${path}`);
  }
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(canonical)) hash.update(chunk);
  return { path: canonical, sha256: hash.digest("hex") };
}

/** 核对真实包路径与字节，不启动 Electron，也不读取或改写任何用户资料。 */
export async function packagedRuntimeEvidence(executable) {
  const executablePath = await realpath(executable);
  const packageRoot = dirname(executablePath);
  // CLI resolver 会逐层向上优先寻找源码 runtime；仅 cwd=exe 目录不足以隔离仓库内的包。
  for (let directory = packageRoot; ; directory = dirname(directory)) {
    for (const entry of ["dist/knorvia.cjs", "src/main.ts"]) {
      const source = join(directory, "apps", "cli", "packages", "cli", entry);
      if (await exists(source)) {
        throw new Error(
          `Packaged measurement would select a repository CLI: ${source}. Copy the complete packaged directory outside the repository before measuring.`,
        );
      }
    }
    if (dirname(directory) === directory) break;
  }
  const resourcesPath = join(packageRoot, "resources");
  const [executableFile, appAsar, cli] = await Promise.all([
    packageFile(executablePath, packageRoot),
    packageFile(join(resourcesPath, "app.asar"), packageRoot),
    packageFile(join(resourcesPath, "knorvia", "knorvia.cjs"), packageRoot),
  ]);
  return { packageRoot, resourcesPath, executable: executableFile, appAsar, cli };
}
