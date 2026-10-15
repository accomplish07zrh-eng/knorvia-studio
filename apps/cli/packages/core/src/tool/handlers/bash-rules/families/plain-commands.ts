// SPDX-License-Identifier: Apache-2.0
// 简单命令族的规则数据：按「参数姿态」分组声明——任意参数都只读的观察工具、
// 只认命令名的无参工具、按旗标画像审查的工具。数据依据各命令公开文档组织，
// 判定入口仍是合同冻结的只读裁决样例。
import {
  BASE64_SAFE_FLAGS,
  CAT_SAFE_FLAGS,
  DATE_SAFE_FLAGS,
  FD_SAFE_FLAGS,
  FILE_SAFE_FLAGS,
  GREP_SAFE_FLAGS,
  HEAD_TAIL_SAFE_FLAGS,
  HOSTNAME_SAFE_FLAGS,
  JQ_SAFE_FLAGS,
  LSOF_SAFE_FLAGS,
  MAN_SAFE_FLAGS,
  NETSTAT_SAFE_FLAGS,
  PGREP_SAFE_FLAGS,
  PS_SAFE_FLAGS,
  PYRIGHT_SAFE_FLAGS,
  RG_SAFE_FLAGS,
  SED_SAFE_FLAGS,
  SHA_SUM_SAFE_FLAGS,
  SORT_SAFE_FLAGS,
  SS_SAFE_FLAGS,
  TEST_SAFE_FLAGS,
  TPUT_SAFE_FLAGS,
  TREE_SAFE_FLAGS,
  WC_SAFE_FLAGS,
  XARGS_SAFE_FLAGS,
} from "../../bash-readonly-policy-flags.js";
import {
  dateCommandIsDangerous,
  jqCommandIsDangerous,
  lsofCommandIsDangerous,
  manCommandIsDangerous,
  psCommandIsDangerous,
  pyrightCommandIsDangerous,
  sedCommandIsDangerous,
  ssCommandIsDangerous,
  testCommandIsDangerous,
  tputCommandIsDangerous,
  xargsCommandIsDangerous,
} from "../../bash-readonly-policy-callbacks.js";
import type { BashReadonlyCommandPolicy, SafeFlagValue } from "../policy-shapes.js";

// git 全局段：只有翻页控制两项可安全跳过；带值全局旗标当前为空表；其余一律危险。
export const GIT_GLOBAL_NO_VALUE_FLAGS = new Set("--no-pager --paginate".split(" "));
export const GIT_GLOBAL_VALUE_FLAGS = new Set<string>();
export const GIT_GLOBAL_DANGEROUS_FLAGS = new Set(
  (
    "-c -C --attr-source --bare --config-env --exec-path --git-dir --namespace --shallow-file " +
    "--super-prefix --work-tree"
  ).split(" "),
);

// 纯观察类工具：参数只影响输出形态，不触碰任何状态。
export const READONLY_ALLOW_ANY_ARG_COMMANDS = new Set(
  (
    "basename cal cat cmp column comm cut df diff dirname du expand expr false fmt fold free groups head " +
    "hexdump id locale nl nproc numfmt od paste pr readlink realpath rev seq sleep stat strings tac tail tr " +
    "true tsort type uname unexpand uptime wc which"
  ).split(" "),
);

// docker 的只读子命令前缀（多词策略之外的补充）。
export const READONLY_ALLOW_ANY_ARG_COMMAND_PREFIXES = [
  ["docker", "images"],
  ["docker", "ps"],
] as const;

const ANY_ARGUMENT_OBSERVERS =
  "cd cut diff dirname du echo find hexdump id ls nl printf readlink realpath rev stat strings tr uniq uname which".split(
    " ",
  );
const NAME_ONLY_OBSERVERS = "alias false pwd true whoami".split(" ");

interface ImageSpec {
  subject: string;
  image: Readonly<Record<string, SafeFlagValue>>;
  /** 追加危险性复核（就地写、环境读取一类隐藏副作用）。 */
  dangerousWhen?: (commandText: string, args: readonly string[]) => boolean;
  /** 声明该命令不把 "--" 当作审查边界。 */
  ignoresDoubleDash?: boolean;
  /** 对整段命令文本的最终复核。 */
  wholeText?: RegExp;
}

