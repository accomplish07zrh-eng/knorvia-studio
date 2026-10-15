// SPDX-License-Identifier: Apache-2.0
// Read 工具的文件读取状态记录：调用方用它判断「这个文件是不是被截断读过」。
// 该接口是公开协议声明（interface.md 冻结），实现方按字段语义填充即可。
export interface ReadFileState {
  path: string;
  mtime: number;
  content: string;
  offset?: number;
  limit?: number;
  isPartialView: boolean;
  readAt: Date;
}
