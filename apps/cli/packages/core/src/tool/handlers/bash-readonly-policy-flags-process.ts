// SPDX-License-Identifier: Apache-2.0
// 兼容面：进程/网络/容器/测试族旗标画像（ps/pgrep/lsof/ss/netstat/man/tput/pyright/test、
// docker logs/inspect、gh 仓库旗标组）已按各命令公开手册重组于
// bash-rules/families/process-flags.ts，导出面不变。
export {
  DOCKER_INSPECT_SAFE_FLAGS,
  DOCKER_LOGS_SAFE_FLAGS,
  GH_JSON_REPO_FLAGS,
  GH_LIMIT_REPO_FLAGS,
  GH_REPO_FLAGS,
  LSOF_SAFE_FLAGS,
  MAN_SAFE_FLAGS,
  NETSTAT_SAFE_FLAGS,
  PGREP_SAFE_FLAGS,
  PS_SAFE_FLAGS,
  PYRIGHT_SAFE_FLAGS,
  SS_SAFE_FLAGS,
  TEST_SAFE_FLAGS,
  TPUT_SAFE_FLAGS,
} from "./bash-rules/families/process-flags.js";
