// SPDX-License-Identifier: Apache-2.0
// 入口文件模块的冻结形状：三个类型由合同 interface.md 逐字段锁定，运行期模块只引用它们。
// 这里的成员顺序、可选性与字面量取值都是兼容面，改动会直接反映到 public API 上。

/** 非致命状况的上报形状；目前只有「入口文件退到临时目录」这一种。 */
export interface HarnessWarning {
  kind: "entry_file_fallback";
  /** 本想写入的项目目录（`<cwd>/.knorvia-studio/workflow-runs`）。 */
  projectDir: string;
  /** 实际回落到的目录。 */
  fallbackDir: string;
  /** 项目目录写入失败的错误文本。 */
  error: string;
}

/** 落盘请求：目标项目目录、run 标识、已渲染的源码，以及可选的上报口。 */
export interface WriteChildEntryFileInput {
  cwd: string;
  runId: string;
  /** 渲染好的入口文件源码。 */
  source: string;
  onWarning?: (warning: HarnessWarning) => void;
}

/** 落盘结果：绝对路径与它落在哪一侧（项目内或临时目录）。 */
export interface ChildEntryFile {
  path: string;
  location: "project" | "tmpdir";
}
