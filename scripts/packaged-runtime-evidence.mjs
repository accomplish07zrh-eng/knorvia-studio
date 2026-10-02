import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

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

function validateMaterialSelection(selection) {
  const invalid = (detail) => {
    throw new Error(`Invalid material selection: ${detail}`);
  };
  const text = (value) => typeof value === "string" && value.trim().length > 0;
  const fields = (entry, allowed) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) invalid("expected object");
    for (const key of Object.keys(entry)) {
      if (!allowed.includes(key)) invalid(`unknown field ${key}`);
    }
  };
  fields(selection, ["schemaVersion", "files", "excluded"]);
  if (
    selection.schemaVersion !== 1 ||
    !Array.isArray(selection.files) ||
    !Array.isArray(selection.excluded)
  ) {
    invalid("expected schemaVersion 1, files and excluded arrays");
  }
  const ids = new Set();
  const paths = new Set();
  for (const [entries, excluded] of [
    [selection.files, false],
    [selection.excluded, true],
  ]) {
    for (const entry of entries) {
      fields(
        entry,
        excluded
          ? ["id", "path", "policyRef", "reason"]
          : ["id", "path", "kind", "sha256", "noticeIds"],
      );
      if (!text(entry.id) || ids.has(entry.id)) invalid("missing or duplicate ID");
      ids.add(entry.id);
      if (
        !text(entry.path) ||
        /[\\:*?"<>|\u0000-\u001f]/u.test(entry.path) ||
        entry.path
          .split("/")
          .some((part) => !part || part === "." || part === ".." || /[. ]$/u.test(part))
      ) {
        invalid(`non-portable relative path for ${entry.id}`);
      }
      const pathKey = entry.path.toLowerCase();
      if (paths.has(pathKey)) invalid(`duplicate path ${entry.path}`);
      paths.add(pathKey);
      if (excluded) {
        if (!text(entry.policyRef) || !text(entry.reason)) {
          invalid(`missing exclusion policy for ${entry.id}`);
        }
        continue;
      }
      if (!["runtime", "native", "notice"].includes(entry.kind)) {
        invalid(`unknown kind for ${entry.id}`);
      }
      if (
        (entry.sha256 !== undefined || entry.kind === "notice") &&
        (typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(entry.sha256))
      ) {
        invalid(`missing or invalid SHA-256 for ${entry.id}`);
      }
      if (entry.kind === "notice") {
        if (entry.noticeIds !== undefined) {
          invalid(`notice cannot select other notices: ${entry.id}`);
        }
      } else if (
        !Array.isArray(entry.noticeIds) ||
        !entry.noticeIds.length ||
        !entry.noticeIds.every(text) ||
        new Set(entry.noticeIds).size !== entry.noticeIds.length
      ) {
        invalid(`missing or invalid noticeIds for ${entry.id}`);
      }
    }
  }
  if (
    !selection.files.some((entry) => entry.kind === "notice") ||
    !selection.files.some((entry) => entry.kind !== "notice")
  ) {
    invalid("at least one runtime/native file and one notice are required");
  }
}

/** 只核验调用者选定的发行文件；缺失材料不能自动转成策略排除或许可结论。 */
export async function packagedMaterialEvidence(directory, selection) {
  validateMaterialSelection(selection);
  const artifactRoot = await realpath(directory);
  if (!(await stat(artifactRoot)).isDirectory()) {
    throw new Error("Artifact root must be a directory");
  }
  const errors = [];
  const notices = new Set(
    selection.files.filter((entry) => entry.kind === "notice").map((entry) => entry.id),
  );
  for (const entry of selection.files) {
    for (const id of entry.noticeIds ?? []) {
      if (!notices.has(id)) errors.push(`${entry.id}: required notice not selected: ${id}`);
    }
  }
  const files = [];
  for (const { sha256: expectedSha256, ...entry } of selection.files) {
    const record = { ...entry, ...(expectedSha256 ? { expectedSha256 } : {}) };
    try {
      const observed = await packageFile(join(artifactRoot, entry.path), artifactRoot);
      files.push({
        ...record,
        canonicalPath: observed.path,
        sha256: observed.sha256,
        status:
          expectedSha256 && expectedSha256 !== observed.sha256 ? "digest-mismatch" : "present",
      });
    } catch (error) {
      files.push({
        ...record,
        status: ["ENOENT", "ENOTDIR"].includes(error.cause?.code) ? "missing" : "invalid-input",
        error: error.message,
      });
    }
  }
  const excluded = [];
  for (const entry of selection.excluded) {
    try {
      // lstat 保留悬空链接这一实际目录项；stat 会误把它判成已排除。
      await lstat(join(artifactRoot, entry.path));
      excluded.push({ ...entry, status: "unexpected-present" });
    } catch (error) {
      excluded.push(
        ["ENOENT", "ENOTDIR"].includes(error.code)
          ? { ...entry, status: "excluded-by-policy" }
          : { ...entry, status: "invalid-input", error: error.message },
      );
    }
  }
  return {
    schemaVersion: 1,
    scope: "selected-files-only",
    artifactRoot,
    ok:
      errors.length === 0 &&
      files.every((entry) => entry.status === "present") &&
      excluded.every((entry) => entry.status === "excluded-by-policy"),
    files,
    excluded,
    errors,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4) {
      throw new Error(
        "Usage: node scripts/packaged-runtime-evidence.mjs <artifact-directory> <selection.json>",
      );
    }
    const bytes = await readFile(process.argv[3]);
    const selection = JSON.parse(bytes.toString("utf8"));
    const report = await packagedMaterialEvidence(process.argv[2], selection);
    const selectionSha256 = createHash("sha256").update(bytes).digest("hex");
    console.log(JSON.stringify({ ...report, selectionSha256 }, null, 2));
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    console.log(
      JSON.stringify({ ok: false, scope: "selected-files-only", error: error.message }, null, 2),
    );
    process.exitCode = 1;
  }
}
