// SPDX-License-Identifier: Apache-2.0
// 危险性复核（git 命令族）：只读子命令在特定参数形态下会越界——
// --format 能把签名/环境写进输出、reflog 有修剪子命令、remote show 会连远端等。
// 规则依据 git 公开文档重建，判定结果以合同样例为准。

// format/pretty 模板里出现签名占位符时，输出会包含提交签名材料，判有副作用。
const SIGNATURE_PLACEHOLDERS = /%[-+ ]?G|%\(\*?signature/u;

export function gitRevisionFormatCommandIsDangerous(
  _subject: string,
  rest: readonly string[],
): boolean {
  for (let position = 0; position < rest.length; position += 1) {
    const token = rest[position] ?? "";
    const inline = token.includes("=");
    const value = inline ? token.slice(token.indexOf("=") + 1) : rest[position + 1];
    const formatFlag =
      token === "--format" ||
      token === "--pretty" ||
      token.startsWith("--format=") ||
      token.startsWith("--pretty=");
    if (formatFlag && value && SIGNATURE_PLACEHOLDERS.test(value)) return true;
  }
  return false;
}

// reflog 的修剪/删除类子命令一律拒绝；show/list 允许。
const REFLOG_READ_MODES = new Set("show list".split(" "));
const REFLOG_MUTATING_MODES = new Set("expire delete exists drop write".split(" "));

export function gitReflogCommandIsDangerous(_subject: string, rest: readonly string[]): boolean {
  const firstOperand = rest.find((token) => token && !token.startsWith("-"));
  if (firstOperand && !REFLOG_READ_MODES.has(firstOperand)) return true;
  return rest.some((token) => REFLOG_MUTATING_MODES.has(token));
}

// ls-remote：只允许旗标与 "--"，出现任何远端引用操作数即拒绝。
export function gitLsRemoteCommandIsDangerous(_subject: string, rest: readonly string[]): boolean {
  let operandsOnly = false;
  for (let position = 0; position < rest.length; position += 1) {
    const token = rest[position] ?? "";
    if (!operandsOnly && token === "--") {
      operandsOnly = true;
      continue;
    }
    if (!operandsOnly && (token.startsWith("-") || !token)) {
      if (token === "--sort") position += 1;
      continue;
    }
    return true;
  }
  return false;
}

// remote show：必须显式带 -n（不连远端），且恰好一个合法远端名。
const REMOTE_NAME_SHAPE = /^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/u;

export function gitRemoteShowCommandIsDangerous(
  _subject: string,
  rest: readonly string[],
): boolean {
  const separatorAt = rest.indexOf("--");
  const flags = separatorAt === -1 ? rest : rest.slice(0, separatorAt);
  if (!flags.includes("-n")) return true;
  const operands = separatorAt === -1 ? [] : rest.slice(separatorAt + 1);
  const merged = operands.concat(flags.filter((token) => token !== "-n"));
  if (merged.length !== 1) return true;
  return !REMOTE_NAME_SHAPE.test(merged[0] ?? "");
}

// tag / branch：纯列举（-l/--list 等）放行；带操作数的用法（创建、删除、改写）拒绝。
export function gitTagCommandIsDangerous(_subject: string, rest: readonly string[]): boolean {
  return gitListOrQueryOnly(
    rest,
    "-n --contains --format --merged --no-contains --no-merged --points-at --sort".split(" "),
  );
}

export function gitBranchCommandIsDangerous(_subject: string, rest: readonly string[]): boolean {
  return gitListOrQueryOnly(rest, "--contains --no-contains --points-at --sort".split(" "));
}

const LIST_SHORTHAND = "--list -l";
const MERGE_FILTER_FLAGS = new Set(["--merged", "--no-merged"]);

function gitListOrQueryOnly(rest: readonly string[], valueFlags: readonly string[]): boolean {
  const takesValue = new Set(valueFlags);
  let listed = false;
  let operandsOnly = false;
  let lastFlag = "";
  for (let position = 0; position < rest.length; position += 1) {
    const token = rest[position] ?? "";
    if (!token) continue;
    if (token === "--" && !operandsOnly) {
      operandsOnly = true;
      lastFlag = "";
      continue;
    }
    if (!operandsOnly && token.startsWith("-")) {
      if (LIST_SHORTHAND.split(" ").includes(token) || isClusterWithListLetter(token)) {
        listed = true;
      }
      lastFlag = token.includes("=") ? token.slice(0, token.indexOf("=")) : token;
      if (!token.includes("=") && takesValue.has(lastFlag)) position += 1;
      continue;
    }
    const mergeScoped = MERGE_FILTER_FLAGS.has(lastFlag);
    if (!listed && !mergeScoped) return true;
  }
  return false;
}

// 聚合短旗标里带 l（如 -vl）等价于 --list。
function isClusterWithListLetter(token: string): boolean {
  return token[0] === "-" && token[1] !== "-" && token.slice(1).includes("l");
}
