import { createHash } from "node:crypto";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { StudioKernelMedia, StudioKernelSink } from "../../kernelTypes.js";

/** 单项内联媒体保存上限；超过的只保留名称（specs/knorvia-kernel-native-media-20261010.md）。 */
export const STUDIO_KERNEL_MEDIA_MAX_BYTES = 64 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
};

function extensionOf(item: StudioKernelMedia): string {
  const fromMime = item.mimeType ? EXTENSIONS[item.mimeType.toLowerCase()] : undefined;
  if (fromMime) return fromMime;
  const fromName = /\.([A-Za-z0-9]{1,8})$/.exec(item.name ?? "")?.[1];
  return fromName?.toLowerCase() ?? "bin";
}

/** 内联内容按 SHA-256 写入 Studio 数据目录；同一内容只写一次，写入经临时文件原子替换。 */
export async function materializeKernelMedia(
  directory: string,
  item: StudioKernelMedia,
): Promise<StudioKernelMedia> {
  if (!item.dataBase64) return item;
  const { dataBase64, ...rest } = item;
  // base64 长度先粗判，避免为超大内容分配缓冲区。
  if (dataBase64.length > Math.ceil(STUDIO_KERNEL_MEDIA_MAX_BYTES / 3) * 4)
    return { ...rest, omitted: "too-large" };
  const bytes = Buffer.from(dataBase64, "base64");
  if (!bytes.length) return { ...rest, omitted: "too-large" };
  const digest = createHash("sha256").update(bytes).digest("hex");
  const path = join(directory, `${digest}.${extensionOf(item)}`);
  const exists = await stat(path).then(
    (value) => value.isFile() && value.size === bytes.length,
    () => false,
  );
  if (!exists) {
    await mkdir(directory, { recursive: true });
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, bytes);
    await rename(temporary, path);
  }
  return { ...rest, uri: path, name: item.name ?? `${digest.slice(0, 12)}.${extensionOf(item)}` };
}

/**
 * 外部内核 sink 外层：媒体事件中的内联内容落盘后再交给运行时，数据库只保存位置。
 * 落盘失败只把该项标为不可用，不中断 turn。
 */
export function withMaterializedMedia(sink: StudioKernelSink, directory: string): StudioKernelSink {
  return {
    ask: (interaction, signal) => sink.ask(interaction, signal),
    async emit(event) {
      if (event.type !== "media") return sink.emit(event);
      const items = await Promise.all(
        event.items.map((item) =>
          materializeKernelMedia(directory, item).catch(() => {
            const { dataBase64: _omitted, ...rest } = item;
            return { ...rest, omitted: "too-large" as const };
          }),
        ),
      );
      return sink.emit({ type: "media", items });
    },
  };
}
