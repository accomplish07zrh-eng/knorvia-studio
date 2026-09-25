import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, open, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { ZipFile } from "yazl";
import { getExportLogDir, getExportLogStageDir } from "@knorvia/services/node";
import {
  localDiagnosticRequestSchema,
  redactDiagnosticText,
  type LocalDiagnosticExportResult,
  type LocalDiagnosticPreview,
  type LocalDiagnosticPreviewFile,
  type LocalDiagnosticRequest,
} from "@knorvia/shared";
import { createAboutSnapshot, readBuildMetadata } from "./about.js";
import { writeSanitizedDiagnosticLogSnapshot } from "./exportLogs.js";

const PREVIEW_TTL_MS = 10 * 60 * 1000;
const MAX_FILES = 256;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const SNIPPET_BYTES = 2048;

interface Dependencies {
  now?: () => Date;
  sourceDir?: string;
  stageRootDir?: string;
  outputRootDir?: string;
  showItemInFolder?: (path: string) => void | Promise<void>;
}

interface FrozenPreview {
  root: string;
  directory: string;
  preview: LocalDiagnosticPreview;
  timer: ReturnType<typeof setTimeout>;
}

const previews = new Map<string, FrozenPreview>();

function isOwnedStageDirectory(root: string, directory: string): boolean {
  const rel = relative(resolve(root), resolve(directory));
  return (
    !rel.includes(sep) &&
    /^diagnostic-[a-zA-Z0-9-]+$/.test(rel) &&
    dirname(resolve(directory)) === resolve(root)
  );
}

async function removeOwnedStage(root: string, directory: string): Promise<void> {
  if (!isOwnedStageDirectory(root, directory)) throw new Error("Unsafe diagnostic staging path");
  await rm(directory, { recursive: true, force: true });
}

function systemSummary(): string {
  const about = createAboutSnapshot({ buildMetadata: readBuildMetadata() });
  return [
    `Product: Knorvia Studio`,
    `Version: ${about.appVersion}`,
    `Build: ${about.buildCommitId}`,
    `Environment: ${about.environment}`,
    `OS: ${about.osType} ${about.osRelease} ${about.osArch}`,
    `Electron: ${about.electronVersion}`,
    `Chromium: ${about.chromiumVersion}`,
    `Node.js: ${about.nodeVersion}`,
    "",
  ]
    .map(redactDiagnosticText)
    .join("\n");
}

function safeKernelProjection(input: LocalDiagnosticRequest): LocalDiagnosticRequest {
  return {
    inspection: input.inspection,
    kernels: input.kernels.map((kernel) => ({
      id: redactDiagnosticText(kernel.id),
      name: redactDiagnosticText(kernel.name),
      installed: kernel.installed,
      ...(kernel.version ? { version: redactDiagnosticText(kernel.version) } : {}),
      origin: kernel.origin,
    })),
  };
}

async function listSnapshotFiles(directory: string): Promise<string[]> {
  const found: string[] = [];
  const visit = async (subdir: string, prefix: string) => {
    for (const entry of await readdir(subdir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error("Diagnostic snapshot contains a link");
      const archivePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = join(subdir, entry.name);
      if (entry.isDirectory()) await visit(full, archivePath);
      else if (entry.isFile()) found.push(archivePath);
      else throw new Error("Diagnostic snapshot contains an unsupported entry");
      if (found.length > MAX_FILES) throw new Error("Diagnostic file count exceeds limit");
    }
  };
  await visit(directory, "");
  return found.sort();
}

async function moveLogsToAnonymousNames(directory: string, source: string): Promise<void> {
  const files = (await listSnapshotFiles(source)).filter((path) => path !== "about.txt");
  const target = join(directory, "logs");
  await mkdir(target);
  const counters = { app: 0, cli: 0, helper: 0 };
  for (const path of files) {
    const kind = path.startsWith(".knorvia-studio/cli/log/")
      ? "cli"
      : path.startsWith(".knorvia-studio/computer-use/run/")
        ? "helper"
        : "app";
    const number = String(++counters[kind]).padStart(4, "0");
    await rename(join(source, ...path.split("/")), join(target, `${kind}-${number}.log`));
  }
  await rm(source, { recursive: true, force: true });
}

async function describeSnapshotFile(
  directory: string,
  archivePath: string,
): Promise<LocalDiagnosticPreviewFile> {
  const full = join(directory, ...archivePath.split("/"));
  const bytes = (await stat(full)).size;
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(full)) hash.update(chunk);
  const handle = await open(full, "r");
  try {
    const buffer = Buffer.alloc(Math.min(bytes, SNIPPET_BYTES));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return {
      path: archivePath,
      bytes,
      sha256: hash.digest("hex"),
      snippet: buffer.subarray(0, bytesRead).toString("utf8"),
      snippetTruncated: bytes > bytesRead,
    };
  } finally {
    await handle.close();
  }
}

