// SPDX-License-Identifier: Apache-2.0
// 旗标遍历器：按策略画像逐词消费参数流。
// 语义（合同冻结）：画像内的旗标按其取值语义吞掉取值；画像外的旗标拒绝；
// 位置参数一律放行；"--" 之后按策略决定是否继续审查；xargs 的目标命令单独把关。
import { XARGS_TARGET_COMMANDS } from "../bash-readonly-policy-callbacks.js";
import { OPTION_PATTERN } from "../bash-readonly-policy-flags-text.js";
import type { BashReadonlyCommandPolicy, SafeFlagValue } from "./policy-shapes.js";

/** 单个词消费完毕后的去向：前进一步数、"stop" 结束审查、"reject" 判有副作用。 */
type ConsumeOutcome = number | "stop" | "reject";

const COMPACT_COUNT = /^-\d+$/u;

export function isArgvAllowedByPolicy(
  stream: readonly string[],
  profile: BashReadonlyCommandPolicy,
  subject: string,
  from = 1,
): boolean {
  if (stream.length === 0) return false;
  if (profile.allowAnyArgs) return true;
  if (profile.commandOnly) return stream.length === from;
  const chart = profile.safeFlags;
  if (!chart) return false;
  return consumeStream(stream, profile, subject, chart, from);
}

function consumeStream(
  stream: readonly string[],
  profile: BashReadonlyCommandPolicy,
  subject: string,
  chart: Readonly<Record<string, SafeFlagValue>>,
  from: number,
): boolean {
  let position = from;
  while (position < stream.length) {
    const token = stream[position] ?? "";
    if (token === "") {
      position += 1;
      continue;
    }
    if (subject === "xargs" && (!token.startsWith("-") || token === "--")) {
      const target = token === "--" ? stream[position + 1] : token;
      if (!target || !XARGS_TARGET_COMMANDS.has(target)) return false;
      break;
    }
    const outcome = classifyToken(stream, chart, subject, profile, token, position);
    if (outcome === "reject") return false;
    if (outcome === "stop") break;
    position += outcome;
  }
  return true;
}

function classifyToken(
  stream: readonly string[],
  chart: Readonly<Record<string, SafeFlagValue>>,
  subject: string,
  profile: BashReadonlyCommandPolicy,
  token: string,
  position: number,
): ConsumeOutcome {
  if (token === "--") {
    // 默认终止审查（"--" 之后按路径解释）；策略声明不认分隔符时把它当普通词跳过。
    return profile.respectsDoubleDash === false ? 1 : "stop";
  }
  if (isLegacyCountFlag(token, subject, profile)) return 1;
  if (!looksLikeOption(token)) return 1;
  return consumeOption(stream, chart, subject, token, position);
}

// head/tail 的 -123 缩写与策略声明的紧凑数字旗标：跳过即可。
function isLegacyCountFlag(
  token: string,
  subject: string,
  profile: BashReadonlyCommandPolicy,
): boolean {
  if (!COMPACT_COUNT.test(token)) return false;
  const headTail = subject === "head" || subject === "tail";
  return headTail || profile.allowCompactNumericCountFlag === true;
}

function looksLikeOption(token: string): boolean {
  return token.startsWith("-") && token.length > 1 && OPTION_PATTERN.test(token);
}

function consumeOption(
  stream: readonly string[],
  chart: Readonly<Record<string, SafeFlagValue>>,
  subject: string,
  token: string,
  position: number,
): ConsumeOutcome {
  const [flag, inline, inlineValue] = splitOptionWord(token);
  const kind = chart[flag];
  if (kind === undefined) return consumeAttachedOrCluster(chart, subject, token);
  if (kind === "none") return inline ? "reject" : 1;
  if (kind === "optionalString") return 1;
  const value = inline ? inlineValue : stream[position + 1];
  if (value === undefined) return "reject";
  if (kind === "string" && !inline && !plainStringAccepted(value, subject, flag)) {
    return "reject";
  }
  if (!valueMatchesKind(value, kind)) return "reject";
  return inline ? 1 : 2;
}

// 首个 "=" 之前是旗标名，之后是内联取值；没有 "=" 则整词是旗标。
function splitOptionWord(token: string): [string, boolean, string] {
  const equalsAt = token.indexOf("=");
  if (equalsAt < 0) return [token, false, ""];
  return [token.slice(0, equalsAt), true, token.slice(equalsAt + 1)];
}

// 画像外旗标的两条出路：短旗标粘连取值（-Ixxx）或纯 none 短旗标聚合（-abc）。
function consumeAttachedOrCluster(
  chart: Readonly<Record<string, SafeFlagValue>>,
  subject: string,
  token: string,
): ConsumeOutcome {
  const glued = gluedShortEntry(chart, token);
  if (glued) {
    if (!plainStringAccepted(glued.value, subject, glued.flag)) return "reject";
    if (!valueMatchesKind(glued.value, glued.kind)) return "reject";
    return 1;
  }
  return clusterIsAllNone(chart, token) ? 1 : "reject";
}

function gluedShortEntry(
  chart: Readonly<Record<string, SafeFlagValue>>,
  token: string,
): { flag: string; kind: SafeFlagValue; value: string } | undefined {
  if (!token.startsWith("-") || token.startsWith("--") || token.length <= 2) return undefined;
  const shortFlag = token.slice(0, 2);
  const kind = chart[shortFlag];
  if (kind === undefined || kind === "none") return undefined;
  return { flag: shortFlag, kind, value: token.slice(2) };
}

// 聚合短旗标（-abc）：每个字符都必须是画像内取值为 none 的短旗标。
function clusterIsAllNone(chart: Readonly<Record<string, SafeFlagValue>>, token: string): boolean {
  if (!token.startsWith("-") || token.startsWith("--") || token.length <= 2) return false;
  for (const letter of token.slice(1).split("")) {
    if (chart[`-${letter}`] !== "none") return false;
  }
  return true;
}

// 独立取值看起来像另一个旗标时，默认拒绝；git 的 --sort 允许形如 -r 的排序键。
function plainStringAccepted(value: string, subject: string, flag: string): boolean {
  if (!looksLikeOption(value)) return true;
  return subject === "git" && flag === "--sort" && /^-[a-zA-Z]/.test(value);
}

function valueMatchesKind(value: string, kind: SafeFlagValue): boolean {
  switch (kind) {
    case "number":
      return /^\d+$/.test(value);
    case "char":
      return value.length === 1;
    case "{}":
      return value === "{}";
    case "EOF":
      return value === "EOF";
    case "optionalString":
    case "string":
      return true;
    case "none":
      return false;
  }
}
