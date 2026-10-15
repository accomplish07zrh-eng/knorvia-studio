// SPDX-License-Identifier: Apache-2.0
// 危险性复核（非 git 命令族）：旗标画像之外的隐藏副作用探测。
// 覆盖三类线索——读外部文件/环境的旗标（jq -f）、就地改写脚本（sed 的 w 命令）、
// 以及把网络或环境状态拉进来的参数形态（gh 的仓库路径、ss 的地址过滤器）。
// 每条规则依据命令公开文档重建，判定结果以合同样例为准。

export function isSedInPlaceOption(token: string): boolean {
  return token.startsWith("-i") || token === "--in-place" || token.startsWith("--in-place=");
}

// jq：从文件加载模块/数据、或在过滤器里读环境与引入外部文件，都视为有副作用。
// 短旗标允许粘连取值（-ffile），长旗标只认完整形态或等号取值。
const JQ_INLINE_FILE_FLAGS = "-f -L".split(" ");
const JQ_LONG_FILE_FLAGS =
  "--argfile --from-file --library-path --rawfile --run-tests --slurpfile".split(" ");
const JQ_ENV_READING = /\$ENV\b/u;
const JQ_ENV_WORD = /(^|[^A-Za-z0-9_$.])env(?=$|[^A-Za-z0-9_])/u;
const JQ_MODULE_WORDS = /(^|[^A-Za-z0-9_])(?:include|import)(?=$|[^A-Za-z0-9_])/u;

export function jqCommandIsDangerous(_subject: string, rest: readonly string[]): boolean {
  for (let position = 0; position < rest.length; position += 1) {
    const token = rest[position] ?? "";
    if (!token) continue;
    if (
      JQ_INLINE_FILE_FLAGS.some((flag) => token.startsWith(flag)) ||
      JQ_LONG_FILE_FLAGS.some((flag) => token === flag || token.startsWith(`${flag}=`))
    ) {
      return true;
    }
    if (token === "--") return jqFilterThreatens(rest[position + 1] ?? "");
    if (token === "--indent") {
      position += 1;
      continue;
    }
    if (token.startsWith("-")) continue;
    return jqFilterThreatens(token);
  }
  return false;
}

function jqFilterThreatens(filter: string): boolean {
  return JQ_ENV_READING.test(filter) || JQ_ENV_WORD.test(filter) || JQ_MODULE_WORDS.test(filter);
}