export async function previewLocalDiagnostics(
  request: LocalDiagnosticRequest,
  dependencies: Dependencies = {},
): Promise<LocalDiagnosticPreview> {
  const input = localDiagnosticRequestSchema.parse(request);
  const now = dependencies.now ?? (() => new Date());
  const root = resolve(dependencies.stageRootDir ?? getExportLogStageDir());
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "diagnostic-"));
  try {
    const source = join(directory, "source");
    await writeSanitizedDiagnosticLogSnapshot(source, { sourceDir: dependencies.sourceDir, now });
    // Log filenames can contain account names or credentials. The preview and
    // ZIP expose stable source categories and sequence numbers instead.
    await moveLogsToAnonymousNames(directory, source);
    // The older log-export about file contains a hostname, so it is never
    // moved into this user-facing package.
    await writeFile(join(directory, "system.txt"), systemSummary(), "utf8");
    await writeFile(
      join(directory, "kernels.json"),
      JSON.stringify(safeKernelProjection(input), null, 2) + "\n",
      "utf8",
    );
    const paths = await listSnapshotFiles(directory);
    const files = await Promise.all(paths.map((path) => describeSnapshotFile(directory, path)));
    if (files.reduce((sum, file) => sum + file.bytes, 0) > MAX_TOTAL_BYTES) {
      throw new Error("Diagnostic snapshot exceeds size limit");
    }
    const id = randomUUID();
    const preview = { id, createdAt: now().toISOString(), files };
    const timer = setTimeout(() => {
      void discardLocalDiagnosticPreview(id);
    }, PREVIEW_TTL_MS);
    timer.unref?.();
    previews.set(id, { root, directory, preview, timer });
    return preview;
  } catch (error) {
    await removeOwnedStage(root, directory);
    throw error;
  }
}

export async function discardLocalDiagnosticPreview(id: string): Promise<void> {
  const frozen = previews.get(id);
  if (!frozen) return;
  previews.delete(id);
  clearTimeout(frozen.timer);
  await removeOwnedStage(frozen.root, frozen.directory);
}

async function writeSnapshotZip(
  directory: string,
  files: LocalDiagnosticPreviewFile[],
  output: string,
): Promise<void> {
  const zip = new ZipFile();
  const stream = createWriteStream(output);
  zip.once("error", (error) =>
    stream.destroy(error instanceof Error ? error : new Error(String(error))),
  );
  for (const file of files) zip.addFile(join(directory, ...file.path.split("/")), file.path);
  const writing = pipeline(zip.outputStream, stream);
  zip.end();
  await writing;
}

export async function exportLocalDiagnostics(
  id: string,
  dependencies: Dependencies = {},
): Promise<LocalDiagnosticExportResult> {
  const frozen = previews.get(id);
  if (!frozen) return { success: false, error: "诊断预览已过期，请重新预览" };
  try {
    for (const file of frozen.preview.files) {
      const current = await describeSnapshotFile(frozen.directory, file.path);
      if (current.bytes !== file.bytes || current.sha256 !== file.sha256) {
        throw new Error("Diagnostic snapshot changed after preview");
      }
    }
    const outputRoot = resolve(dependencies.outputRootDir ?? getExportLogDir());
    await mkdir(outputRoot, { recursive: true });
    const outputDir = await mkdtemp(join(outputRoot, "knorvia-diagnostics-"));
    const path = join(outputDir, "knorvia-diagnostics.zip");
    try {
      await writeSnapshotZip(frozen.directory, frozen.preview.files, path);
      const show =
        dependencies.showItemInFolder ??
        (async (file: string) => {
          const { shell } = await import("electron");
          shell.showItemInFolder(file);
        });
      await show(path);
      await discardLocalDiagnosticPreview(id);
      return { success: true, path };
    } catch (error) {
      await rm(outputDir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
