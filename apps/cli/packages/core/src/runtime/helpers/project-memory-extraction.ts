// SPDX-License-Identifier: Apache-2.0
// 项目记忆抽取调度的兼容面（B46）：实现见 ./memory/extraction-scheduling.js。
import * as extraction from "./memory/extraction-scheduling.js";

export type ProjectMemoryExtractionScheduler = extraction.ProjectMemoryExtractionScheduler;
export const isProjectMemoryEnabled = extraction.isProjectMemoryEnabled;
export const scheduleProjectMemoryExtraction = extraction.scheduleProjectMemoryExtraction;
export const drainMemoryExtractions = extraction.drainMemoryExtractions;
