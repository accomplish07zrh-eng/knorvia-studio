// SPDX-License-Identifier: Apache-2.0
// 计划文件写入/回读的兼容面（B22）：实现见 ./session/approved-plan-file.js。
import * as planFile from "./session/approved-plan-file.js";

export const writeApprovedPlanFile = planFile.writeApprovedPlanFile;
export const readApprovedPlanFileReferenceEntry = planFile.readApprovedPlanFileReferenceEntry;
