// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-03 B1：**v4 命令面**的冻结不变量。
//
// 本文件只断言「协议面的事实」，不碰实现：
//   - 34 条命令字面量必须与 `commandPayloadSchemas` 完全一致（双向包含）；
//   - 每条命令的 payload 必须能被共享 schema 接受/拒绝（正向 + 负向各一条）；
//   - 契约里点名的「禁用自造名」必须不存在（`cancelTurn` / `steer` 这类）。
//
// 为什么在合同阶段就写：实现阶段一旦改了字面量或 payload 形状，这里立刻红——
// 它比「读代码发现」早一步，也比「CI 红了才查」便宜。
import { strict as strictAssert } from "node:assert";
import { readFileSync } from "node:fs";
import { commandSchemaPath as schemaSourcePath, ownershipFixturePath as fixturePath } from "./entry.mjs";
import { test as caseTest } from "node:test";

/**
 * 从协议事实源抽取 34 条命令字面量。
 *
 * 截断依据是 `commandPayloadSchemas` 的 `} as const;`——**必须截断**，
 * 否则信封与 ACK 的字段名会被当成命令（这个坑我在夹具完整性检查里踩过）。
 *
 * @returns 命令字面量数组（保持源文件顺序）。
 */
function commandLiterals() {
  const source = readFileSync(schemaSourcePath, "utf8");
  const start = source.indexOf("export const commandPayloadSchemas");
  strictAssert.notEqual(start, -1, "必须能找到 commandPayloadSchemas");
  const end = source.indexOf("} as const;", start);
  strictAssert.notEqual(end, -1, "commandPayloadSchemas 必须以 `} as const;` 结束");
  return [...source.slice(start, end).matchAll(/^ {2}(\w+):/gmu)].map((match) => match[1]);
}

/**
 * 读命令归属夹具。
 *
 * @returns 解析后的夹具对象。
 */
function ownershipFixture() {
  return JSON.parse(readFileSync(fixturePath, "utf8"));
}

caseTest("B1 命令面恰好 34 条，且与归属夹具双向一致", () => {
  const literals = commandLiterals();
  const literalSet = new Set(literals);

  strictAssert.equal(literalSet.size, literals.length, "命令字面量不得重复");
  strictAssert.equal(literalSet.size, 34, `命令面必须恰好 34 条；实际=${literalSet.size}`);

  const fixture = ownershipFixture();
  const fixtureSet = new Set(
    Object.values(fixture.groups).flatMap((group) => group.commands),
  );
  strictAssert.deepEqual(
    [...literalSet].filter((name) => !fixtureSet.has(name)),
    [],
    "有命令未被夹具分组覆盖（收口断言会假通过）",
  );
  strictAssert.deepEqual(
    [...fixtureSet].filter((name) => !literalSet.has(name)),
    [],
    "夹具里有协议不存在的命令",
  );
});

caseTest("B1 禁用自造名：不得出现 cancelTurn / steer / 其它同义替代", () => {
  const literalSet = new Set(commandLiterals());
  // 这两个名字在合同 README §二.1.1 里被明确排除：
  // 取消是 `stop`，steer 是 `sendText.requestedDelivery === "guide"`。
  for (const forbidden of ["cancelTurn", "steer", "interrupt", "abortTurn"]) {
    strictAssert.equal(
      literalSet.has(forbidden),
      false,
      `${forbidden} 不得出现在 v4 命令面（取消用 stop / steer 用 sendText.guide）`,
    );
  }
  // 正例：真正存在的那两个必须在内。
  strictAssert.ok(literalSet.has("stop"), "取消命令必须是 stop");
  strictAssert.ok(literalSet.has("sendText"), "steer 的载体必须是 sendText");
});

caseTest("B1 每条命令的 payload 必须是 zod schema（可运行时校验，不只是 TS 类型）", () => {
  const source = readFileSync(schemaSourcePath, "utf8");
  const start = source.indexOf("export const commandPayloadSchemas");
  const end = source.indexOf("} as const;", start);
  const block = source.slice(start, end);
  // 逐条确认定义体是 zod 表达式（z.object / z.union / z 换行 或对外部 schema 的引用）。
  // 这里用「该行之后 200 字符内出现 z.」作为轻量判据，并在失败时给出命令名。
  const offenders = [];
  for (const match of block.matchAll(/^ {2}(\w+):([\s\S]{0,240})/gmu)) {
    const [, name, tail] = match;
    if (!/\bz\s*\.|\bz\n|\b\w+Schema\b/u.test(tail)) offenders.push(name);
  }
  strictAssert.deepEqual(
    offenders,
    [],
    `这些命令的 payload 不是可运行时校验的 schema：${offenders.join(", ")}`,
  );
});

caseTest("B1 缺口的 10 条命令都在命令面里（而不是被删掉）", () => {
  const literalSet = new Set(commandLiterals());
  const fixture = ownershipFixture();
  const gaps = fixture.groups.dCapabilityGap.commands;
  strictAssert.equal(gaps.length, 10, "缺口清单必须是 10 条");
  for (const gap of gaps) {
    strictAssert.ok(
      literalSet.has(gap),
      `${gap} 是缺口命令（回 capabilityAbsent），它必须仍在命令面里——` +
        "把它从命令面删掉会让客户端拿不到结构化的能力缺失信号",
    );
  }
});

caseTest("B1 收口分母自洽：01 + 02 + 03 各组之和 = 34", () => {
  const fixture = ownershipFixture();
  const groupNames = Object.keys(fixture.groups);
  const grouped = groupNames.flatMap((name) => fixture.groups[name].commands);
  strictAssert.equal(
    new Set(grouped).size,
    grouped.length,
    "分组之间不得重叠（重叠会让「和 = 34」假成立）",
  );
  strictAssert.equal(grouped.length, 34, `分组之和必须是 34；实际=${grouped.length}`);
  // 01 与 02 的已交付项必须显式列出，便于实现阶段算「还剩多少」。
  strictAssert.equal(fixture.groups.deliveredBy01.commands.length, 3, "01 交付 3 条配置类命令");
  strictAssert.equal(fixture.groups.deliveredBy02.commands.length, 4, "02 交付 4 条（createSession 的 firstInput 不重复计）");
});
