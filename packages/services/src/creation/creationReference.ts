import { readFile, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import type { ICreationService } from "./contract.js";

function within(root: string, path: string): boolean {
  const tail = relative(root, path);
  return tail === "" || (!tail.startsWith("..") && !isAbsolute(tail));
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
  const bytes = await readFile(resolved);
  return { name, mimeType, dataBase64: bytes.toString("base64") };
}
