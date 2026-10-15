// SPDX-License-Identifier: Apache-2.0
// 前置闸门（一）：环境变量赋值与重定向。
// 这两类语法不改变命令名本身，却能改变副作用面（把输出落到磁盘、把设备流接进管道），
// 因此在进入命令族规则之前先统一筛一遍。
import type { BashCommandInvocation } from "../bash-command-parser.js";

// 允许随只读命令出现的环境变量名：全部是展示、输出格式与构建模式类开关，
// 既不改变命令的读写性质，也不把数据带出进程。
const ADMITTED_ENV_NAMES = new Set(
  (
    "ANTHROPIC_API_KEY BLOCK_SIZE BLOCKSIZE CGO_ENABLED CHARSET CI CLICOLOR CLICOLOR_FORCE COLORTERM COLUMNS " +
    "DEBIAN_FRONTEND FORCE_COLOR GCC_COLORS GIT_TERMINAL_PROMPT GO111MODULE GOARCH GOEXPERIMENT GOOS GREP_COLOR " +
    "GREP_COLORS LANG LANGUAGE LC_ALL LC_CTYPE LC_TIME LINES LSCOLORS LS_COLORS NO_COLOR NODE_ENV PYTEST_DEBUG " +
    "PYTEST_DISABLE_PLUGIN_AUTOLOAD PYTHONDONTWRITEBYTECODE PYTHONUNBUFFERED RUST_BACKTRACE RUST_LOG TERM TIME_STYLE TZ"
  ).split(" "),
);

const INPUT_SIDE_OPERATORS = new Set(["<", "<<", "<&", "<<<"]);
const DEVICE_CHANNEL_PATTERN = /^\/dev\/(?:tcp|udp)\//u;
const NULL_DEVICE_PATH = "/dev/null";
const BARE_FD_PATTERN = /^\d+$/u;
const UNC_LEAD_PATTERN = /^(?:\/\/|\\\\)[^/\\]/u;

type RedirectVerdict = "admit" | "reject";

export function areEnvAssignmentsAllowed(commandPart: BashCommandInvocation): boolean {
  for (const assignment of commandPart.envAssignments) {
    const name = assignment.name;
    if (name === undefined || !ADMITTED_ENV_NAMES.has(name)) return false;
  }
  return true;
}

export function areRedirectsAllowed(commandPart: BashCommandInvocation): boolean {
  for (const redirect of commandPart.redirects) {
    if (classifyRedirect(redirect.operator, redirect.target) === "reject") return false;
  }
  return true;
}

// 单条重定向的裁决表：设备通道最先拒绝（它把网络套接字接进命令流），
// 其余按「文件描述符复制 / 空设备 / 输入侧」三类放行，落盘类一律拒绝。
function classifyRedirect(operator: string, target: string): RedirectVerdict {
  if (DEVICE_CHANNEL_PATTERN.test(target)) return "reject";
  if (operator === ">&" && BARE_FD_PATTERN.test(target)) return "admit";
  if (target === NULL_DEVICE_PATH) return "admit";
  if (INPUT_SIDE_OPERATORS.has(operator)) {
    return uncPath(target) ? "reject" : "admit";
  }
  return "reject";
}

export function isUnsafeWindowsUncPath(value: string): boolean {
  return uncPath(value);
}

function uncPath(value: string): boolean {
  return UNC_LEAD_PATTERN.test(value);
}
