// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// contracts-03 内部单元测试：直接测内部实现模块（不走公开入口），覆盖表驱动判定与边界。
// 契约测试只做黑盒断言；这里补内部逻辑的可读失败点（例如表里少一项、trim 边界写错）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { loadFile } from "./entry.mjs";

const mapping = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../../../../specs/contracts/contracts-03/fixtures/query-source-mapping.json",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
);

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

test("取值表 core：三张表的键值集合与恒等映射", async () => {
  const tables = await loadFile("telemetry/model-api-tables_core");
  assert.equal(Object.keys(tables.ModelApiOperation).length, 13);
  assert.equal(Object.keys(tables.ModelApiActorKind).length, 5);
  assert.equal(Object.keys(tables.ModelFailureExceptionKind).length, 7);
  for (const [key, value] of Object.entries(tables.ModelApiOperation))
    assert.equal(tables.mapModelApiOperationToAgentOperation(value), value, key);
});

test("observation core：查表命中、trim、大小写与兜底", async () => {
  const core = await loadFile("telemetry/model-api-observation_core");
  for (const item of [...mapping.cases, ...mapping.whitespacePadded]) {
    const resolved = core.resolveQuerySourceResolution(item.querySource);
    assert.equal(resolved.operation, item.operation, item.querySource);
    assert.equal(resolved.actorKind, item.actorKind, item.querySource);
  }
  for (const source of [...mapping.defaultCases, undefined]) {
    const resolved = core.resolveQuerySourceResolution(source);
    assert.equal(resolved.operation, mapping.defaultExpectation.operation, String(source));
    assert.equal(resolved.actorKind, mapping.defaultExpectation.actorKind, String(source));
  }
});

test("observation core：归一顺序、覆盖与 logicalCallId 兜底", async () => {
  const core = await loadFile("telemetry/model-api-observation_core");
  const normalized = core.normalizeModelApiCallObservation("web_search_tool", {
    operationId: "op-9",
  });
  assert.equal(normalized.operation, "web_search");
  assert.equal(normalized.actorKind, "tool");
  assert.equal(normalized.operationId, "op-9");
  assert.match(normalized.logicalCallId, UUID_V4);

  const trimmed = core.normalizeModelApiCallObservation(undefined, { logicalCallId: "  id-7  " });
  assert.equal(trimmed.logicalCallId, "id-7");
  const blank = core.normalizeModelApiCallObservation(undefined, { logicalCallId: "   " });
  assert.match(blank.logicalCallId, UUID_V4);
  const twoCalls = [
    core.normalizeModelApiCallObservation("compact", undefined),
    core.normalizeModelApiCallObservation("compact", undefined),
  ];
  assert.notEqual(twoCalls[0].logicalCallId, twoCalls[1].logicalCallId);
  assert.notEqual(twoCalls[0], twoCalls[1]);
});

test("local-date core：分段、补零与年不补零", async () => {
  const core = await loadFile("time/local-date_core");
  assert.deepEqual(core.readLocalDateSegments(new Date(2026, 8, 9)), [2026, 9, 9]);
  assert.equal(core.joinLocalDateSegments(2026, 9, 9), "2026-09-09");
  assert.equal(core.joinLocalDateSegments(999, 1, 1), "999-01-01");
  assert.equal(core.joinLocalDateSegments(10000, 12, 31), "10000-12-31");
  assert.equal(core.toLocalIsoDate(new Date(2028, 1, 29)), "2028-02-29");
});
