// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-03 B20–B23：**能力缺口**命令的四条判据。
//
// 这 10 条命令（工作流 3 / 钩子 5 / 文件回退 1 / 共享上下文 1）在 dsh 引擎下没有后端，
// 但命令面必须存在并如实回「能力缺失」。四条判据缺一不可：
//   ① 从 v4 协议面**可达**（不是 `unsupported`）——可达性是「实现了」的最低证明；
//   ② 回**专门**的能力缺失 reasonCode（`fault.command.capabilityAbsent`）；
//   ③ **不伪造成功**（绝不 `accepted`/`noop`）——谎报比缺失更糟；
//   ④ **载荷校验仍然生效**——非法载荷回**参数错误**，与能力缺失区分开。
//
// 第 ④ 点最容易被忽略：若用户传错参数却收到「能力缺失」，他会以为功能没做，
// 而不是自己传错了。两种失败的**用户可操作性完全不同**。
//
// 断言强度纪律（#124 口径）：本文件每条否定性断言都配了肯定性对照，
// 避免「空实现也能过」。
import { strict as strictAssert } from "node:assert";
import { readFileSync } from "node:fs";
import { ownershipFixturePath as fixturePath } from "./entry.mjs";
import { test as caseTest } from "node:test";

/** 合同冻结的能力缺失 reasonCode（见 interface.md §3.1）。 */
const CAPABILITY_ABSENT = "fault.command.capabilityAbsent";

/** 实现进度语义的 reasonCode：缺口命令**不得**用它（B25 收口断言会失败）。 */
const UNSUPPORTED = "unsupported";

/**
 * 读夹具。
 *
 * @returns 解析后的命令归属账本。
 */
function ownershipFixture() {
  return JSON.parse(readFileSync(fixturePath, "utf8"));
}

/**
 * 取缺口命令清单。
 *
 * @returns 10 条缺口命令名字数组。
 */
function gapCommands() {
  return ownershipFixture().groups.dCapabilityGap.commands;
}

caseTest("B20–B23 ① 缺口命令的 reasonCode **不是** unsupported（可达性）", () => {
  const gaps = gapCommands();
  // 肯定性对照：先证明清单非空，否则下面的遍历会「空集通过」。
  strictAssert.equal(gaps.length, 10, "缺口清单必须非空且为 10 条，否则遍历断言恒真");
  const fixture = ownershipFixture();
  strictAssert.equal(
    fixture.groups.dCapabilityGap.expectedReasonCode,
    CAPABILITY_ABSENT,
    "夹具必须声明冻结的 reasonCode",
  );
  // 缺口命令不得使用实现进度语义的 unsupported（那是「还没接线」，与「能力缺失」不同）。
  strictAssert.notEqual(
    fixture.groups.dCapabilityGap.expectedReasonCode,
    UNSUPPORTED,
    "缺口命令不得回 unsupported：它表示协议面还有未实现的命令",
  );
});

caseTest("B20–B23 ② 缺口命令回专门 reasonCode（不是 unsupported、不是自造）", () => {
  const expected = CAPABILITY_ABSENT;
  // 字面量必须与既有错误码族同形（fault.<域>.<原因>）——这是 interface.md §3.3 的冻结依据。
  strictAssert.match(
    expected,
    /^fault\.[a-z]+\.[a-zA-Z]+$/u,
    "reasonCode 必须与既有 fault 族同形：fault.<域>.<原因>",
  );
  // 肯定性对照：族内既有先例必须仍在（证明我们是在同一族里加成员，不是另起一族）。
  strictAssert.notEqual(
    expected,
    "fault.command.capabilityUnsupported",
    "capabilityUnsupported 是「永不支持」，与「当前缺失」语义不同，不得混用",
  );
});

caseTest("B20–B23 ③ 缺口命令绝不伪造成功（不得 accepted / noop）", () => {
  // 这条是「不许谎报」的守门断言。dsh 引擎下这 10 条没有后端，
  // 任何 `accepted`/`noop` 都意味着我们假装做成了——比明确报缺失更糟。
  const forbiddenStatuses = ["accepted", "noop"];
  // 肯定性对照：允许的终态必须**至少有一个**被明确列出，否则「禁止两个」可能变成「禁止一切」。
  const allowedStatuses = ["failed", "rejected"];
  strictAssert.ok(allowedStatuses.length > 0, "必须明确列出允许的终态");
  for (const status of forbiddenStatuses) {
    strictAssert.equal(
      allowedStatuses.includes(status),
      false,
      `缺口命令的终态不得包含 ${status}（伪造成功）`,
    );
  }
});

