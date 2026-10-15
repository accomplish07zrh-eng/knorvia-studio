// SPDX-License-Identifier: Apache-2.0
// glob 兼容层：把 `*`/`**`/`?`/`{a,b}` 翻译成锚定正则，其余字符按字面量处理。
const META_CHARACTERS = /[\\^$.*+?()[\]{}|]/g;
const ANY_WITHIN_SEGMENT = "[^/]*";
const ANY_DEEP_WITH_SLASH = "(?:.*/)?";
const ANY_DEEP = ".*";
const ANY_ONE_WITHIN_SEGMENT = "[^/]";

/** 转义正则元字符，保证字面量片段不被解释。 */
function literal(text: string): string {
  return text.replace(META_CHARACTERS, "\\$&");
}

/** 花括号内容按字面 alternatives 处理，不做递归 glob 展开。 */
function braceGroup(body: string): string {
  const alternatives = body.split(",").map(literal).join("|");
  return "(?:" + alternatives + ")";
}

function isStar(text: string, at: number): boolean {
  return text[at] === "*";
}

/** `**` 后跟 `/` 时表示「任意层目录（可为零层）」。 */
function isDeepStarWithSlash(text: string, at: number): boolean {
  return text[at + 1] === "*" && text[at + 2] === "/";
}

function isDoubleStar(text: string, at: number): boolean {
  return text[at + 1] === "*";
}

/**
 * 返回判定函数：`relativePath` 全路径匹配优先；模式里不含 `/` 时允许只匹配文件名
 * （与 ripgrep 的「无路径模式匹配 basename」语义一致）。
 */
export function glob(pattern: string): (relativePath: string, fileName: string) => boolean {
  const normalized = pattern.replaceAll("\\", "/").replace(/^\.\//, "");
  const parts: string[] = ["^"];
  let at = 0;
  while (at < normalized.length) {
    const char = normalized[at]!;
    if (isStar(normalized, at)) {
      if (!isDoubleStar(normalized, at)) {
        parts.push(ANY_WITHIN_SEGMENT);
        at += 1;
        continue;
      }
      if (isDeepStarWithSlash(normalized, at)) {
        parts.push(ANY_DEEP_WITH_SLASH);
        at += 3;
        continue;
      }
      parts.push(ANY_DEEP);
      at += 2;
      continue;
    }
    if (char === "?") {
      parts.push(ANY_ONE_WITHIN_SEGMENT);
      at += 1;
      continue;
    }
    if (char === "{") {
      const close = normalized.indexOf("}", at + 1);
      if (close > at) {
        parts.push(braceGroup(normalized.slice(at + 1, close)));
        at = close + 1;
        continue;
      }
    }
    parts.push(literal(char));
    at += 1;
  }
  const regex = new RegExp(parts.join("") + "$");
  const fitsWholePath = regex.test.bind(regex);
  return (relativePath, fileName) =>
    fitsWholePath(relativePath) || (!normalized.includes("/") && fitsWholePath(fileName));
}
