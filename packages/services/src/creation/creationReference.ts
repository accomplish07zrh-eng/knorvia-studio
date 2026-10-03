import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, realpath, stat, type FileHandle } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import type { CreationJob, CreationOutput, ICreationService } from "./contract.js";

type ReferenceImage = { name: string; mimeType: string; dataBase64: string };
type ReferenceAdmission = Readonly<{
  requestPath: string;
  canonicalPath: string;
  name: string;
  routeFailure: string;
  sha256?: string;
}>;

const REFERENCE_LIMIT = 10 * 1024 * 1024;
const SIZE_FAILURE = "参考图必须是 10 MB 内的文件";
const PROJECT_FAILURE = "参考图必须位于当前项目或已完成的创作成果中";
const HANDOFF_FAILURE = "上游创作成果在交接前已变化";

function pathKey(path: string): string {
  const absolute = resolve(path);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

function projectContains(root: string, target: string): boolean {
  const tail = relative(root, target);
  // 越界的是完整 .. 路径段，项目内的 ..portrait.png 仍是合法文件名。
  return !isAbsolute(tail) && tail !== ".." && !tail.startsWith(`..${sep}`);
}

function succeededOutput(jobs: readonly CreationJob[], path: string): CreationOutput | undefined {
  const wanted = pathKey(path);
  for (const job of jobs) {
    if (job.status !== "succeeded") continue;
    for (const output of job.outputs) {
      if (pathKey(output.path) === wanted) return output;
    }
  }
  return undefined;
}

function imageMime(name: string): string {
  switch (name.toLowerCase().split(".").pop()) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      throw new Error("参考图只支持 PNG、JPEG 或 WebP");
  }
}

async function assertAdmittedRoute(
  admission: ReferenceAdmission,
  opened: { dev: number; ino: number },
): Promise<void> {
  const currentPath = await realpath(admission.requestPath);
  if (pathKey(currentPath) !== pathKey(admission.canonicalPath)) {
    throw new Error(admission.routeFailure);
  }
  const currentFile = await stat(admission.canonicalPath);
  if (currentFile.dev !== opened.dev || currentFile.ino !== opened.ino) {
    throw new Error(admission.routeFailure);
  }
}

async function captureReferenceBytes(file: FileHandle): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let length = 0;
  while (length <= REFERENCE_LIMIT) {
    const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, REFERENCE_LIMIT + 1 - length));
    const { bytesRead } = await file.read(chunk, 0, chunk.length, length);
    if (bytesRead === 0) break;
    chunks.push(chunk.subarray(0, bytesRead));
    length += bytesRead;
    if (length > REFERENCE_LIMIT) throw new Error(SIZE_FAILURE);
  }
  // stat 后仍可能被截断或增大，实际交接字节也必须遵守原大小准入。
  if (length === 0) throw new Error(SIZE_FAILURE);
  return Buffer.concat(chunks, length);
}

async function readAdmittedReference(admission: ReferenceAdmission): Promise<ReferenceImage> {
  const candidate = await stat(admission.canonicalPath);
  if (!candidate.isFile() || candidate.size === 0 || candidate.size > REFERENCE_LIMIT) {
    throw new Error(SIZE_FAILURE);
  }
  const flags =
    constants.O_RDONLY | (process.platform === "win32" ? 0 : constants.O_NOFOLLOW);
  const file = await open(admission.canonicalPath, flags);
  let bytes: Buffer;
  try {
    const details = await file.stat();
    if (!details.isFile() || details.size === 0 || details.size > REFERENCE_LIMIT) {
      throw new Error(SIZE_FAILURE);
    }
    await assertAdmittedRoute(admission, details);
    bytes = await captureReferenceBytes(file);
    if (
      admission.sha256 !== undefined &&
      createHash("sha256").update(bytes).digest("hex") !== admission.sha256
    ) {
      throw new Error(HANDOFF_FAILURE);
    }
    await assertAdmittedRoute(admission, details);
  } catch (error) {
    try {
      await file.close();
    } catch {
      // 清理不能覆盖路径、大小、读回哈希或原生 IO 的首个失败。
    }
    throw error;
  }
  await file.close();
  return {
    name: admission.name,
    mimeType: imageMime(admission.name),
    dataBase64: bytes.toString("base64"),
  };
}

/** 项目真实路径或已完成成果身份准入后，才交给统一的只读文件所有者。 */
export async function readCreationReference(
  path: string,
  workspacePath: string,
  creation: ICreationService,
): Promise<{ name: string; mimeType: string; dataBase64: string }> {
  const workspace = workspacePath ? await realpath(workspacePath) : "";
  const requestPath = workspace ? resolve(workspace, path) : resolve(path);
  const canonicalPath = await realpath(requestPath);
  if (!workspace || !projectContains(workspace, canonicalPath)) {
    if (!succeededOutput(await creation.listJobs(), canonicalPath)) {
      throw new Error(PROJECT_FAILURE);
    }
  }
  return readAdmittedReference({
    requestPath,
    canonicalPath,
    name: basename(canonicalPath),
    routeFailure: PROJECT_FAILURE,
  });
}

/** 工作流引用核对存档身份、存档哈希和同一已打开文件的字节，失败发生在派单前。 */
export async function readVerifiedCreationReference(
  input:
    | { kind: "creation-output"; sourcePath: string; sha256: string }
    | { kind: "workspace-file"; relativePath: string },
  creation: ICreationService,
): Promise<{ name: string; mimeType: string; dataBase64: string }> {
  if (input.kind !== "creation-output") {
    throw new Error("上游工作区文件暂不能作为创作参考图，请改用创作节点的成果输出");
  }
  const requestPath = resolve(input.sourcePath);
  const recorded = succeededOutput(await creation.listJobs(), requestPath);
  if (!recorded) throw new Error("参考图必须来自已完成的创作成果");
  const sha256 = recorded.hash;
  // 工作流交接规格要求三方哈希一致；旧记录缺哈希时只保留普通参考读取能力。
  if (!sha256 || sha256 !== input.sha256) {
    throw new Error("上游创作成果的哈希与引用记录不一致");
  }
  const canonicalPath = await realpath(requestPath);
  return readAdmittedReference({
    requestPath,
    canonicalPath,
    name: basename(requestPath),
    routeFailure: HANDOFF_FAILURE,
    sha256,
  });
}
