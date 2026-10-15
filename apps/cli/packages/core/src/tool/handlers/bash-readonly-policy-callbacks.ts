// SPDX-License-Identifier: Apache-2.0
// 兼容面：非 git 命令族的危险性复核实现已按各命令公开文档重组于
// bash-rules/danger-checks.ts；git 命令族的复核在 bash-rules/git-danger-checks.ts，
// 经下方 git 子模块继续再导出，导出面保持不变。
export {
  XARGS_TARGET_COMMANDS,
  dateCommandIsDangerous,
  dockerCommandIsDangerous,
  ghCommandIsDangerous,
  hasDangerousDockerOption,
  isSedInPlaceOption,
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
} from "./bash-rules/danger-checks.js";

export * from "./bash-readonly-policy-git-callbacks.js";
