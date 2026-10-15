// SPDX-License-Identifier: Apache-2.0
// 前置闸门（二）：命令包装剥离。
// command / builtin / noglob 是 POSIX shell 里只改变「按哪个路径取可执行文件 /
// 是否做 glob 展开」的包装词，本身不引入副作用；剥掉它们后，里层的真实命令才进入规则表。
// 包装词后面若跟的是旗标（例如查版本的 -v），则保持原样，交由后续阶段判定。
const WRAPPER_WORDS = new Set(["builtin", "command", "noglob"]);
const REPEATED_P_FLAG = /^-p+$/u;

/** 剥离结果：正数 = 前导词数量；"keep" = 保持原样（包装词后面出现了旗标一类的词）。 */
type PeelOutcome = number | "keep";

export function stripSafeCommandWrappers(argv: readonly string[]): readonly string[] {
  let current: readonly string[] = argv;
  for (;;) {
    const head = current[0];
    if (head === undefined || !WRAPPER_WORDS.has(head)) return current;
    const outcome = peelWrapper(head, current);
    if (outcome === "keep") return current;
    if (outcome >= current.length) return [];
    current = current.slice(outcome);
  }
}

function peelWrapper(wrapper: string, argv: readonly string[]): PeelOutcome {
  if (wrapper === "command") return peelCommandStyle(argv);
  if (wrapper === "builtin") return argv[1] === "--" ? 2 : 1;
  return argv.length <= 1 ? "keep" : 1;
}

// command 的可执行文件解析选项：若干 -p（按默认 PATH 取可执行文件），
// 可选一个 "--"；再往后的词必须是真实命令名，否则整段保持原样。
function peelCommandStyle(argv: readonly string[]): PeelOutcome {
  let index = 1;
  while (index < argv.length && REPEATED_P_FLAG.test(argv[index] ?? "")) index += 1;
  if (argv[index] === "--") index += 1;
  const next = argv[index];
  if (next === undefined || next.startsWith("-")) return "keep";
  return index;
}
