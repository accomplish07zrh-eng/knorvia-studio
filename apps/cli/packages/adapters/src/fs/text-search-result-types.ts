// SPDX-License-Identifier: Apache-2.0
// 搜索结果的内部形状：分页结果与 ripgrep --json 事件。
import type { FileSystemSearchTextRequest } from "@knorvia/contracts";

/** 分页结果：items 已裁剪，truncated 表示还有更多未返回。 */
export interface Page {
  appliedLimit: number | undefined;
  appliedOffset: number | undefined;
  items: unknown[];
  truncated: boolean;
}

export interface PageInput<T> {
  items: T[];
  request: FileSystemSearchTextRequest;
}

/** ripgrep --json 的事件载荷：字段名即上游协议，不能改名。 */
export interface JsonEvent {
  type?: string;
  data?: {
    path?: { text?: string };
    lines?: { text?: string };
    line_number?: number;
    submatches?: { match?: { text?: string } }[];
  };
}
