// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-03 B25 的前置：**夹具自身必须完整**，否则收口断言会假通过。
//
// 为什么需要这个文件：B25 是「遍历 34 条命令，逐条断言非 unsupported」。
// 如果夹具（命令归属账本）漏了一条或重复一条，B25 会**通过**——因为那条命令根本没被遍历到。
// 这是「遍历式断言」的假通过风险，必须用**对源头比对**来防御，而不是对分组求和自证。
//
// 因此本文件的终极断言是：夹具里的命令集合 **与 commandPayloadSchemas 的键集合完全一致**
// （双向包含），并额外校验分组之间无重叠、legacy 端口方法数与该表一致。
import { strict as strictAssert } from "node:assert";
import { readFileSync } from "node:fs";
import {
  commandSchemaPath as schemaPath,
  legacyMethodTablePath as legacyTablePath,
  ownershipFixturePath as fixturePath,
} from "./entry.mjs";
import { test as caseTest } from "node:test";

/**
 * 读夹具。
 *
 * @returns 解析后的命令归属账本。
 */
function loadFixture() {
  return JSON.parse(readFileSync(fixturePath, "utf8"));
}

/**
 * 从协议事实源抽取命令字面量集合。
 *
 * 只扫 `commandPayloadSchemas` 那一个对象体，并按它的 `} as const;` 截断——否则会把
 * 信封字段（`commandId`/`clientId`/`sessionId`…）与 ACK 形状字段（`status`/`reasonCode`…）
 * 也算成命令。**这个坑我在第一版真的踩到了**（报出 12 个「漏掉的命令」全是字段名）。
 *
 * @returns 命令字面量集合。
 */
function loadSchemaCommandNames() {
  const source = readFileSync(schemaPath, "utf8");
  const start = source.indexOf("export const commandPayloadSchemas");
  strictAssert.notEqual(start, -1, "必须能在 command.ts 里找到 commandPayloadSchemas");
  const body = source.slice(start);
  const end = body.indexOf("} as const;");
  strictAssert.notEqual(end, -1, "commandPayloadSchemas 必须以 `} as const;` 结束");
  const block = body.slice(0, end);
  const names = new Set();
  for (const match of block.matchAll(/^ {2}(\w+):/gmu)) {
    names.add(match[1]);
  }
  return names;
}

/**
 * `knorviaProtocolMethods` 标识符 → 旧协议方法名的显式映射。
 *
 * 为什么不用「驼峰转斜杠」的机械规则：`sessionCancelBackgroundTask` 会变成
 * `session/cancel/background/task`（错），`sessionSetModel` 会变成 `session/set/model`（错）。
 * **这个坑我也踩到了**，所以改成显式映射表；表里没有的标识符会让测试**立刻失败**并提示补表。
 */
const PROTOCOL_METHOD_NAMES = new Map([
  ["sessionResume", "session/resume"],
  ["sessionSubscribe", "session/subscribe"],
  ["sessionSend", "session/send"],
  ["sessionStop", "session/stop"],
  ["sessionCancelBackgroundTask", "session/cancelBackgroundTask"],
  ["sessionFork", "session/fork"],
  ["sessionCompact", "session/compact"],
  ["sessionGoal", "session/goal"],
  ["sessionSetModel", "session/setModel"],
  ["sessionSetThoughtLevel", "session/setThoughtLevel"],
  ["sessionSetMode", "session/setMode"],
  ["sessionClose", "session/close"],
]);

/**
 * 从 legacy 方法表抽取端口方法集合。
 *
 * @returns 端口方法集合（形如 `session/send`）。
 */
function loadLegacyPortMethods() {
  const source = readFileSync(legacyTablePath, "utf8");
  const start = source.indexOf("PORT_BACKED_METHODS");
  strictAssert.notEqual(start, -1, "必须能在 method-table.ts 里找到 PORT_BACKED_METHODS");
  const end = source.indexOf("]);", start);
  const block = source.slice(start, end);
  const names = new Set();
  for (const match of block.matchAll(/knorviaProtocolMethods\.(\w+)/gu)) {
    const mapped = PROTOCOL_METHOD_NAMES.get(match[1]);
    strictAssert.notEqual(
      mapped,
      undefined,
      `方法表里出现未登记的标识符 ${match[1]}——请加进 PROTOCOL_METHOD_NAMES，不要靠驼峰猜路径`,
    );
    names.add(mapped);
  }
  return names;
}