const IMAGE_BOUND_COMMANDS: readonly ImageSpec[] = [
  { subject: "base64", image: BASE64_SAFE_FLAGS, ignoresDoubleDash: true },
  { subject: "cat", image: CAT_SAFE_FLAGS },
  { subject: "date", image: DATE_SAFE_FLAGS, dangerousWhen: dateCommandIsDangerous },
  { subject: "egrep", image: GREP_SAFE_FLAGS },
  { subject: "fd", image: FD_SAFE_FLAGS },
  { subject: "fdfind", image: FD_SAFE_FLAGS },
  { subject: "file", image: FILE_SAFE_FLAGS },
  { subject: "fgrep", image: GREP_SAFE_FLAGS },
  { subject: "grep", image: GREP_SAFE_FLAGS },
  { subject: "head", image: HEAD_TAIL_SAFE_FLAGS },
  {
    subject: "hostname",
    image: HOSTNAME_SAFE_FLAGS,
    wholeText: /^hostname(?:\s+(?:-[a-zA-Z]|--[a-zA-Z-]+))*\s*$/,
  },
  { subject: "jq", image: JQ_SAFE_FLAGS, dangerousWhen: jqCommandIsDangerous },
  { subject: "lsof", image: LSOF_SAFE_FLAGS, dangerousWhen: lsofCommandIsDangerous },
  { subject: "man", image: MAN_SAFE_FLAGS, dangerousWhen: manCommandIsDangerous },
  { subject: "md5sum", image: SHA_SUM_SAFE_FLAGS },
  { subject: "netstat", image: NETSTAT_SAFE_FLAGS },
  { subject: "pgrep", image: PGREP_SAFE_FLAGS },
  { subject: "ps", image: PS_SAFE_FLAGS, dangerousWhen: psCommandIsDangerous },
  {
    subject: "pyright",
    image: PYRIGHT_SAFE_FLAGS,
    dangerousWhen: pyrightCommandIsDangerous,
    ignoresDoubleDash: true,
  },
  { subject: "rg", image: RG_SAFE_FLAGS },
  { subject: "sed", image: SED_SAFE_FLAGS, dangerousWhen: sedCommandIsDangerous },
  { subject: "sha1sum", image: SHA_SUM_SAFE_FLAGS },
  { subject: "sha256sum", image: SHA_SUM_SAFE_FLAGS },
  { subject: "sort", image: SORT_SAFE_FLAGS },
  { subject: "ss", image: SS_SAFE_FLAGS, dangerousWhen: ssCommandIsDangerous },
  { subject: "tail", image: HEAD_TAIL_SAFE_FLAGS },
  {
    subject: "test",
    image: TEST_SAFE_FLAGS,
    dangerousWhen: testCommandIsDangerous,
    ignoresDoubleDash: true,
  },
  { subject: "tput", image: TPUT_SAFE_FLAGS, dangerousWhen: tputCommandIsDangerous },
  { subject: "tree", image: TREE_SAFE_FLAGS },
  { subject: "wc", image: WC_SAFE_FLAGS },
  { subject: "xargs", image: XARGS_SAFE_FLAGS, dangerousWhen: xargsCommandIsDangerous },
  {
    subject: "[",
    image: TEST_SAFE_FLAGS,
    dangerousWhen: testCommandIsDangerous,
    ignoresDoubleDash: true,
  },
  {
    subject: "[[",
    image: TEST_SAFE_FLAGS,
    dangerousWhen: testCommandIsDangerous,
    ignoresDoubleDash: true,
  },
];

const SHELL_BUILTIN_HELP_IMAGE = {
  "-d": "none",
  "-m": "none",
  "-s": "none",
} as const satisfies Readonly<Record<string, SafeFlagValue>>;

function specToPolicy(spec: ImageSpec): BashReadonlyCommandPolicy {
  const policy: BashReadonlyCommandPolicy = { safeFlags: spec.image };
  if (spec.dangerousWhen) policy.additionalCommandIsDangerousCallback = spec.dangerousWhen;
  if (spec.ignoresDoubleDash) policy.respectsDoubleDash = false;
  if (spec.wholeText) policy.regex = spec.wholeText;
  return policy;
}

export const READONLY_COMMAND_POLICIES = new Map<string, BashReadonlyCommandPolicy>([
  ...ANY_ARGUMENT_OBSERVERS.map(
    (subject) => [subject, { allowAnyArgs: true } satisfies BashReadonlyCommandPolicy] as const,
  ),
  ...NAME_ONLY_OBSERVERS.map(
    (subject) => [subject, { commandOnly: true } satisfies BashReadonlyCommandPolicy] as const,
  ),
  ["help", { safeFlags: SHELL_BUILTIN_HELP_IMAGE } satisfies BashReadonlyCommandPolicy],
  ...IMAGE_BOUND_COMMANDS.map((spec) => [spec.subject, specToPolicy(spec)] as const),
]);
