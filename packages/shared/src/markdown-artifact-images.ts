// SPDX-License-Identifier: Apache-2.0
import { isArtifactUri } from "./artifact-uri.js";

/*
 * 会话消息里把 artifact 图片改写成 renderer 可加载的本地代理 URL。
 * 代码块（``` / ~~~）里的内容保持原样，避免展示文本被改写。
 *
 * 实现上把「围栏状态机」与「单行改写」拆开：状态机只回答当前行是否属于
 * 围栏，改写函数只处理普通行，两边互不知道对方的细节。
 */

/** renderer 代理前缀；历史版本与当前版本共用同一个前缀。 */
const IMAGE_PROXY_PREFIX = "/__knorvia_artifact_image__/";

/** 围栏起始行：最多 3 个前导空格 + 至少 3 个反引号或波浪线。 */
const OPENING_FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/u;

/**
 * `![alt](knorvia-artifact://…)`，允许 `<...>` 包裹与可选 title。
 * 只匹配新 scheme：历史 zcode-artifact 图片不参与改写，解包才接受两种 scheme。
 */
const ARTIFACT_IMAGE = new RegExp(
  String.raw`!\[[^\]\n]*\]\(\s*<?(knorvia-artifact://[^\s)>]+)>?(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)`,
  "gu",
);

/** 一个围栏块：标识字符与长度。关闭围栏必须同字符且不短于开启。 */
interface FenceBlock {
  marker: "`" | "~";
  length: number;
}

/** 把一行拆成「围栏块 + 信息串」；不是围栏行返回 null。 */
function readFence(line: string): { block: FenceBlock; info: string } | null {
  const matched = OPENING_FENCE.exec(line);
  const run = matched?.[1];
  if (!run) return null;
  return { block: { marker: run[0] as "`" | "~", length: run.length }, info: matched?.[2] ?? "" };
}

/** 关闭当前块：同字符、长度不短于开启、且没有额外信息串。 */
function closesFence(open: FenceBlock, candidate: FenceBlock, info: string): boolean {
  return open.marker === candidate.marker && candidate.length >= open.length && info.trim() === "";
}

/**
 * 反引号围栏的信息串里不能再出现反引号（否则只是行内代码），
 * 这里据此判断该行能否作为新围栏的起点。
 */
function opensFence(candidate: FenceBlock, info: string): boolean {
  return candidate.marker === "~" || !info.includes("`");
}

/** 逐行处理：围栏行原样保留，普通行交给 `transform`。 */
function mapProseLines(markdown: string, transform: (line: string) => string): string {
  const output: string[] = [];
  let open: FenceBlock | null = null;

  for (const line of markdown.split("\n")) {
    const fence = readFence(line);
    if (fence === null) {
      output.push(open === null ? transform(line) : line);
      continue;
    }
    if (open !== null && closesFence(open, fence.block, fence.info)) open = null;
    else if (open === null && opensFence(fence.block, fence.info)) open = fence.block;
    output.push(line);
  }

  return output.join("\n");
}

export function extractMarkdownArtifactImageRefs(markdown: string): string[] {
  const refs = new Set<string>();
  mapProseLines(markdown, (line) => {
    for (const match of line.matchAll(ARTIFACT_IMAGE)) {
      const ref = match[1];
      if (ref) refs.add(ref);
    }
    return line;
  });
  return Array.from(refs);
}

export function rewriteMarkdownArtifactImageSources(markdown: string): string {
  return mapProseLines(markdown, (line) =>
    line.replace(ARTIFACT_IMAGE, (whole, ref: string) =>
      whole.replace(ref, `${IMAGE_PROXY_PREFIX}${encodeURIComponent(ref)}`),
    ),
  );
}

/** 百分号必须跟两位十六进制，否则 decodeURIComponent 会抛错；先挡掉畸形编码。 */
const WELL_FORMED_PERCENT_ESCAPES = /^(?:[^%]|%[0-9a-fA-F]{2})*$/u;

/** 代理 URL → artifact ref；前缀不符、编码畸形或不是合法 artifact URI 都返回 null。 */
export function decodeMarkdownArtifactImageSource(source: string): string | null {
  if (!source.startsWith(IMAGE_PROXY_PREFIX)) return null;
  const encoded = source.slice(IMAGE_PROXY_PREFIX.length);
  if (!WELL_FORMED_PERCENT_ESCAPES.test(encoded)) return null;
  const ref = decodeURIComponent(encoded);
  return isArtifactUri(ref) ? ref : null;
}
