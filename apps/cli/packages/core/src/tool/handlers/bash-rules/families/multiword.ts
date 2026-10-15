// SPDX-License-Identifier: Apache-2.0
// 多词前缀画像（docker 与 gh auth 族）：这些命令只看第一眼无法定性，
// 必须按「命令 + 子命令」的前缀匹配画像；越界用法由危险性复核兜底。
import {
  dockerCommandIsDangerous,
  ghCommandIsDangerous,
} from "../../bash-readonly-policy-callbacks.js";
import { flagChart } from "../flag-builder.js";
import { queryEntry, type ReadonlyEntry } from "./entry-builder.js";
import { DOCKER_INSPECT_SAFE_FLAGS, DOCKER_LOGS_SAFE_FLAGS } from "./process-flags.js";

export const READONLY_MULTIWORD_POLICY_ENTRIES_CORE: readonly ReadonlyEntry[] = [
  queryEntry("docker inspect", DOCKER_INSPECT_SAFE_FLAGS, dockerCommandIsDangerous),
  queryEntry("docker logs", DOCKER_LOGS_SAFE_FLAGS, dockerCommandIsDangerous),
  queryEntry(
    "gh auth status",
    flagChart("-a --active", [
      ["-h", "string"],
      ["--hostname", "string"],
      ["--json", "string"],
    ]),
    ghCommandIsDangerous,
  ),
];
