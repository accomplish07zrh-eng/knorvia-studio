// SPDX-License-Identifier: Apache-2.0
// 从对话文本里抽取 `plugin://<stable-id>` 形式的插件引用：去重、每轮封顶、非法 id 单独计数。
const STABLE_ID_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const PLUGIN_LINK = /\[(?:\\.|[^\\\]])*\]\((?:<((?:\\.|[^>])*?)>|((?:\\.|[^)\s])*))\)/gu;
const PLUGIN_SCHEME = /^plugin:\/\//iu;
const SCHEME_PREFIX = "plugin://";
const MAX_STABLE_ID_CHARS = 256;
const NOT_VALID = false;

export const MAX_PLUGIN_REFERENCES_PER_TURN = 8;

export interface ExtractPluginReferencesResult {
  references: string[];
  truncatedCount: number;
  invalidCount: number;
}

// 稳定 id = `<segment>@<segment>`：两段都必须以字母数字开头、只含字母数字与 . _ -，长度 1..256，
// 且只允许一个 @（前缀段不含 @ 由字符集保证）。
export function isValidPluginStableId(candidate: string): boolean {
  if (candidate.length < 1 || candidate.length > MAX_STABLE_ID_CHARS) return NOT_VALID;
  const divider = candidate.indexOf("@");
  if (divider < 1 || divider !== candidate.lastIndexOf("@")) return NOT_VALID;
  const prefix = candidate.slice(0, divider);
  const suffix = candidate.slice(divider + 1);
  if (STABLE_ID_SEGMENT.exec(prefix)?.[0] !== prefix) return NOT_VALID;
  return STABLE_ID_SEGMENT.exec(suffix)?.[0] === suffix;
}

// 按出现顺序收引用：重复的 id 只算一次，超出一轮上限的计入 truncatedCount，
// 写法像 plugin:// 但 id 不合法（或大小写不对）的计入 invalidCount。
export function extractPluginReferences(input: string): ExtractPluginReferencesResult {
  const result: ExtractPluginReferencesResult = {
    references: [],
    truncatedCount: 0,
    invalidCount: 0,
  };
  const retained = new Set<string>();

  for (const link of input.matchAll(PLUGIN_LINK)) {
    const destination = link[1] ?? link[2] ?? "";
    if (!PLUGIN_SCHEME.test(destination)) continue;
    const stableId = destination.slice(SCHEME_PREFIX.length);
    if (!destination.startsWith(SCHEME_PREFIX) || !isValidPluginStableId(stableId)) {
      result.invalidCount += 1;
    } else if (!retained.has(stableId)) {
      if (result.references.length >= MAX_PLUGIN_REFERENCES_PER_TURN) {
        result.truncatedCount += 1;
      } else {
        retained.add(stableId);
        result.references.push(stableId);
      }
    }
  }

  return result;
}
