import { basename, resolvePath } from "../../deps.js";
import type { FilePartSource, TurnAttachment } from "../../deps.js";
import type { ResolvedTurnAttachment } from "../../types.js";
import { inferImageMimeFromPath } from "../attachment-image.js";
import { resolvedPlaceholderAttachment } from "../attachment-placeholder.js";
import { inferVideoMimeFromPath } from "../attachment-video.js";
import type { LocalMediaContext, LocalOptions } from "./context.js";
import { resolveLocalImage } from "./local-image.js";
import { resolveLocalPdf } from "./local-pdf.js";
import { resolveLocalVideo } from "./local-video.js";
import { localReadFailed } from "./read-failure.js";

export async function resolveLocalMedia(
  attachment: TurnAttachment,
  index: number,
  options: LocalOptions,
): Promise<ResolvedTurnAttachment> {
  const path = attachment.path!;
  const absolutePath = resolvePath(options.workingDirectory, path);
  const filename = basename(absolutePath);
  const mime = attachment.type === "image"
    ? inferImageMimeFromPath(absolutePath)
    : attachment.type === "pdf"
      ? "application/pdf"
      : inferVideoMimeFromPath(absolutePath) ?? attachment.mimeType ?? "video/mp4";
  const source: FilePartSource = {
    type: "file",
    path: absolutePath,
    text: { value: path, start: 0, end: path.length },
  };
  let stat: LocalMediaContext["stat"];
  try {
    stat = await options.fileSystemPort.stat(
      { path: absolutePath, trace: options.traceContext },
      { signal: options.abortSignal },
    );
  } catch {
    return localReadFailed(attachment, filename, mime, source);
  }
  if (stat.kind !== "file") {
    return resolvedPlaceholderAttachment(attachment, attachment.path!, "attachment_not_file", {
      filename,
      mime,
      sizeBytes: stat.sizeBytes,
      source,
    });
  }
  const context: LocalMediaContext = {
    absolutePath, attachment, filename, index, mime, options, source, stat,
  };
  if (attachment.type === "image") {
    return resolveLocalImage(context);
  }
  if (attachment.type === "pdf") {
    return resolveLocalPdf(context);
  }
  return resolveLocalVideo(context);
}