// sed：就地旗标、w 命令（把模式空间写进文件）都算改写文件。
const SED_WRITE_COMMAND = /(?:^|[;{\n])\s*(?:[0-9,$!+~-]+)?\s*w(?:\s|$)/u;

export function sedCommandIsDangerous(_subject: string, rest: readonly string[]): boolean {
  let scriptSeen = false;
  for (let position = 0; position < rest.length; position += 1) {
    const token = rest[position] ?? "";
    if (!token) continue;
    if (isSedInPlaceOption(token)) return true;
    if (token === "-e" || token === "--expression") {
      position += 1;
      if (sedScriptWritesFile(rest[position] ?? "")) return true;
      continue;
    }
    if (token.startsWith("--expression=")) {
      if (sedScriptWritesFile(token.slice("--expression=".length))) return true;
      continue;
    }
    if (token === "-l" || token === "--line-length") {
      position += 1;
      continue;
    }
    if (token.startsWith("--line-length=")) continue;
    if (token === "--") {
      return sedScriptWritesFile(rest[position + 1] ?? "");
    }
    if (!token.startsWith("-") && !scriptSeen) {
      scriptSeen = true;
      if (sedScriptWritesFile(token)) return true;
    }
  }
  return false;
}

function sedScriptWritesFile(script: string): boolean {
  return SED_WRITE_COMMAND.test(script);
}

// date：除格式串（+ 开头）与已知旗标外的裸词、以及引用文件的旗标都算越界。
const DATE_REFERENCE_FLAGS = new Set("-d --date -r --reference --rfc-3339".split(" "));

export function dateCommandIsDangerous(_subject: string, rest: readonly string[]): boolean {
  let position = 0;
  while (position < rest.length) {
    const token = rest[position] ?? "";
    position += 1;
    if (token.startsWith("--") && token.includes("=")) continue;
    if (token.startsWith("-")) {
      position += DATE_REFERENCE_FLAGS.has(token) ? 1 : 0;
      continue;
    }
    if (!token.startsWith("+")) return true;
  }
  return false;
}

// ps：带 e 的选择参数（如 -ef、e）会暴露完整环境变量。
const PS_ENV_SELECTOR = /^[a-zA-Z]*e[a-zA-Z]*$/u;

export function psCommandIsDangerous(_subject: string, rest: readonly string[]): boolean {
  return rest.some((token) => !token.startsWith("-") && PS_ENV_SELECTOR.test(token));
}

export function pyrightCommandIsDangerous(_subject: string, rest: readonly string[]): boolean {
  return rest.some((token) => token === "--watch" || token === "-w");
}

// man：按页名里的 "/" 判定为路径访问；apropos/whatis 检索模式下不算。
const MAN_APROPOS_FLAGS = new Set("-k -f --apropos --whatis".split(" "));
const MAN_SECTION_FLAGS = new Set("-S -s".split(" "));

export function manCommandIsDangerous(_subject: string, rest: readonly string[]): boolean {
  let lookupMode = false;
  let pathMode = false;
  for (let position = 0; position < rest.length; position += 1) {
    const token = rest[position] ?? "";
    if (!pathMode && token === "--") {
      pathMode = true;
      continue;
    }
    if (!pathMode && token.startsWith("-") && token !== "-") {
      if (MAN_APROPOS_FLAGS.has(token)) lookupMode = true;
      if (MAN_SECTION_FLAGS.has(token)) position += 1;
      continue;
    }
    pathMode = true;
    if (token.includes("/")) return !lookupMode;
  }
  return false;
}

// lsof：+m 改内存映射名；@主机名形式的 -i 过滤器会发起网络查询。
const LSOF_INET_WITH_HOST = /^-[a-zA-Z]*i\S*@/u;
const LSOF_INET_FLAG = /^-[a-zA-Z]*i$/u;

export function lsofCommandIsDangerous(_subject: string, rest: readonly string[]): boolean {
  for (let position = 0; position < rest.length; position += 1) {
    const token = rest[position] ?? "";
    if (token.startsWith("+m")) return true;
    if (LSOF_INET_WITH_HOST.test(token) && hostPartHasLetters(token)) return true;
    if (LSOF_INET_FLAG.test(token) && hostPartHasLetters(rest[position + 1] ?? "")) return true;
  }
  return false;
}

function hostPartHasLetters(filter: string): boolean {
  if (!filter.includes("@")) return false;
  const host = filter.slice(filter.indexOf("@") + 1).split(":")[0] ?? "";
  return /[a-zA-Z]/.test(host);
}

// tput：会改终端状态的能力（清屏、初始化串、备用屏切换等）一律视为有副作用。
const TPUT_STATE_CAPABILITIES = new Set(
  (
    "clear flash if init iprog is1 is2 is3 mc0 mc4 mc5 mc5i mc5p pfkey pfloc pfx pfxl reset rf rmcup " +
    "rs1 rs2 rs3 smcup"
  ).split(" "),
);

export function tputCommandIsDangerous(_subject: string, rest: readonly string[]): boolean {
  let operandsOnly = false;
  for (let position = 0; position < rest.length; ) {
    const token = rest[position] ?? "";
    if (token === "--") {
      operandsOnly = true;
      position += 1;
      continue;
    }
    if (!operandsOnly && token.startsWith("-")) {
      if (token === "-S") return true;
      if (!token.startsWith("--") && token.length > 2 && token.includes("S")) return true;
      position += token === "-T" ? 2 : 1;
      continue;
    }
    if (TPUT_STATE_CAPABILITIES.has(token)) return true;
    position += 1;
  }
  return false;
}

// ss：过滤表达式里的裸地址/端口模式（非关键字 token）视为网络查询条件。
const SS_EXPRESSION_KEYWORDS =
  /^(dst|src|dport|sport|and|or|not|eq|ne|ge|le|gt|lt|autobound|state|exclude|dev|fwmark|cgroup)$/;
const SS_KEYWORDS_WITH_VALUE = /^(state|exclude|dport|sport|dev|fwmark|cgroup)$/;
const SS_VALUE_FLAGS = /^(-f|--family|-A|--query|--socket)$/;

export function ssCommandIsDangerous(_subject: string, rest: readonly string[]): boolean {
  const operands = collectSsOperands(rest);
  const tokens = operands
    .join(" ")
    .split(/[\s()=!<>&|,]+/u)
    .filter(Boolean);
  let skipNext = false;
  for (const token of tokens) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (SS_EXPRESSION_KEYWORDS.test(token)) {
      skipNext = SS_KEYWORDS_WITH_VALUE.test(token);
      continue;
    }
    if (ssTokenLooksLikeAddress(token)) return true;
  }
  return false;
}

