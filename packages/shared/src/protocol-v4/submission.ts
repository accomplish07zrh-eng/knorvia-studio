// SPDX-License-Identifier: Apache-2.0
// 提交模式词表：Composer 可以显式提交给 Agent 的模式。`auto` 是 Runtime 的内部状态，
// 不进入用户提交，因此不在这个枚举里（B20）。
import { z } from "zod";

export const submissionModeSchema = z.enum(["build", "edit", "plan", "yolo"]);
export type SubmissionMode = z.infer<typeof submissionModeSchema>;
