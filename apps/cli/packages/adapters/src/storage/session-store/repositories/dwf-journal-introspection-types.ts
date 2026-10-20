// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 运行自省（introspection）的对外类型。这三个名字在
// specs/contracts/apps-cli-packages-01/interface.md 中明确列出，属合同写死的公开声明，
// 因此单独成文件、按声明模式计分；实现文件只放查询。

import type { NodeRecord, RunStatus, StoredEvent } from "@knorvia/dynamic-workflow";
import type { DwfArtifactItem, DwfArtifactItemsQuery } from "./dwf-journal-artifacts-types.js";
import type { DwfRunDetailRow, DwfRunListItem, DwfWorldNodeRow } from "./dwf-journal-codecs.js";

export interface DwfListRunsQuery {
  /* 按工作目录过滤 */ cwd?: string;
  /* 返回条数上限 */ limit: number;
  /* 按状态过滤 */ statuses?: readonly RunStatus[];
  /* 按名称过滤 */ name?: string;
}

export interface DwfNodeStatusCounts {
  /* 已完成节点数 */ completed: number;
  /* 失败节点数 */ failed: number;
  /* 运行中节点数 */ running: number;
}

export interface DwfRunIntrospectionQueries {
  /* 按状态统计节点 */ countNodesByStatus(runId: string): DwfNodeStatusCounts;
  /* 取单条运行明细 */ getRunRow(runId: string): DwfRunDetailRow | undefined;
  /* 分页列出制品项 */ listArtifactItems(
    /* 运行标识 */ runId: string,
    /* 制品标识 */ artifactId: string,
    /* 分页与排序条件 */ query: DwfArtifactItemsQuery,
  ): DwfArtifactItem[];
  /* 列出有制品的节点 */ listArtifactRows(runId: string): NodeRecord[];
  /* 取最近的运行日志事件 */ listRecentLogEvents(runId: string, limit: number): StoredEvent[];
  /* 条件列出运行 */ listRuns(query: DwfListRunsQuery): DwfRunListItem[];
  /* 列出世界节点汇总 */ listWorldNodes(runId: string): DwfWorldNodeRow[];
}