function collectSsOperands(rest: readonly string[]): string[] {
  const operands: string[] = [];
  let operandsOnly = false;
  for (let position = 0; position < rest.length; position += 1) {
    const token = rest[position] ?? "";
    if (!operandsOnly && token === "--") {
      operandsOnly = true;
      continue;
    }
    if (!operandsOnly && token.startsWith("-")) {
      if (SS_VALUE_FLAGS.test(token)) position += 1;
      continue;
    }
    operands.push(token);
  }
  return operands;
}

function ssTokenLooksLikeAddress(token: string): boolean {
  if (/[g-zG-Z]/.test(token)) return true;
  return /[a-fA-F]/.test(token) && (token.includes(".") || !token.includes(":"));
}

// test/[：变量展开（-v/-R）、逻辑连接符（-a/-o）、方括号一律拒绝；数值比较两侧必须是字面数。
const TEST_DISALLOWED = new Set("-v -R -a -o".split(" "));
const TEST_NUMERIC_COMPARATORS = new Set("-eq -ne -lt -le -gt -ge".split(" "));
const TEST_LITERAL_NUMBER = /^-?(0[xX][0-9a-fA-F]+|[0-9]+#[0-9a-zA-Z]+|[0-9]+)$/u;

export function testCommandIsDangerous(_subject: string, rest: readonly string[]): boolean {
  if (rest.some((token) => TEST_DISALLOWED.has(token) || token.includes("["))) return true;
  for (let position = 0; position < rest.length; position += 1) {
    const token = rest[position] ?? "";
    if (TEST_NUMERIC_COMPARATORS.has(token)) {
      for (const neighbor of [rest[position - 1], rest[position + 1]]) {
        if (neighbor !== undefined && !TEST_LITERAL_NUMBER.test(neighbor)) return true;
      }
    }
    if (token === "-t") {
      const operand = rest[position + 1];
      if (operand !== undefined && !TEST_LITERAL_NUMBER.test(operand)) return true;
    }
  }
  return false;
}

// xargs：目标命令必须落在安全白名单内；带值旗标各吞掉一个取值。
export const XARGS_TARGET_COMMANDS = new Set(
  "echo printf wc grep egrep fgrep head tail".split(" "),
);
const XARGS_VALUE_FLAGS = new Set("-I -n -P -L -s -E -d".split(" "));

export function xargsCommandIsDangerous(_subject: string, rest: readonly string[]): boolean {
  for (let position = 0; position < rest.length; position += 1) {
    let token = rest[position] ?? "";
    if (!token) continue;
    if (token === "--" && position + 1 < rest.length) {
      position += 1;
      token = rest[position] ?? "";
    }
    if (token.startsWith("-") && token !== "-") {
      if (XARGS_VALUE_FLAGS.has(token)) position += 1;
      continue;
    }
    return !XARGS_TARGET_COMMANDS.has(token);
  }
  return false;
}

// gh：参数里出现 owner/repo 形态的路径（含协议或 @ 远端）即视为访问远端仓库。
export function ghCommandIsDangerous(_subject: string, rest: readonly string[]): boolean {
  for (const token of rest) {
    if (!token) continue;
    let operand = token;
    if (token.startsWith("-")) {
      const equalsAt = token.indexOf("=");
      if (equalsAt === -1) continue;
      operand = token.slice(equalsAt + 1);
      if (!operand) continue;
    }
    if (!operand.includes("/") && !operand.includes("://") && !operand.includes("@")) continue;
    if (operand.includes("://") || operand.includes("@")) return true;
    if ((operand.match(/\//gu) ?? []).length >= 2) return true;
  }
  return false;
}

// docker：改连远程 daemon、换证书或切上下文的全局旗标（含粘连与聚合短旗标写法）。
const DOCKER_DAEMON_FLAGS = "-H -c --config --context --host --tlscacert --tlscert --tlskey".split(
  " ",
);
const DOCKER_DAEMON_SHORT_LETTERS = new Set(
  DOCKER_DAEMON_FLAGS.filter((flag) => flag.length === 2).map((flag) => flag[1] ?? ""),
);

export function dockerCommandIsDangerous(_subject: string, rest: readonly string[]): boolean {
  return hasDangerousDockerOption(rest);
}

export function hasDangerousDockerOption(rest: readonly string[]): boolean {
  return rest.some((token) => {
    const flagHit = DOCKER_DAEMON_FLAGS.some(
      (flag) =>
        token === flag ||
        token.startsWith(`${flag}=`) ||
        (flag.length === 2 && token.length > 2 && token.startsWith(flag)),
    );
    if (flagHit) return true;
    const cluster = token.match(/^-([A-Za-z]+)/u)?.[1];
    if (cluster === undefined || cluster.length < 2) return false;
    for (const letter of cluster) {
      if (DOCKER_DAEMON_SHORT_LETTERS.has(letter)) return true;
    }
    return false;
  });
}
