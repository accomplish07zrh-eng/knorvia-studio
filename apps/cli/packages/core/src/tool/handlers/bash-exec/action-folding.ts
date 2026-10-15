// SPDX-License-Identifier: Apache-2.0
// 稳定动作前缀折叠：把「包装词 + 可执行文件 + 动作词」折算成可与用户规则匹配的前缀。
// 依据各工具公开手册：包装词只认 command/env/nohup/sudo/time 且最多两层；
// 高风险根命令（换执行器一类）不折叠；动作词沿公开命令注册表下钻判定。
import {
  BASH_COMMAND_REGISTRY,
  type BashCommandRegistryNode,
} from "../generated/bash-command-registry.js";
import type { BashCommandInvocation } from "../bash-command-parser.js";

const ARG_TAKES_COMMAND = 1;
const ARG_TAKES_MODULE = 2;
const MAX_WRAPPER_LAYERS = 2;

// 换执行器/删数据一类的根命令本身就会让授权面失控，一律不折叠成前缀。
const UNFOLDABLE_ROOTS = new Set(
  "bash chgrp chmod chown cmd dd fish mkfs mount powershell pwsh rm rmdir sh umount zsh".split(" "),
);
// 包装词自身会吞掉取值的旗标集合。
const CARRIER_VALUE_FLAGS: Readonly<Record<string, ReadonlySet<string>>> = {
  command: new Set(),
  env: new Set("-C -S -u --argv0 --chdir --split-string --unset".split(" ")),
  nohup: new Set(),
  sudo: new Set(
    (
      "-C -D -R -T -a -c -g -h -p -r -t -u --askpass --chdir --chroot --close-from --group --host " +
      "--prompt --role --type --user"
    ).split(" "),
  ),
  time: new Set("-f -o --format --output".split(" ")),
};
const CARRIER_FLAG_OPTIONS = new Set("-p -v -V --ignore-environment".split(" "));
// 脚本运行器的「运行某脚本」动作位（如 npm run、bun run、deno task）。
const RUNNER_STAGES: Readonly<Record<string, ReadonlySet<string>>> = {
  bun: new Set(["run"]),
  deno: new Set(["task"]),
  npm: new Set("run run-script".split(" ")),
  pnpm: new Set(["run"]),
  yarn: new Set(["run"]),
};
const TARGET_BUILDERS = new Set("just make".split(" "));
const INTERPRETER_LAUNCHERS = new Set("python python3 py".split(" "));
// 命令族的动作深度覆盖：这些族的稳定动作是「首词 + N-1 个后续词」。
const FAMILY_STAGE_DEPTHS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  aws: { "*": 2 },
  az: { "*": 2 },
  docker: { compose: 2 },
  gcloud: { "*": 3 },
  kubectl: { config: 2 },
};

export function foldActionHead(invocation: BashCommandInvocation): string | undefined {
  const staticPrefix = literalBindingTokens(invocation);
  if (!staticPrefix || invocation.argv.length === 0) return undefined;
  const peeled = peelCarriers(invocation.argv);
  if (!peeled) return undefined;
  const root = executableTail(peeled.executable);
  if (UNFOLDABLE_ROOTS.has(root)) return undefined;

  const head = [...staticPrefix, ...peeled.carriers, peeled.executable];
  const operands = invocation.argv.slice(peeled.argsStart);

  const directStage = stageWordsFor(root, operands);
  if (directStage) return serializeHead([...head, ...directStage]);

  const registryStage = BASH_COMMAND_REGISTRY[root];
  if (!registryStage) return undefined;
  const skippedStage = stageWordsFor(root, dropLeadingFlags(registryStage, operands));
  if (skippedStage) return serializeHead([...head, ...skippedStage]);

  return descendForStage(registryStage, head, operands);
}

const STATIC_BINDING_SHAPE = /^[A-Za-z_][A-Za-z0-9_]*=[A-Za-z0-9_./:@,+-]*$/u;

// 环境赋值只有「静态标识符 = 静态字面量」才可进入规则主体。
export function literalBindingTokens(invocation: BashCommandInvocation): string[] | undefined {
  const tokens: string[] = [];
  for (const binding of invocation.envAssignments) {
    if (!binding.name || binding.value === undefined) return undefined;
    const token = `${binding.name}=${binding.value}`;
    if (!STATIC_BINDING_SHAPE.test(token)) return undefined;
    tokens.push(token);
  }
  return tokens;
}

interface PeeledInvocation {
  executable: string;
  argsStart: number;
  carriers: string[];
}

function peelCarriers(argv: readonly string[]): PeeledInvocation | undefined {
  const carriers: string[] = [];
  let cursor = 0;
  let layers = 0;
  while (cursor < argv.length) {
    const token = argv[cursor]!;
    const tool = executableTail(token);
    const valueFlags = CARRIER_VALUE_FLAGS[tool];
    if (!valueFlags) return { executable: token, argsStart: cursor + 1, carriers };
    layers += 1;
    if (layers > MAX_WRAPPER_LAYERS) return undefined;
    carriers.push(token);
    cursor = skipCarrierFlags(argv, cursor + 1, tool, valueFlags, carriers);
  }
  return undefined;
}

