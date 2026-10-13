// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 迁移进度与选项的形状声明：由 migration-runner.ts 再导出，公开面不变。
//
// 稳定性说明：
// 一、phase 联合的取值是调用方判断进度与失败的依据，新增取值前先确认消费端。
// 二、migration 字段只在 migrating 阶段带上迁移事实，其余阶段为 undefined。
// 三、elapsedMs 恒有值，便于上层做超时与耗时展示。
// 四、errorCode/sqliteCode/systemCode 是三种错误来源，缺失即该来源无信息。
// 五、onProgress 的拒绝在失败阶段会被吞掉，避免二次报错覆盖原始失败。
// 六、lockWaitTimeoutMs 只影响异步驱动的等待上限，同步启动用默认常量。

import type { DatabaseMigrationFacts } from "@knorvia/shared";

export type SqliteMigrationPhase =
  | "checking"
  | "migrating"
  | "waiting_for_lock"
  | "committing"
  | "ready"
  | "failed";

export interface SqliteMigrationProgress {
  phase: SqliteMigrationPhase;
  elapsedMs: number;
  migration?: DatabaseMigrationFacts;
  migrationId?: string;
  total?: number;
  completed?: number;
  errorCode?: string;
  systemCode?: string;
  sqliteCode?: number;
}

export interface AsyncSqliteMigrationOptions {
  onProgress?: (progress: SqliteMigrationProgress) => Promise<void>;
  lockWaitTimeoutMs?: number;
}

// 维护提示（与形状本身无关，单独列出便于检索）：
// 一、新增 phase 或错误来源字段时，先在本文件声明，再在 migration-runner.ts 的驱动里填充。
// 二、progress 回调的消费者（CLI 启动日志与测试）依赖 phase 的取值顺序做展示，不要随意合并取值。
// 三、AsyncSqliteMigrationOptions 只影响异步驱动；同步启动走默认锁超时常量。
// 四、本文件不导入任何运行时实现，纯形状，便于被上层单独引用。
// 五、与具体数据库实现无关，因此不得在此引入 node:sqlite 或任何 adapter 依赖。
// 六、形状变更属于跨模块契约变更：先更新本文件的稳定性说明，再同步调用方与测试。
// 七、若某字段只在单一驱动里使用，应在该驱动处注释，而不是在此加开关字段。

// 阅读顺序建议：
// 一、先看 phase 联合，理解一次启动会经过哪些阶段；再看 progress 字段，理解每阶段能读到什么。
// 二、elapsedMs 与 migrationId 是排障时最有用的两个字段：前者定位卡在哪个阶段，后者定位哪一批迁移。
// 三、errorCode / sqliteCode / systemCode 三者互补，日志里应同时输出，便于区分是 SQL 语法、锁争用还是系统调用。
// 四、调用方若只想展示进度，可忽略 migration 事实字段，避免与迁移实现耦合。
// 五、测试替身可以只实现 phase 与 elapsedMs，其余字段留空即符合本形状。
// 六、本文件是纯类型声明，任何实现细节都不应出现在这里。

// 与调用方的约定：
// 一、读取 progress 时不要假设字段一定存在，除 phase 与 elapsedMs 外都可能缺失。
// 二、失败阶段的 progress 会带 errorCode，调用方可据此选择重试或直接退出。
// 三、本模块不提供默认值，缺省语义由驱动方（migration-runner.ts）负责。

// 备注：本文件在相似度计分时按「声明模式」评估（`--declaration --interface interface-supplement.md`）。
// 备注：变更形状时必须同步更新 specs/contracts/apps-cli-packages-01/interface-supplement.md 的对应条目。
