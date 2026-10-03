import { isArtifactUri } from "@knorvia/shared";
import type { MessageWithParts } from "@knorvia/contracts";
import type { KnorviaApp } from "../app/types.js";
import { mapMessageWithParts } from "./message-mapper.js";

const IMAGE_DATA_URL_LIMIT = 20 * 1024 * 1024;
const DATA_URL_PREFIX = "data:";
const IMAGE_PREFIX = "image/";
const WILDCARD_IMAGE = "image/*";
type PublicMessage = ReturnType<typeof mapMessageWithParts>;
type PublicPart = PublicMessage["parts"][number];

function inlineData(value: string): boolean {
  const separator = value.indexOf(",");
  return value.startsWith(DATA_URL_PREFIX) && separator >= 0 && value.slice(separator + 1).length > 0;
}

function concreteMime(value: string): string | undefined {
  const media = value.split(";")[0]?.trim().toLowerCase() ?? "";
  return media.startsWith(IMAGE_PREFIX) && media !== WILDCARD_IMAGE ? media : undefined;
}

async function hydrate(app: Pick<KnorviaApp, "readToolResultArtifact">, part: PublicPart): Promise<PublicPart> {
  if (part.type !== "file") return part;
  if (!(part.mime === WILDCARD_IMAGE || part.mime.startsWith(IMAGE_PREFIX)) || inlineData(part.url)) return part;
  const metadataUri = typeof part.metadata?.artifactUri === "string" ? part.metadata.artifactUri : undefined;
  const uri = metadataUri ?? part.url;
  if (!isArtifactUri(uri)) return part;
  try {
    const artifact = await app.readToolResultArtifact(uri);
    let url: string | undefined;
    if (inlineData(artifact.content)) url = artifact.content;
    else {
      const mime = concreteMime(artifact.contentType) ?? concreteMime(part.mime);
      if (mime) url = DATA_URL_PREFIX + mime + ";base64," + artifact.content;
    }
    if (!url || Buffer.byteLength(url, "utf8") > IMAGE_DATA_URL_LIMIT) return part;
    return { ...part, url };
  } catch {
    // 兼容历史附件：既有 artifact 读取/转换失败保留原引用，不移除文件或泄漏本地路径。
    return part;
  }
}

export async function snapshotMessages(
  app: Pick<KnorviaApp, "readToolResultArtifact">,
  messages: readonly MessageWithParts[],
): Promise<PublicMessage[]> {
  const publicMessages = messages.map(mapMessageWithParts);
  const hydration = publicMessages.map(async (message) => {
    const output = { ...message };
    output.parts = await Promise.all(message.parts.map((part) => hydrate(app, part)));
    return output;
  });
  return await Promise.all(hydration);
}
