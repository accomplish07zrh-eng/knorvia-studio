import { readFile, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import type { ICreationService } from "./contract.js";

function within(root: string, path: string): boolean {
  const tail = relative(root, path);
  return tail === "" || (!tail.startsWith("..") && !isAbsolute(tail));
}

function referenceMimeType(name: string): string {
  const extension = name.toLowerCase().split(".").pop();
  const mimeType =
    extension === "png"
      ? "image/png"
      : extension === "jpg" || extension === "jpeg"
        ? "image/jpeg"
        : extension === "webp"
          ? "image/webp"
          : undefined;
  if (!mimeType) throw new Error("参考图只支持 PNG、JPEG 或 WebP");
  return mimeType;
}

/**
 * 已核验的上游输出作为参考图。
 *
 * 与 `readCreationReference` 的区别：这里**不接受展开后的占位路径**，而是按 Host 解析出的
 * 来源身份重新核对——来源必须是已记录的创作成果、必须与引用记录的哈希一致、读回的字节
 * 也必须再核对一次。任何一步失败都在**派单之前**抛错，不会把错误来源交给创作服务。
 */
export async function readVerifiedCreationReference(
  input:
    | { kind: "creation-output"; sourcePath: string; sha256: string }
    | { kind: "workspace-file"; relativePath: string },
  creation: ICreationService,
): Promise<{ name: string; mimeType: string; dataBase64: string }> {
  if (input.kind !== "creation-output")
    throw new Error("上游工作区文件暂不能作为创作参考图，请改用创作节点的成果输出");
  const absolute = resolve(input.sourcePath);
  const key = process.platform === "win32" ? absolute.toLowerCase() : absolute;
  const jobs = await creation.listJobs();
  const recorded = jobs
    .flatMap((job) => (job.status === "succeeded" ? job.outputs : []))
    .find(
      (output) =>
        (process.platform === "win32"
          ? resolve(output.path).toLowerCase()
          : resolve(output.path)) === key,
    );
  if (!recorded) throw new Error("参考图必须来自已完成的创作成果");
  if (recorded.hash && recorded.hash !== input.sha256)
    throw new Error("上游创作成果的哈希与引用记录不一致");
  const details = await stat(absolute);
  if (!details.isFile() || details.size === 0 || details.size > 10 * 1024 * 1024)
    throw new Error("参考图必须是 10 MB 内的文件");
  const bytes = await readFile(absolute);
  if (createHash("sha256").update(bytes).digest("hex") !== input.sha256)
    throw new Error("上游创作成果在交接前已变化");
  const name = basename(absolute);
  return { name, mimeType: referenceMimeType(name), dataBase64: bytes.toString("base64") };
}

/** Only the current project or an already recorded Creation output can be used as a reference. */
export async function readCreationReference(
  path: string,
  workspacePath: string,
  creation: ICreationService,
): Promise<{ name: string; mimeType: string; dataBase64: string }> {
  const workspace = workspacePath ? await realpath(workspacePath) : "";
  const resolved = await realpath(workspace ? resolve(workspace, path) : resolve(path));
  if (!workspace || !within(workspace, resolved)) {
    const jobs = await creation.listJobs();
    const outputs = jobs.flatMap((job) => (job.status === "succeeded" ? job.outputs : []));
    const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
    if (
      !outputs.some(
        (output) =>
          (process.platform === "win32"
            ? resolve(output.path).toLowerCase()
            : resolve(output.path)) === key,
      )
    )
      throw new Error("参考图必须位于当前项目或已完成的创作成果中");
  }
  const details = await stat(resolved);
  if (!details.isFile() || details.size === 0 || details.size > 10 * 1024 * 1024)
    throw new Error("参考图必须是 10 MB 内的文件");
  const name = basename(resolved);
  const bytes = await readFile(resolved);
  return { name, mimeType: referenceMimeType(name), dataBase64: bytes.toString("base64") };
}
