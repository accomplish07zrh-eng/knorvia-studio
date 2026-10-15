// SPDX-License-Identifier: Apache-2.0
// Session 首次创建的入口来源：任务分组、项目页或普通会话。
const CREATE_SOURCE_TABLE = { group: "group", project: "project", session: "session" } as const;
export type SessionCreateSource = (typeof CREATE_SOURCE_TABLE)[keyof typeof CREATE_SOURCE_TABLE];
