import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import type { CreationJob, CreateCreationJobInput } from "./contract.js";
import { creationOutputFormat } from "./providers.js";

export interface StoredJob extends CreationJob {
  providerTaskId?: string;
  referencePath?: string;
  referenceMimeType?: string;
  referenceHash?: string;
  firstFramePath?: string;
  firstFrameMimeType?: string;
  firstFrameHash?: string;
  lastFramePath?: string;
  lastFrameMimeType?: string;
  lastFrameHash?: string;
}

interface CreationFile<T> {
  version: 1;
  items: T[];
}

export async function readRecords<T>(path: string): Promise<T[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  let parsed: CreationFile<T>;
  try {
    parsed = JSON.parse(raw) as CreationFile<T>;
  } catch {
    throw new Error("创作记录损坏；为避免丢失数据，已停止写入");
  }
  if (parsed.version !== 1 || !Array.isArray(parsed.items))
    throw new Error("创作记录版本不兼容；为避免丢失数据，已停止写入");
  return parsed.items;
}

export async function writeRecords<T>(path: string, items: T[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify({ version: 1, items } satisfies CreationFile<T>), {
    mode: 0o600,
  });
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await rename(temporary, path);
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (!["EPERM", "EACCES", "EBUSY"].includes(code ?? "") || attempt >= 8) throw error;
        await new Promise((resolve) => setTimeout(resolve, Math.min(25 * 2 ** attempt, 250)));
      }
    }
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

export function publicJob(job: StoredJob): CreationJob {
  const {
    providerTaskId: _privateTaskId,
    referencePath: _referencePath,
    referenceMimeType: _referenceMimeType,
    referenceHash: _referenceHash,
    firstFramePath: _firstFramePath,
    firstFrameMimeType: _firstFrameMimeType,
    firstFrameHash: _firstFrameHash,
    lastFramePath: _lastFramePath,
    lastFrameMimeType: _lastFrameMimeType,
    lastFrameHash: _lastFrameHash,
    ...visible
  } = job;
  return visible;
}

export function decodeReference(
  reference: CreateCreationJobInput["reference"],
):
  | { bytes: Uint8Array; name: string; mimeType: string; hash: string; extension: string }
  | undefined {
  if (!reference) return undefined;
  if (!["image/png", "image/jpeg", "image/webp"].includes(reference.mimeType))
    throw new Error("参考图只支持 PNG、JPEG 或 WebP");
  if (
    !reference.dataBase64 ||
    reference.dataBase64.length > 14 * 1024 * 1024 ||
    !/^[A-Za-z0-9+/=]+$/.test(reference.dataBase64)
  )
    throw new Error("参考图为空、过大或数据无效（上限 10 MB）");
  const bytes = Buffer.from(reference.dataBase64, "base64");
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error("参考图超过 10 MB 限制");
  const detected = creationOutputFormat(bytes, "image");
  if (detected.mimeType !== reference.mimeType) throw new Error("参考图内容与文件类型不匹配");
  return {
    bytes,
    name: reference.name.trim().slice(0, 150) || `reference.${detected.extension}`,
    mimeType: detected.mimeType,
    hash: createHash("sha256").update(bytes).digest("hex"),
    extension: detected.extension,
  };
}

export async function savedReference(
  rootDir: string,
  path?: string,
  name?: string,
  mimeType?: string,
  expectedHash?: string,
) {
  if (!path && !name && !mimeType && !expectedHash) return undefined;
  if (!path || !name || !mimeType || !expectedHash)
    throw new Error("原任务参考图记录不完整，不能安全重试");
  let root: string;
  let target: string;
  try {
    root = await realpath(join(rootDir, "references"));
    target = await realpath(path);
  } catch {
    throw new Error("原任务参考图无法读取，不能安全重试");
  }
  const within = relative(root, target);
  if (!within || within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within))
    throw new Error("原任务参考图路径不属于创作数据目录");
  let bytes: Buffer;
  try {
    if ((await stat(target)).size > 10 * 1024 * 1024) throw new Error("原任务参考图超过大小限制");
    bytes = await readFile(target);
  } catch (error) {
    if (error instanceof Error && error.message === "原任务参考图超过大小限制") throw error;
    throw new Error("原任务参考图无法读取，不能安全重试");
  }
  if (createHash("sha256").update(bytes).digest("hex") !== expectedHash)
    throw new Error("原任务参考图已变化，不能安全重试");
  return { name, mimeType, dataBase64: bytes.toString("base64") };
}