// 包装词自己的旗标段：env 允许内联静态赋值；带值旗标吞取值；其余旗标跳过。
function skipCarrierFlags(
  argv: readonly string[],
  start: number,
  tool: string,
  valueFlags: ReadonlySet<string>,
  carriers: string[],
): number {
  let cursor = start;
  while (cursor < argv.length) {
    const token = argv[cursor]!;
    if (tool === "env" && STATIC_BINDING_SHAPE.test(token)) {
      carriers.push(token);
      cursor += 1;
      continue;
    }
    const option = token.includes("=") ? token.slice(0, token.indexOf("=")) : token;
    if (valueFlags.has(option)) {
      cursor += token.includes("=") ? 1 : 2;
      continue;
    }
    if (CARRIER_FLAG_OPTIONS.has(option) || token.startsWith("-")) {
      cursor += 1;
      continue;
    }
    break;
  }
  return cursor;
}

// 深度覆盖：python -m 模块、脚本运行器动作、make/just 目标、命令族的多词动作。
function stageWordsFor(root: string, operands: readonly string[]): string[] | undefined {
  if (INTERPRETER_LAUNCHERS.has(root) && operands[0] === "-m" && saneStageWord(operands[1])) {
    return [operands[0]!, operands[1]!];
  }
  const runnerStage = RUNNER_STAGES[root];
  if (runnerStage?.has(operands[0] ?? "") && saneStageWord(operands[1])) {
    return [operands[0]!, operands[1]!];
  }
  if (TARGET_BUILDERS.has(root) && saneStageWord(operands[0])) {
    return [operands[0]!];
  }
  const familyDepths = FAMILY_STAGE_DEPTHS[root];
  const depth = familyDepths?.[operands[0] ?? ""] ?? familyDepths?.["*"];
  if (depth !== undefined && operands.length >= depth) {
    const stage = operands.slice(0, depth);
    if (stage.every(saneStageWord)) return stage;
  }
  return undefined;
}

// 沿注册表下钻：跳过已知旗标 → 匹配子命令词 → 命令/模块参数位收尾。
function descendForStage(
  node: BashCommandRegistryNode,
  head: readonly string[],
  operands: readonly string[],
): string | undefined {
  const carried: string[] = [...head];
  let stage = node;
  let cursor = 0;
  let stageSeen = false;
  while (cursor < operands.length) {
    const afterFlags = skipFlagAt(stage, operands, cursor);
    if (afterFlags !== undefined) {
      cursor = afterFlags;
      continue;
    }
    const token = operands[cursor]!;
    const child = findChildStage(stage, token);
    if (child) {
      carried.push(token);
      stageSeen = true;
      stage = child;
      cursor += 1;
      continue;
    }
    const acceptsOperand = (stage[2] & (ARG_TAKES_COMMAND | ARG_TAKES_MODULE)) !== 0;
    if (acceptsOperand && !looksLikePathOrUrl(token)) {
      carried.push(token);
      stageSeen = true;
    }
    break;
  }
  return stageSeen ? serializeHead(carried) : undefined;
}

function findChildStage(
  node: BashCommandRegistryNode,
  token: string,
): BashCommandRegistryNode | undefined {
  for (const entry of node[3]) {
    if (entry[0].includes(token)) return entry;
  }
  return undefined;
}

function dropLeadingFlags(
  node: BashCommandRegistryNode,
  operands: readonly string[],
): readonly string[] {
  let cursor = 0;
  while (cursor < operands.length) {
    const advanced = skipFlagAt(node, operands, cursor);
    if (advanced === undefined) break;
    cursor = advanced;
  }
  return operands.slice(cursor);
}

function skipFlagAt(
  node: BashCommandRegistryNode,
  operands: readonly string[],
  cursor: number,
): number | undefined {
  const token = operands[cursor]!;
  if (!token.startsWith("-") || token === "-") return undefined;
  if (token === "--") return cursor + 1;
  const optionName = token.includes("=") ? token.slice(0, token.indexOf("=")) : token;
  const option = findKnownFlag(node, optionName);
  if (!option) return undefined;
  const eatsOperand = option[1] === 1 && !token.includes("=");
  return cursor + (eatsOperand ? 2 : 1);
}

function findKnownFlag(
  node: BashCommandRegistryNode,
  optionName: string,
): BashCommandRegistryNode[1][number] | undefined {
  for (const entry of node[1]) {
    if (entry[0].includes(optionName)) return entry;
  }
  return undefined;
}

function saneStageWord(token: string | undefined): token is string {
  if (!token) return false;
  if (token.startsWith("-")) return false;
  if (/\s/.test(token)) return false;
  return !looksLikePathOrUrl(token);
}

function looksLikePathOrUrl(token: string): boolean {
  if (token.includes("://")) return true;
  if (token.startsWith("./") || token.startsWith("../") || token.startsWith("/")) return true;
  if (token.startsWith("~")) return true;
  return /^[A-Za-z]:[\\/]/u.test(token);
}

// 折叠出的前缀至少要「可执行文件 + 一个动作词」，且每个词都不得含空白。
function serializeHead(tokens: readonly string[]): string | undefined {
  const unusable =
    tokens.length < 2 || tokens.some((token) => token.length === 0 || /\s/.test(token));
  if (unusable) return undefined;
  return tokens.join(" ");
}

function executableTail(token: string): string {
  const unified = token.replaceAll("\\", "/");
  return unified.slice(unified.lastIndexOf("/") + 1).toLowerCase();
}