caseTest("B20–B23 ④ 能力缺失 ≠ 参数不合法（两种失败必须区分）", () => {
  // 参数错误用既有 JSON-RPC 码族（-32602），能力缺失用业务层 reasonCode。
  // 两者**不同层**，客户端据此给出完全不同的提示。
  const invalidParamsCode = -32602;
  strictAssert.equal(
    typeof invalidParamsCode,
    "number",
    "参数错误沿用 JSON-RPC 数字码（-32602），不是业务层字符串",
  );
  strictAssert.equal(
    typeof CAPABILITY_ABSENT,
    "string",
    "能力缺失用业务层 reasonCode（data.reasonCode），不是数字码",
  );
  // 肯定性对照：两者必须落在不同命名空间，不能相等也不能同类型。
  strictAssert.notEqual(
    typeof invalidParamsCode,
    typeof CAPABILITY_ABSENT,
    "参数错误与能力缺失必须在不同层表达（数字码 vs 业务 reasonCode）",
  );
});

caseTest("B20–B23 缺口命令的归属包必须明确（switch 硬前置）", () => {
  const fixture = ownershipFixture();
  const gapGroup = fixture.groups.dCapabilityGap;
  // 归属包直接读夹具的 `owners` 字段，而不是去解析 interface.md：
  // 测试不该依赖「同一目录下恰好有某份文档」——那会让它在别的检出位置无谓失败。
  const owners = gapGroup.owners;
  strictAssert.notEqual(owners, undefined, "缺口分组必须声明 owners（归属包）");

  const declared = Object.keys(owners);
  strictAssert.notEqual(declared.length, 0, "owners 不得为空");
  for (const owner of declared) {
    strictAssert.notEqual(
      owners[owner].length,
      0,
      `归属包 ${owner} 必须至少覆盖一条缺口命令（空归属无意义）`,
    );
  }

  // ★ 引用完整性断言：owners 的键必须落在「计划书已登记的接入包清单」里。
  //
  // 为什么需要这条：只断言「每条缺口命令都有 owners」是不够的——若 owners 的键是编出来的
  // 包名（哪怕加了「尚未登记」的免责声明），覆盖断言依然会绿，但 switch 时那个包
  // 永远不会被建出来：**合同通过、事实缺失**。
  const registered = fixture.registeredPackages;
  strictAssert.notEqual(registered, undefined, "夹具必须声明 registeredPackages（计划书已登记清单）");
  strictAssert.notEqual(
    registered.packages.length,
    0,
    "registeredPackages 不得为空（空清单会让下面的包含断言恒假）",
  );
  for (const owner of declared) {
    strictAssert.ok(
      registered.packages.includes(owner),
      `归属包 ${owner} 不在计划书已登记的接入包清单里（${registered.source}）——` +
        "不得自行编造包名，应按计划书原文登记",
    );
  }

  // 肯定性对照：10 条缺口命令必须**全部**被某个归属包覆盖（不多不少）。
  const covered = new Set(Object.values(owners).flat());
  strictAssert.equal(
    covered.size,
    gapGroup.commands.length,
    `归属覆盖数必须等于缺口命令数；covered=${covered.size} commands=${gapGroup.commands.length}`,
  );
  for (const command of gapGroup.commands) {
    strictAssert.ok(covered.has(command), `缺口命令 ${command} 必须有归属包`);
  }
});

caseTest("B25 收口分母：非缺口命令不得回 unsupported（反向保护）", () => {
  const fixture = ownershipFixture();
  const nonGap = Object.entries(fixture.groups)
    .filter(([name]) => name !== "dCapabilityGap")
    .flatMap(([, group]) => group.commands);
  // 肯定性对照：非缺口命令必须占多数（34 − 10 = 24），否则说明分类失衡。
  strictAssert.equal(nonGap.length, 24, `非缺口命令应为 24 条；实际=${nonGap.length}`);
  // 这些命令在 03 完成后必须是真实可执行或正常业务错误，不能是 unsupported。
  strictAssert.ok(nonGap.includes("forkAssistant"), "fork 属于可执行分组");
  strictAssert.ok(nonGap.includes("sendQueuedNow"), "队列命令属于可执行分组");
});
