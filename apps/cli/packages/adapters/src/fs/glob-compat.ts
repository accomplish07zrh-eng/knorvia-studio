// SPDX-License-Identifier: Apache-2.0
// glob 兼容层：把 `*`/`**`/`?`/`{a,b}` 翻译成锚定正则，其余字符按字面量处理。
const META_CHARACTERS = /[\\^$.*+?()[\]{}|]/g;

/** 转义正则元字符，保证字面量片段不被解释。 */
function literal(text: string): string {
  return text.replace(META_CHARACTERS, "\\$&");
}

/** 花括号内容按字面 alternatives 处理，不做递归 glob 展开。 */
function braceGroup(body: string): string {
  const alternatives = body.split(",").map(literal).join("|");
  return "(?:" + alternatives + ")";
}

/**
 * 返回判定函数：`relativePath` 全路径匹配优先；模式里不含 `/` 时允许只匹配文件名
 * （与 ripgrep 的「无路径模式匹配 basename」语义一致）。
 */
export function glob(pattern: string): (relativePath: string, fileName: string) => boolean {
  const normalized = pattern.replaceAll("\\", "/").replace(/^\.\//, "");
  const parts = ["^"];
  let at = 0;
  while (at < normalized.length) {
    const char = normalized[at]!;
    if (char === "*") {
      if (normalized[at + 1] !== "*") {
        parts.push("[^/]*");
        at += 1;
        continue;
      }
      const withSlash = normalized[at + 2] === "/";
      parts.push(withSlash ? "(?:.*/)?" : ".*");
      at += withSlash ? 3 : 2;
      continue;
    }
    if (char === "?") {
      parts.push("[^/]");
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
  return (relativePath, fileName) =>
    regex.test(relativePath) || (!normalized.includes("/") && regex.test(fileName));
}
