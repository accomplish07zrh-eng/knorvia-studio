// SPDX-License-Identifier: Apache-2.0
// 直接判定闸门：少数命令单凭「命令名 + 参数形状」就能定性，不必查旗标画像。
// 每条规则都依据命令的公开文档（find 的动作与测试项、printf 的格式串能力、
// history/arch/ifconfig 的参数形态）重新组织，命中即给出终判，未命中的命令交回主链。
import { hasDangerousDockerOption } from "../bash-readonly-policy-callbacks.js";
import { READONLY_ALLOW_ANY_ARG_COMMAND_PREFIXES } from "../bash-readonly-policy-commands.js";

// find 的动作类选项：会创建、删除或改写文件，出现任意一个即判有副作用。
const FIND_MUTATION_ACTIONS = new Set(
  "-delete -exec -execdir -files0-from -fls -fprint -fprint0 -fprintf -ok -okdir".split(" "),
);
// find 的测试类选项：自身只读，但会消费紧随其后的一个词（路径、时间或表达式）。
const FIND_CONSUMING_TESTS = new Set(
  (
    "-Bmin -Bnewer -Btime -D -amin -anewer -atime -cmin -cnewer -context -ctime -f -flags -fstype -gid " +
    "-group -ilname -iname -inum -ipath -iregex -iwholename -lname -links -maxdepth -mindepth -mmin -mnewer " +
    "-mtime -name -newer -path -perm -printf -regex -regextype -samefile -size -type -used -user -wholename " +
    "-xattrname -xtype -uid"
  ).split(" "),
);
const FIND_NEWER_RELATIONS = /^-newer[aBcm][aBcmt]$/u;

// 完整等于下列词序列的调用直接判只读：地址展示与版本查询。
const WHOLELY_HARMLESS_INVOCATIONS: readonly (readonly string[])[] = [
  ["ip", "addr"],
  ["node", "-v"],
  ["node", "--version"],
  ["python", "--version"],
  ["python3", "--version"],
];

const HISTORY_INDEX = /^\d+$/u;
const HELP_ONLY_FLAGS = new Set(["-h", "--help"]);
const INTERFACE_NAME_SHAPE = /^[a-zA-Z]/u;

// printf 格式串的危险线索：八进制/十六进制转义可以写出任意字节；
// 宽度星号与数值转换说明符会消费后续参数，后续参数必须是纯数字。
const OCTAL_OR_HEX_ESCAPE = /%[^%a-zA-Z]*(?:hh|ll|[lLhqjzZt])?\\[0-7xX]/u;
const UNICODE_ESCAPE = /\\[uU]/u;
const NUMERIC_CONVERSION = /%[-+ 0#']*[0-9.*]*(?:hh|ll|[lLhqjzZt])?[diouxXeEfFgGaAn]/u;
const STAR_WIDTH = /%[^%a-zA-Z]*\*/u;
const NUMERIC_LITERAL =
  /^[-+]?(0[xX][0-9a-fA-F]+|[0-9]+#[0-9a-zA-Z]+|[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)$/u;
const SUBSTITUTION_MARKERS = /\[|`|\$\(/u;

const SHAPE_GUARDS: Record<string, (argv: readonly string[]) => boolean> = {
  printf: printfShapeIsReadOnly,
  find: findShapeIsReadOnly,
  history: (argv) => argv.length === 1 || (argv.length === 2 && HISTORY_INDEX.test(argv[1] ?? "")),
  arch: (argv) => argv.length === 1 || (argv.length === 2 && HELP_ONLY_FLAGS.has(argv[1] ?? "")),
  ifconfig: (argv) =>
    argv.length === 1 || (argv.length === 2 && INTERFACE_NAME_SHAPE.test(argv[1] ?? "")),
};

export function evaluateDirectReadonlyArgv(argv: readonly string[]): boolean | undefined {
  if (WHOLELY_HARMLESS_INVOCATIONS.some((shape) => sameInvocation(argv, shape))) return true;
  if (argv[0] === "docker") {
    return matchesPrefix(argv, READONLY_ALLOW_ANY_ARG_COMMAND_PREFIXES)
      ? !hasDangerousDockerOption(argv)
      : undefined;
  }
  const guard = SHAPE_GUARDS[argv[0] ?? ""];
  return guard?.(argv);
}

export function isFindWriteOption(word: string): boolean {
  return FIND_MUTATION_ACTIONS.has(word);
}

function sameInvocation(argv: readonly string[], shape: readonly string[]): boolean {
  return argv.length === shape.length && shape.every((word, index) => argv[index] === word);
}

function matchesPrefix(argv: readonly string[], prefixes: unknown): boolean {
  if (!Array.isArray(prefixes)) return false;
  return prefixes.some((entry) => {
    if (!Array.isArray(entry)) return false;
    const words = entry.filter((word): word is string => typeof word === "string");
    return (
      words.length > 0 &&
      argv.length >= words.length &&
      words.every((word, index) => argv[index] === word)
    );
  });
}

function printfShapeIsReadOnly(argv: readonly string[]): boolean {
  const first = argv[1];
  if (first !== undefined && first.startsWith("-") && first !== "--") return false;
  const formatAt = first === "--" ? 2 : 1;
  const format = argv[formatAt] ?? "";
  if (format.includes("$")) return false;
  const bare = format.replace(/%%/g, "");
  if (OCTAL_OR_HEX_ESCAPE.test(bare) || UNICODE_ESCAPE.test(bare)) return false;
  const consumesArguments = NUMERIC_CONVERSION.test(bare) || STAR_WIDTH.test(bare);
  if (!consumesArguments) return true;
  return argv.slice(formatAt + 1).every((value) => isPlainNumericArgument(value));
}

function isPlainNumericArgument(value: string): boolean {
  if (SUBSTITUTION_MARKERS.test(value)) return false;
  return NUMERIC_LITERAL.test(value);
}

function findShapeIsReadOnly(argv: readonly string[]): boolean {
  for (let index = 1; index < argv.length; index += 1) {
    const word = argv[index] ?? "";
    if (FIND_MUTATION_ACTIONS.has(word)) return false;
    if (FIND_CONSUMING_TESTS.has(word) || FIND_NEWER_RELATIONS.test(word)) index += 1;
  }
  return true;
}
