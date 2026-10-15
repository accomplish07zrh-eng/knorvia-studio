// SPDX-License-Identifier: Apache-2.0
// App 持有的 workspace 展示分类（不参与 workspace identity）。
const PURPOSE_TABLE = { project: "project", conversation: "conversation" } as const;
export type WorkspacePurpose = (typeof PURPOSE_TABLE)[keyof typeof PURPOSE_TABLE];
