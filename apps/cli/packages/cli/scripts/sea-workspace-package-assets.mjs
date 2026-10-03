import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, posix, resolve } from "node:path";

function compiledEntry(value) {
  if (typeof value === "string") {
    if (!value.startsWith("./src/")) return value;
    const path = value.replace(/^\.\/src\//, "./dist/");
    if (/\.d\.[cm]?ts$/.test(path)) return path;
    return path
      .replace(/\.tsx?$/, ".js")
      .replace(/\.mts$/, ".mjs")
      .replace(/\.cts$/, ".cjs");
  }
  if (Array.isArray(value)) return value.map(compiledEntry);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, compiledEntry(entry)]),
    );
  }
  return value;
}

function runtimePaths(value) {
  if (typeof value === "string") return value.startsWith("./") ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(runtimePaths);
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([condition, target]) =>
      condition === "types" ? [] : runtimePaths(target),
    );
  }
  return [];
}

export function workspaceRuntimeSurface(manifest) {
  const exports = compiledEntry(manifest.exports);
  const subpaths =
    exports &&
    typeof exports === "object" &&
    !Array.isArray(exports) &&
    Object.keys(exports).some((key) => key.startsWith("."));
  const declared = runtimePaths(subpaths ? exports["."] : exports);
  const entries =
    declared.length > 0
      ? declared
      : runtimePaths(compiledEntry(manifest.main ?? manifest.module ?? "./dist/index.js"));
  const outputs = [
    ...entries,
    ...runtimePaths(exports),
    ...runtimePaths(compiledEntry(manifest.imports)),
    ...runtimePaths(compiledEntry(manifest.main)),
    ...runtimePaths(compiledEntry(manifest.module)),
  ];
  const rootFiles = new Set();
  const directories = new Set(["dist"]);
  for (const output of outputs) {
    const local = output.slice(2);
    if (local.split("/").includes("..") || local.includes("\\")) {
      throw new Error(`Invalid workspace runtime entry ${output}`);
    }
    if (posix.dirname(local) === ".") rootFiles.add(local);
    else directories.add(local.split("/")[0]);
  }
  return { entries: [...new Set(entries)], rootFiles, directories };
}

export function includesWorkspaceRuntimeFile(relativePath, surface) {
  if (relativePath.endsWith(".map")) return false;
  if (relativePath === "package.json") return true;
  if (relativePath.includes("/")) return surface.directories.has(relativePath.split("/")[0]);
  // 根 JS surface 的非 export 兄弟模块同样是运行依赖；不要带入 src/test/scripts。
  return (
    surface.rootFiles.has(relativePath) ||
    (surface.rootFiles.size > 0 && /\.(?:[cm]?js|json|d\.[cm]?ts)$/.test(relativePath))
  );
}

export async function stageSeaPackageAssets({
  packageFiles,
  workspacePackage,
  stagingDirectory,
  assetPrefix,
}) {
  const files = [];
  const assets = {};
  for (const file of packageFiles) {
    let sourcePath = file.sourcePath;
    let bytes = await readFile(sourcePath);
    if (workspacePackage && file.assetPath.endsWith("/package.json")) {
      const manifest = JSON.parse(bytes.toString("utf8"));
      // 根 workspace 为开发环境导出 src/*.ts；SEA 仅携带 dist，必须在暂存副本改写入口。
      // 不修改源码 manifest，否则会影响桌面 esbuild 的源码解析路径。
      for (const field of ["exports", "main", "module", "types", "imports"]) {
        if (field in manifest) manifest[field] = compiledEntry(manifest[field]);
      }
      bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
      sourcePath = resolve(stagingDirectory, file.assetPath);
      await mkdir(dirname(sourcePath), { recursive: true });
      await writeFile(sourcePath, bytes);
    }
    assets[`${assetPrefix}${file.assetPath}`] = sourcePath;
    files.push({
      mode: /\.(?:dll|dylib|node|so)$/i.test(file.assetPath) ? 0o755 : 0o644,
      path: file.assetPath,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  return { files, assets };
}