caseTest("夹具的命令集合与 commandPayloadSchemas **完全一致**（双向包含，防漏防重）", () => {
  const fixture = loadFixture();
  const grouped = Object.values(fixture.groups).flatMap((group) => group.commands);
  const fixtureSet = new Set(grouped);
  const schemaSet = loadSchemaCommandNames();

  // 分组内部不得有重复（重复会让「求和=34」假成立）。
  strictAssert.equal(
    fixtureSet.size,
    grouped.length,
    `夹具里存在重复命令；分组求和会假通过。重复项：${grouped.length - fixtureSet.size} 个`,
  );

  const missingFromFixture = [...schemaSet].filter((name) => !fixtureSet.has(name));
  strictAssert.deepEqual(
    missingFromFixture,
    [],
    `夹具漏了协议里的命令，B25 收口断言会假通过：${missingFromFixture.join(", ")}`,
  );

  const extraInFixture = [...fixtureSet].filter((name) => !schemaSet.has(name));
  strictAssert.deepEqual(
    extraInFixture,
    [],
    `夹具里有多余命令（协议里没有）：${extraInFixture.join(", ")}`,
  );

  strictAssert.equal(
    fixtureSet.size,
    schemaSet.size,
    `夹具命令数与协议命令数必须相等；fixture=${fixtureSet.size} schema=${schemaSet.size}`,
  );
  // 与 fixture 自己声明的总数对齐（三重校验：分组和 = 去重后 = 声明值）。
  strictAssert.equal(fixtureSet.size, fixture.totalCommands, "去重后的命令数必须等于声明的 34");
});

caseTest("legacy 端口方法数与 PORT_BACKED_METHODS **完全一致**（12 个，含 session/close）", () => {
  const fixture = loadFixture();
  const declared = fixture.legacyPortMethods;
  const fromFixture = [...declared.deliveredBy02, ...declared.toDeliverBy03];
  const fixtureSet = new Set(fromFixture);

  strictAssert.equal(
    fixtureSet.size,
    fromFixture.length,
    "legacy 方法清单里不得有重复（重复会让 4+8=12 假成立）",
  );
  strictAssert.equal(
    fixtureSet.size,
    declared.total,
    `legacy 方法数与声明值不符；实际=${fixtureSet.size} 声明=${declared.total}`,
  );

  const fromSource = loadLegacyPortMethods();
  const missing = [...fromSource].filter((method) => !fixtureSet.has(method));
  strictAssert.deepEqual(
    missing,
    [],
    `夹具漏了端口方法（人工清单已两次漏掉 session/close）：${missing.join(", ")}`,
  );

  // session/close 必须显式在 03 的待交付清单里——它是最容易被漏掉的那一个。
  strictAssert.ok(
    declared.toDeliverBy03.includes("session/close"),
    "session/close 必须在 03 的待交付清单里（legacy 无 handler、02 未交付）",
  );
});

caseTest("缺口命令集合与已知的 10 条一致（不多不少）", () => {
  const fixture = loadFixture();
  const gap = new Set(fixture.groups.dCapabilityGap.commands);
  strictAssert.equal(gap.size, 10, `缺口命令必须是 10 条；实际=${gap.size}`);
  // 四条容易漏的必须在内。
  for (const required of [
    "applyFileRewind",
    "discardSharedContext",
    "resumeWorkflowRun",
    "snoozeInteractionAutoResolution",
  ]) {
    strictAssert.ok(gap.has(required), `${required} 必须在缺口清单里`);
  }
  // 缺口命令不得同时出现在可实现分组里（双重归属会让 B25 的期望自相矛盾）。
  const executable = Object.values(fixture.groups)
    .filter((group) => group !== fixture.groups.dCapabilityGap)
    .flatMap((group) => group.commands);
  const overlap = executable.filter((name) => gap.has(name));
  strictAssert.deepEqual(overlap, [], `命令不得同时属于缺口与可实现分组：${overlap.join(", ")}`);
});

caseTest("夹具声明的不变量与实际分组一致", () => {
  const fixture = loadFixture();
  const invariants = fixture.invariants;
  for (const key of ["noUnsupported", "portTableSize", "queuePositionAuthority", "noFakeSuccess", "entryUntouched"]) {
    strictAssert.equal(
      typeof invariants[key],
      "string",
      `不变量 ${key} 必须在夹具里写明（它是 B 条目的判据来源）`,
    );
  }
  // 缺口的期望 reasonCode 必须与合同冻结值一致。
  strictAssert.equal(
    fixture.groups.dCapabilityGap.expectedReasonCode,
    "fault.command.capabilityAbsent",
    "缺口的 reasonCode 必须是合同冻结的 fault.command.capabilityAbsent",
  );
});
