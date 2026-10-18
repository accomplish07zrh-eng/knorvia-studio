// SPDX-License-Identifier: Apache-2.0
// B27 schema 合成（typed 判定 · 发射器 · $defs 递归 · JSDoc 约束 · 拒绝诊断 · askSpecs 装配
// · submit profile · 确定性序列化）与 B28 校验器（发射子集的关键字语义 · 违规模型）。
//
// 两侧都只经公开入口断言：合成侧一站式走 synthesizeWorkflowSchemas，需要站点表时按
// createWorkflowProgram + collectSites + synthesizeAskSchemas + buildAskSpecs 手工拼装——
// 这条拼装顺序本身就是合同（同一次编译的三件产物必须能拼起来）。
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dw } from "./entry.mjs";

const {
  GENERIC_SUBMIT_PROFILE,
  MAX_UNION_MEMBERS,
  SCHEMA_DIAGNOSTIC_CODE,
  buildAskSpecs,
  collectDiagnostics,
  collectSites,
  createWorkflowProgram,
  deriveActorSubmitProfiles,
  deriveActorSubmitProfilesFor,
  formatViolation,
  formatViolations,
  serializeSchema,
  synthesizeAskSchemas,
  synthesizeWorkflowSchemas,
  validate,
} = dw;

/**
 * 同一次编译的三件产物：站点表、schema 表（含诊断）、按站点表装配出的 askSpecs。
 * typecheck 不过时不合成（与 synthesizeWorkflowSchemas 同一条短路），只把编译诊断带回来，
 * 让测试能区分「9002 拒绝」与「脚本本身有病」。
 */
function compile(scriptText) {
  const workflow = createWorkflowProgram(scriptText);
  const diagnostics = collectDiagnostics(workflow.program);
  if (diagnostics.length > 0) return { compileDiagnostics: diagnostics, workflow };
  const table = collectSites(workflow);
  const synthesized = synthesizeAskSchemas(workflow, table);
  const askSpecs = buildAskSpecs(table, synthesized.schemas);
  return {
    askSpecs,
    diagnostics: synthesized.diagnostics,
    schemas: synthesized.schemas,
    table,
    workflow,
  };
}

/** 单个 ask 站点的发射结果（默认第一个站点）；脚本本身不过编译或被子集拒绝都算测试写错。 */
function schemaOf(scriptText, siteId = "ask#1") {
  const c = compile(scriptText);
  if (c.compileDiagnostics !== undefined) {
    assert.fail(`脚本没有过编译：${JSON.stringify(c.compileDiagnostics)}`);
  }
  assert.deepEqual(c.diagnostics, []);
  return c.schemas[siteId];
}

/** 在 `ask<T>()` 的 T 位上放一个类型并只取 schema——形状测试的主体都写成一行。 */
function schemaOfType(typeText) {
  return schemaOf(`const a = agent(); await a.ask<${typeText}>("t"); return 1;`);
}

/** 一次合成的全部诊断（9002 通道）。 */
function diagnosticsOf(scriptText) {
  const c = compile(scriptText);
  if (c.compileDiagnostics !== undefined) {
    assert.fail(`脚本没有过编译：${JSON.stringify(c.compileDiagnostics)}`);
  }
  return c.diagnostics;
}

/** 违规文本按行返回列表（空列表 = 通过），断言主形状：合同说的是「模型看到什么」。 */
function lines(schema, value) {
  const text = formatViolations(validate(schema, value));
  return text === "" ? [] : text.split("\n");
}

/** 手写站点图：deriveActorSubmitProfiles 的保守规则要用「分析给不出 actor」的图，脚本里造不出。 */
function graphOf(actors, nodes) {
  return {
    actors: actors.map((id, index) => ({ id, loc: { column: 1, line: index + 1 }, name: id })),
    edges: [],
    nodes: nodes.map((node) => ({ kind: "ask", label: node.id, ...node })),
  };
}

function specsOf(entries) {
  return new Map(entries);
}

describe("B27 typed 判定：什么站点发射 schema", () => {
  it("显式类型实参才发射，按站点 id 归档", () => {
    const c = compile(`
const a = agent("researcher");
const one = await a.ask<{ id: number }>("t");
const two = await a.ask<string>("t");
const three = await a.ask("t");
return [one, two, three];
`);
    assert.deepEqual(Object.keys(c.schemas), ["ask#1"]);
    assert.deepEqual(c.schemas["ask#1"], {
      additionalProperties: false,
      properties: { id: { type: "number" } },
      required: ["id"],
      type: "object",
    });
  });

  it("ask() / ask<string>() / 别名到 string 的 ask 都是 untyped", () => {
    const c = compile(`
type Text = string;
const a = agent();
await a.ask("t");
await a.ask<string>("t");
await a.ask<Text>("t");
return 1;
`);
    assert.deepEqual(c.schemas, {});
    assert.deepEqual(c.diagnostics, []);
    assert.deepEqual(
      [...c.askSpecs.values()],
      [{ typed: false }, { typed: false }, { typed: false }],
    );
  });

  it("checker 展开后不是原始 string 就发射：字面量类型、条件类型、括号包裹都算 typed", () => {
    const c = compile(`
type Flag = true;
type Pick2 = Flag extends true ? { x: string } : never;
const a = agent();
await a.ask<("a" | "b")>("t");
await a.ask<Pick2>("t");
return 1;
`);
    assert.deepEqual(Object.keys(c.schemas), ["ask#1", "ask#2"]);
    assert.deepEqual(c.schemas["ask#1"], { enum: ["a", "b"] });
  });

  it("站点 id 按源码顺序编号，诊断落在 ask 标识符处", () => {
    const c = compile(`const a = agent(); await a.ask<never>("t"); return a.ask<{ x: 1 }>("t");`);
    assert.deepEqual(
      c.table.asks.map((site) => site.id),
      ["ask#1", "ask#2"],
    );
    assert.deepEqual(c.diagnostics, [
      {
        code: SCHEMA_DIAGNOSTIC_CODE,
        column: 28,
        line: 1,
        message: "unsupported ask result type: type 'never' cannot be represented",
      },
    ]);
  });

  it("MAX_UNION_MEMBERS 与 SCHEMA_DIAGNOSTIC_CODE 是合同常量", () => {
    assert.equal(MAX_UNION_MEMBERS, 100);
    assert.equal(SCHEMA_DIAGNOSTIC_CODE, 9002);
  });
});

describe("B27 发射器：标量、对象与必填", () => {
  const cases = [
    ["number", { type: "number" }],
    ["boolean", { type: "boolean" }],
    ["null", { type: "null" }],
    ["unknown", {}],
    ["true", { const: true }],
    ["false", { const: false }],
    ['"lit"', { const: "lit" }],
    ["42", { const: 42 }],
    ["string[]", { items: { type: "string" }, type: "array" }],
    ["readonly string[]", { items: { type: "string" }, type: "array" }],
    [
      "Record<string, number>",
      {
        additionalProperties: { type: "number" },
        description: "Construct a type with a set of properties K of type T",
        type: "object",
      },
    ],
    [
      "Record<string, unknown>",
      {
        additionalProperties: {},
        description: "Construct a type with a set of properties K of type T",
        type: "object",
      },
    ],
  ];
  for (const [typeText, expected] of cases) {
    it(`标量/数组/索引签名 ${typeText}`, () => {
      assert.deepEqual(schemaOfType(typeText), expected);
    });
  }

  it("根 description 取类型自己的 aliasSymbol：泛型实例化的别名是库符号，脚本注释抢不到", () => {
    assert.deepEqual(
      schemaOf(`
/** 我自己的说明 */
type MyRecord = Record<string, number>;
const a = agent();
await a.ask<MyRecord>("t");
return 1;
`),
      {
        additionalProperties: { type: "number" },
        description: "Construct a type with a set of properties K of type T",
        type: "object",
      },
    );
    assert.deepEqual(
      schemaOf(`
/** 盒子 */
interface Boxed { v: string }
const a = agent();
await a.ask<Boxed>("t");
return 1;
`),
      {
        additionalProperties: false,
        description: "盒子",
        properties: { v: { type: "string" } },
        required: ["v"],
        type: "object",
      },
    );
  });

  it("required 按声明顺序，可选属性既不在 required 也不带 undefined", () => {
    assert.deepEqual(
      schemaOf(`
interface Shape {
  z: string;
  mid?: number;
  a: boolean;
  tail?: null;
}
const a = agent();
await a.ask<Shape>("t");
return 1;
`),
      {
        additionalProperties: false,
        properties: {
          a: { type: "boolean" },
          mid: { type: "number" },
          tail: { type: "null" },
          z: { type: "string" },
        },
        required: ["z", "a"],
        type: "object",
      },
    );
  });

  it("只有可选属性的对象发射出空 required 缺席", () => {
    assert.deepEqual(schemaOfType("{ x?: string }"), {
      additionalProperties: false,
      properties: { x: { type: "string" } },
      type: "object",
    });
  });

  it("空接口只剩 additionalProperties: false", () => {
    assert.deepEqual(
      schemaOf('interface Empty {}\nconst a = agent(); await a.ask<Empty>("t"); return 1;'),
      { additionalProperties: false, type: "object" },
    );
  });

  it("闭合对象拒绝多余键，带字符串索引签名的对象放行任意键", () => {
    const closed = schemaOfType("{ a: string }");
    assert.deepEqual(lines(closed, { a: "x", b: 1 }), [
      "$.b: expected no additional property, got number 1",
    ]);
    const open = schemaOfType("Record<string, string>");
    assert.deepEqual(lines(open, { a: "x", b: "y" }), []);
    assert.deepEqual(lines(open, { a: 1 }), ["$.a: expected string, got number 1"]);
  });

  it("嵌套对象与数组元素继续递归发射", () => {
    assert.deepEqual(schemaOfType("{ o: { v: number }[]; list: { t: string } }"), {
      additionalProperties: false,
      properties: {
        list: {
          additionalProperties: false,
          properties: { t: { type: "string" } },
          required: ["t"],
          type: "object",
        },
        o: {
          items: {
            additionalProperties: false,
            properties: { v: { type: "number" } },
            required: ["v"],
            type: "object",
          },
          type: "array",
        },
      },
      required: ["o", "list"],
      type: "object",
    });
  });
});

describe("B27 发射器：union、tuple 与 intersection", () => {
  it("全字面量成员发 enum，成员顺序取 checker 规范化的顺序而不是书写顺序", () => {
    assert.deepEqual(schemaOfType('1 | "a" | null'), { enum: [null, 1, "a"] });
    assert.deepEqual(schemaOfType('"b" | "a" | "b"'), { enum: ["b", "a"] });
  });

  it("混入非字面量成员就整体退化成 anyOf，且字面量成员被子类型吸收", () => {
    // checker 把 `"x"` 折进 `string`，所以 anyOf 只剩两个变体：成员数是 checker 的，不是书写的。
    assert.deepEqual(schemaOfType('string | number[] | "x"'), {
      anyOf: [{ type: "string" }, { items: { type: "number" }, type: "array" }],
    });
  });

  it("模板字面量类型被展开成有限 enum", () => {
    assert.deepEqual(schemaOfType('`${"a" | "b"}-${1 | 2}`'), {
      enum: ["a-1", "a-2", "b-1", "b-2"],
    });
  });

  it("number | null 是 anyOf（null 不是字面量成员集合里唯一的 null 例外）", () => {
    assert.deepEqual(schemaOfType("number | null"), {
      anyOf: [{ type: "null" }, { type: "number" }],
    });
  });

  it("定长 tuple 发 prefixItems + minItems/maxItems", () => {
    assert.deepEqual(schemaOfType("[string, number]"), {
      maxItems: 2,
      minItems: 2,
      prefixItems: [{ type: "string" }, { type: "number" }],
      type: "array",
    });
  });

  it("可选与 rest 元素分别落到 maxItems 缺席与 items", () => {
    assert.deepEqual(schemaOfType("[string, number, ...boolean[]]"), {
      items: { type: "boolean" },
      minItems: 2,
      prefixItems: [{ type: "string" }, { type: "number" }],
      type: "array",
    });
    assert.deepEqual(schemaOfType("[string, number?]"), {
      maxItems: 2,
      minItems: 1,
      prefixItems: [{ type: "string" }, { type: "number" }],
      type: "array",
    });
  });

  it("tuple 元素递归发射", () => {
    assert.deepEqual(schemaOfType("[[string], { x: number }]"), {
      maxItems: 2,
      minItems: 2,
      prefixItems: [
        { maxItems: 1, minItems: 1, prefixItems: [{ type: "string" }], type: "array" },
        {
          additionalProperties: false,
          properties: { x: { type: "number" } },
          required: ["x"],
          type: "object",
        },
      ],
      type: "array",
    });
  });

  it("品牌 intersection 按其原始标量发射", () => {
    assert.deepEqual(schemaOfType('string & { readonly __brand: "Id" }'), { type: "string" });
    assert.deepEqual(schemaOfType("number & { __b: 1 }"), { type: "number" });
  });

  it("纯对象 intersection 合并成一个 object", () => {
    assert.deepEqual(schemaOfType("{ a: string } & { b: number }"), {
      additionalProperties: false,
      properties: { a: { type: "string" }, b: { type: "number" } },
      required: ["a", "b"],
      type: "object",
    });
  });
});

describe("B27 发射器：递归类型提升为 $defs", () => {
  it("自引用类型发 $ref + $defs，def 名取符号名", () => {
    assert.deepEqual(
      schemaOf(`
interface Tree { name: string; children: Tree[] }
const a = agent();
await a.ask<Tree>("t");
return 1;
`),
      {
        $defs: {
          Tree: {
            additionalProperties: false,
            properties: {
              children: { items: { $ref: "#/$defs/Tree" }, type: "array" },
              name: { type: "string" },
            },
            required: ["name", "children"],
            type: "object",
          },
        },
        $ref: "#/$defs/Tree",
      },
    );
  });

  it("非递归的具名类型即使被用三次也保持就地内联", () => {
    const schema = schemaOf(`
interface Leaf { v: string }
const a = agent();
await a.ask<{ p: Leaf; q: Leaf; r: Leaf[] }>("t");
return 1;
`);
    assert.equal("$defs" in schema, false);
    assert.deepEqual(schema.properties.p, schema.properties.q);
    assert.deepEqual(schema.properties.r, {
      items: {
        additionalProperties: false,
        properties: { v: { type: "string" } },
        required: ["v"],
        type: "object",
      },
      type: "array",
    });
  });

  it("互递归只为真正被再次进入的类型建 def", () => {
    const schema = schemaOf(`
interface A { b?: B }
interface B { a?: A }
const a = agent();
await a.ask<A>("t");
return 1;
`);
    assert.deepEqual(Object.keys(schema.$defs), ["A"]);
    assert.deepEqual(schema, {
      $defs: {
        A: {
          additionalProperties: false,
          properties: {
            b: {
              additionalProperties: false,
              properties: { a: { $ref: "#/$defs/A" } },
              type: "object",
            },
          },
          type: "object",
        },
      },
      $ref: "#/$defs/A",
    });
  });

  it("同名泛型的两个实例化按 Schema2 递增去重", () => {
    const schema = schemaOf(`
interface Box<T> { v: T; kids: Box<T>[] }
const a = agent();
await a.ask<{ s: Box<string>; n: Box<number> }>("t");
return 1;
`);
    assert.deepEqual(Object.keys(schema.$defs), ["Box", "Box2"]);
    assert.deepEqual(schema.properties.s, { $ref: "#/$defs/Box" });
    assert.deepEqual(schema.properties.n, { $ref: "#/$defs/Box2" });
    assert.deepEqual(schema.$defs.Box.properties.v, { type: "string" });
    assert.deepEqual(schema.$defs.Box2.properties.v, { type: "number" });
  });

  it("数组类型自身的递归也建 def（名取 Array）", () => {
    assert.deepEqual(
      schemaOf(`
interface N { kids: N[] }
const a = agent();
await a.ask<N[]>("t");
return 1;
`),
      {
        $defs: {
          Array: {
            items: {
              additionalProperties: false,
              properties: { kids: { $ref: "#/$defs/Array" } },
              required: ["kids"],
              type: "object",
            },
            type: "array",
          },
        },
        $ref: "#/$defs/Array",
      },
    );
  });
});

describe("B27 JSDoc 约束与描述", () => {
  it("数值/字符串标签进对应关键字，文档正文进 description", () => {
    assert.deepEqual(
      schemaOf(`
interface Constrained {
  /**
   * 计数
   * @minimum 1
   * @maximum 10
   * @exclusiveMinimum 0.5
   * @exclusiveMaximum 10.5
   * @default 3
   */
  n: number;
  /**
   * @minLength 2
   * @maxLength 4
   * @pattern ^[a-z]+$
   * @format email
   */
  s: string;
  /**
   * @minItems 1
   * @maxItems 3
   */
  arr: number[];
}
const a = agent();
await a.ask<Constrained>("t");
return 1;
`),
      {
        additionalProperties: false,
        properties: {
          arr: { items: { type: "number" }, maxItems: 3, minItems: 1, type: "array" },
          n: {
            description: "计数",
            exclusiveMaximum: 10.5,
            exclusiveMinimum: 0.5,
            default: 3,
            maximum: 10,
            minimum: 1,
            type: "number",
          },
          s: { maxLength: 4, minLength: 2, pattern: "^[a-z]+$", format: "email", type: "string" },
        },
        required: ["n", "s", "arr"],
        type: "object",
      },
    );
  });

  it("@default 先按 JSON 解析，解析不了当裸串，标签缺席即空串", () => {
    assert.deepEqual(
      schemaOf(`
interface D {
  /** @default [1, "a"] */
  arr: number[];
  /** @default "quoted" */
  q: string;
  /** @default bare */
  bare: string;
  /** @default */
  empty: string;
}
const a = agent();
await a.ask<D>("t");
return 1;
`),
      {
        additionalProperties: false,
        properties: {
          arr: { default: [1, "a"], items: { type: "number" }, type: "array" },
          bare: { default: "bare", type: "string" },
          empty: { default: "", type: "string" },
          q: { default: "quoted", type: "string" },
        },
        required: ["arr", "q", "bare", "empty"],
        type: "object",
      },
    );
  });

  it("非数值的数值标签与子集外的标签一律静默忽略", () => {
    assert.deepEqual(
      schemaOf(`
interface Ignored {
  /**
   * 说明
   * @minimum not-a-number
   * @maximum Infinity
   * @example 1
   * @deprecated
   */
  n: number;
}
const a = agent();
await a.ask<Ignored>("t");
return 1;
`),
      {
        additionalProperties: false,
        properties: { n: { description: "说明", type: "number" } },
        required: ["n"],
        type: "object",
      },
    );
  });

  it("标签只有名字没有值时不写关键字", () => {
    assert.deepEqual(
      schemaOf(`
interface Bare {
  /**
   * @pattern
   * @format
   */
  s: string;
}
const a = agent();
await a.ask<Bare>("t");
return 1;
`),
      {
        additionalProperties: false,
        properties: { s: { type: "string" } },
        required: ["s"],
        type: "object",
      },
    );
  });

  it("顶层具名类型的文档挂到根 schema，与 $defs 共存", () => {
    const schema = schemaOf(`
/** 递归节点 */
interface Node { next?: Node }
const a = agent();
await a.ask<Node>("t");
return 1;
`);
    assert.equal(schema.description, "递归节点");
    assert.equal(schema.$ref, "#/$defs/Node");
    assert.deepEqual(Object.keys(schema.$defs), ["Node"]);
  });

  it("顶层具名 union 的文档也挂得上", () => {
    assert.deepEqual(
      schemaOf(`
/** 顶层 */
type P = "a" | "b";
const a = agent();
await a.ask<P>("t");
return 1;
`),
      { description: "顶层", enum: ["a", "b"] },
    );
  });

  it("匿名内联类型没有 description 键", () => {
    const schema = schemaOfType("{ x: string }");
    assert.equal("description" in schema, false);
  });
});

describe("B27 拒绝诊断：不可 JSON 序列化的结果类型", () => {
  const rejections = [
    ["any", "any", "type 'any' is not allowed; use 'unknown' or a concrete type"],
    ["never", "never", "type 'never' cannot be represented"],
    ["bigint", "{ n: bigint }", "'bigint' is not JSON-serializable (at $.n)"],
    ["symbol", "{ s: symbol }", "'symbol' is not JSON-serializable (at $.s)"],
    ["函数", "{ f: () => void }", "function types are not JSON-serializable (at $.f)"],
    ["Date", "{ d: Date }", "'Date' is not JSON-serializable (at $.d)"],
    ["Map", "{ m: Map<string, string> }", "'Map' is not JSON-serializable (at $.m)"],
    ["Set", "{ s: Set<string> }", "'Set' is not JSON-serializable (at $.s)"],
    ["Promise", "{ p: Promise<number> }", "'Promise' is not JSON-serializable (at $.p)"],
    ["Error", "{ e: Error }", "'Error' is not JSON-serializable (at $.e)"],
    ["Uint8Array", "{ b: Uint8Array }", "'Uint8Array' is not JSON-serializable (at $.b)"],
    [
      "thenable",
      "{ p: { then(onf: (v: number) => void): void } }",
      "Promise/thenable values are not JSON-serializable (at $.p)",
    ],
    [
      "必填属性带 undefined",
      "{ x: string | undefined }",
      "'undefined' is only allowed on optional properties (at $.x)",
    ],
    [
      "union 成员里有 undefined",
      "string | undefined",
      "'undefined' is only allowed on optional properties",
    ],
    ["嵌套两层", "{ o: { p: Date } }", "'Date' is not JSON-serializable (at $.o.p)"],
    ["顶层就是对象字面量的函数", "{ (): void }", "function types are not JSON-serializable"],
  ];
  for (const [label, typeText, message] of rejections) {
    it(`${label}：诊断码 9002 且不留 schema`, () => {
      const script = `const a = agent(); await a.ask<${typeText}>("t"); return 1;`;
      assert.deepEqual(diagnosticsOf(script), [
        {
          code: SCHEMA_DIAGNOSTIC_CODE,
          column: 28,
          line: 1,
          message: `unsupported ask result type: ${message}`,
        },
      ]);
    });
  }

  it("class 实例与顶层路径不带 (at $)", () => {
    assert.deepEqual(
      diagnosticsOf(`class K { x = 1 }\nconst a = agent(); await a.ask<K>("t"); return 1;`),
      [
        {
          code: SCHEMA_DIAGNOSTIC_CODE,
          column: 28,
          line: 2,
          message: "unsupported ask result type: class instances are not JSON-serializable",
        },
      ],
    );
  });

  it("超过 MAX_UNION_MEMBERS 的两种形态都拒", () => {
    const literals = Array.from({ length: 101 }, (_, i) => `"a${i}"`).join(" | ");
    const objects = Array.from({ length: 101 }, (_, i) => `{ k${i}: number }`).join(" | ");
    assert.deepEqual(diagnosticsOf(`const a = agent(); await a.ask<${literals}>("t"); return 1;`), [
      {
        code: SCHEMA_DIAGNOSTIC_CODE,
        column: 28,
        line: 1,
        message: "unsupported ask result type: union has too many members (101 > 100)",
      },
    ]);
    assert.deepEqual(diagnosticsOf(`const a = agent(); await a.ask<${objects}>("t"); return 1;`), [
      {
        code: SCHEMA_DIAGNOSTIC_CODE,
        column: 28,
        line: 1,
        message: "unsupported ask result type: union has too many members (101 > 100)",
      },
    ]);
  });

  it("恰好 100 个成员放行（上限是闭区间）", () => {
    const literals = Array.from({ length: MAX_UNION_MEMBERS }, (_, i) => `"b${i}"`).join(" | ");
    const schema = schemaOfType(literals);
    assert.deepEqual(
      schema.enum,
      literals.split(" | ").map((t) => t.slice(1, -1)),
    );
  });

  it("模板字面量笛卡尔积是现实中越界的那条路", () => {
    const dirs = Array.from({ length: 12 }, (_, i) => `"d${i}"`).join(" | ");
    const sizes = Array.from({ length: 12 }, (_, i) => `"s${i}"`).join(" | ");
    assert.deepEqual(
      diagnosticsOf(
        `type Dir = ${dirs};\ntype Size = ${sizes};\nconst a = agent();\nawait a.ask<\`\${Dir}-\${Size}\`>("t");\nreturn 1;`,
      ),
      [
        {
          code: SCHEMA_DIAGNOSTIC_CODE,
          column: 9,
          line: 4,
          message: "unsupported ask result type: union has too many members (144 > 100)",
        },
      ],
    );
  });

  it("一个站点被拒不拖累同脚本的其他站点", () => {
    const c = compile(`
const a = agent();
await a.ask<{ d: Date }>("t");
await a.ask<{ ok: 1 }>("t");
return 1;
`);
    assert.deepEqual(Object.keys(c.schemas), ["ask#2"]);
    assert.equal(c.diagnostics.length, 1);
  });

  it("被拒的 typed 站点在 askSpecs 里退成 untyped——装配侧看不见诊断", () => {
    const c = compile(`const a = agent(); await a.ask<any>("t"); return 1;`);
    assert.deepEqual([...c.askSpecs.entries()], [["ask#1", { typed: false }]]);
    assert.equal(c.diagnostics.length, 1);
    assert.deepEqual(
      [...deriveActorSubmitProfilesFor(c.workflow, c.table, c.askSpecs).entries()],
      [["actor#1", { kind: "untyped" }]],
    );
  });
});

describe("B27 report 实参的可序列化检查", () => {
  it("report 不产出 schema，只贡献同一条诊断通道", () => {
    const c = compile(
      `const a = agent(); report(new Date()); await a.ask<{ x: 1 }>("t"); return 1;`,
    );
    assert.deepEqual(Object.keys(c.schemas), ["ask#1"]);
    assert.deepEqual(c.diagnostics, [
      {
        code: SCHEMA_DIAGNOSTIC_CODE,
        column: 20,
        line: 1,
        message: "unsupported report item type: 'Date' is not JSON-serializable",
      },
    ]);
  });

  it("类型取自实参表达式：unknown 与纯 JSON 形状放行", () => {
    assert.deepEqual(
      diagnosticsOf(`
const u: unknown = 1;
report(u);
report({ a: 1, b: "x", c: [1, 2], d: null, e: { f: true } });
report("plain string");
return 1;
`),
      [],
    );
  });

  it("函数/类实例/Promise 实参在调用点被拒", () => {
    assert.deepEqual(
      diagnosticsOf(`
report(() => 1);
report(Promise.resolve(1));
class K { x = 1 }
report(new K());
return 1;
`),
      [
        {
          code: SCHEMA_DIAGNOSTIC_CODE,
          column: 1,
          line: 2,
          message: "unsupported report item type: function types are not JSON-serializable",
        },
        {
          code: SCHEMA_DIAGNOSTIC_CODE,
          column: 1,
          line: 3,
          message: "unsupported report item type: 'Promise' is not JSON-serializable",
        },
        {
          code: SCHEMA_DIAGNOSTIC_CODE,
          column: 1,
          line: 5,
          message: "unsupported report item type: class instances are not JSON-serializable",
        },
      ],
    );
  });

  it("report 的嵌套不可序列化成员定位在 report 站点，路径用发射器的数组记号", () => {
    // 发射器给数组元素的路径是 `[]` 而不是 `[0]`：诊断定位的是类型路径，不是某个值的下标。
    assert.deepEqual(diagnosticsOf(`const d = { list: [new Date()] };\nreport(d);\nreturn 1;`), [
      {
        code: SCHEMA_DIAGNOSTIC_CODE,
        column: 1,
        line: 2,
        message: "unsupported report item type: 'Date' is not JSON-serializable (at $.list[])",
      },
    ]);
  });

  it("union 变体的路径用 `|N`（第 N 个变体），同样不带值下标", () => {
    assert.deepEqual(
      diagnosticsOf(`const a = agent(); await a.ask<{ v: string | Date }>("t"); return 1;`),
      [
        {
          code: SCHEMA_DIAGNOSTIC_CODE,
          column: 28,
          line: 1,
          message: "unsupported ask result type: 'Date' is not JSON-serializable (at $.v|1)",
        },
      ],
    );
  });

  it("实参缺席不是 9002，是 typecheck 的事", () => {
    const c = compile("report();\nreturn 1;");
    assert.notEqual(c.compileDiagnostics, undefined);
    assert.equal(c.compileDiagnostics[0].code, 2554);
  });
});

describe("B27 一站式入口与短路", () => {
  it("脚本本身不过编译时不合成，只带回归因诊断", () => {
    const r = synthesizeWorkflowSchemas(
      'const a = agent(); const n: number = "x"; await a.ask<{ p: 1 }>("t"); return n;',
    );
    assert.deepEqual(r.schemas, {});
    assert.deepEqual(r.diagnostics, [
      {
        code: 2322,
        column: 26,
        line: 1,
        message: "Type 'string' is not assignable to type 'number'.",
      },
    ]);
  });

  it("一站式入口 = 手工拼装（同一份 schema 与诊断）", () => {
    const script = `
interface Todo { id: number; title?: string }
const a = agent("researcher");
await a.ask<Todo>("t");
report(new Date());
return 1;
`;
    const hand = compile(script);
    const oneShot = synthesizeWorkflowSchemas(script);
    assert.deepEqual(oneShot.schemas, hand.schemas);
    assert.deepEqual(oneShot.diagnostics, hand.diagnostics);
  });
});

describe("B27 buildAskSpecs：按站点表装配", () => {
  it("每个站点都有条目：有 schema 记 typed，没有就显式 typed:false", () => {
    const c = compile(`
const a = agent();
await a.ask<{ x: 1 }>("t");
await a.ask("t");
await a.ask<{ y: 2 }>("t");
return 1;
`);
    assert.deepEqual([...c.askSpecs.keys()], ["ask#1", "ask#2", "ask#3"]);
    assert.deepEqual(
      [...c.askSpecs.values()],
      [
        { schema: c.schemas["ask#1"], typed: true },
        { typed: false },
        { schema: c.schemas["ask#3"], typed: true },
      ],
    );
  });

  it("schemas 里对不上任何站点的键被忽略（站点表是身份的唯一真源）", () => {
    const c = compile(`const a = agent(); await a.ask("t"); return 1;`);
    const specs = buildAskSpecs(c.table, { "ask#9": { type: "string" } });
    assert.deepEqual([...specs.entries()], [["ask#1", { typed: false }]]);
  });

  it("装配只依赖站点 id：同一张表配不同 schema 表得到不同 typed", () => {
    const c = compile(`const a = agent(); await a.ask<{ x: 1 }>("t"); return 1;`);
    assert.deepEqual(
      [...buildAskSpecs(c.table, { "ask#1": { type: "number" } }).values()],
      [{ schema: { type: "number" }, typed: true }],
    );
  });
});

describe("B27 submit profile", () => {
  it("同一 actor 上两处内容相同的 schema 记 mono（按规范内容去重，不是引用相等）", () => {
    const c = compile(`
interface Same { x: string }
const a = agent("a");
await a.ask<Same>("t");
await a.ask<Same>("t");
return 1;
`);
    const [profile] = deriveActorSubmitProfilesFor(c.workflow, c.table, c.askSpecs).values();
    assert.equal(profile.kind, "mono");
    assert.notEqual(profile.schema, c.schemas["ask#1"]);
    assert.deepEqual(profile.schema, c.schemas["ask#1"]);
  });

  it("同一 actor 上出现第二种 schema 即退 generic", () => {
    const c = compile(`
const a = agent("a");
await a.ask<{ x: string }>("t");
await a.ask<{ x: number }>("t");
return 1;
`);
    const profiles = deriveActorSubmitProfilesFor(c.workflow, c.table, c.askSpecs);
    assert.equal(profiles.get("actor#1"), GENERIC_SUBMIT_PROFILE);
  });

  it("untyped ask 可以混在 mono 里不影响判定", () => {
    const c = compile(`
const a = agent("a");
await a.ask("t");
await a.ask<{ x: 1 }>("t");
await a.ask<string>("t");
return 1;
`);
    const profile = deriveActorSubmitProfilesFor(c.workflow, c.table, c.askSpecs).get("actor#1");
    assert.deepEqual(profile, { kind: "mono", schema: c.schemas["ask#2"] });
  });

  it("没有 ask 落到 actor 上记 untyped", () => {
    const c = compile(`
const a = agent("idle");
const b = agent("busy");
await b.ask<{ x: 1 }>("t");
return 1;
`);
    const profiles = deriveActorSubmitProfilesFor(c.workflow, c.table, c.askSpecs);
    assert.deepEqual(profiles.get("actor#1"), { kind: "untyped" });
    assert.equal(profiles.get("actor#2").kind, "mono");
  });

  it("条件 receiver 的一个 schema 计入每个可能落到的 actor", () => {
    const c = compile(`
const pick = Math.random() > 0.5 ? agent("a") : agent("b");
await pick.ask<{ x: 1 }>("t");
return 1;
`);
    assert.deepEqual(
      [...deriveActorSubmitProfilesFor(c.workflow, c.table, c.askSpecs).values()].map(
        (p) => p.kind,
      ),
      ["mono", "mono"],
    );
  });

  it("表覆盖 graph.actors 里的每一个站点，顺序即图里的顺序", () => {
    const c = compile(`
const a = agent("a");
const b = agent("b");
await a.ask<{ x: 1 }>("t");
return 1;
`);
    assert.deepEqual(
      [...deriveActorSubmitProfilesFor(c.workflow, c.table, c.askSpecs).keys()],
      ["actor#1", "actor#2"],
    );
  });

  it("任何一个 ask 的 actor 集为空 → 整表 generic，且立即返回", () => {
    const specs = specsOf([
      ["ask#1", { schema: { type: "string" }, typed: true }],
      ["ask#2", { schema: { type: "number" }, typed: true }],
    ]);
    const profiles = deriveActorSubmitProfiles(
      graphOf(
        ["actor#1", "actor#2"],
        [
          { id: "ask#1", actors: ["actor#1"] },
          { id: "ask#2", actors: [] },
        ],
      ),
      specs,
    );
    assert.deepEqual([...profiles.keys()], ["actor#1", "actor#2"]);
    assert.equal(profiles.get("actor#1"), GENERIC_SUBMIT_PROFILE);
    assert.equal(profiles.get("actor#2"), GENERIC_SUBMIT_PROFILE);
  });

  it("askSpecs 缺站点同样整表 generic（不猜）", () => {
    const profiles = deriveActorSubmitProfiles(
      graphOf(["actor#1"], [{ id: "ask#1", actors: ["actor#1"] }]),
      specsOf([]),
    );
    assert.deepEqual([...profiles.entries()], [["actor#1", GENERIC_SUBMIT_PROFILE]]);
  });

  it("非 ask 节点被跳过，空图得到空表", () => {
    assert.deepEqual(
      [
        ...deriveActorSubmitProfiles(
          graphOf(["actor#1"], [{ id: "world-read#1", kind: "world-read" }]),
          specsOf([]),
        ),
      ],
      [["actor#1", { kind: "untyped" }]],
    );
    assert.equal(deriveActorSubmitProfiles(graphOf([], []), specsOf([])).size, 0);
  });

  it("图里出现但未登记的 actor id 会被补桶，不静默跳过", () => {
    const profiles = deriveActorSubmitProfiles(
      graphOf(["actor#1"], [{ id: "ask#1", actors: ["actor#7"] }]),
      specsOf([["ask#1", { schema: { type: "string" }, typed: true }]]),
    );
    assert.deepEqual([...profiles.keys()], ["actor#1", "actor#7"]);
    assert.deepEqual(profiles.get("actor#1"), { kind: "untyped" });
    assert.deepEqual(profiles.get("actor#7"), { kind: "mono", schema: { type: "string" } });
  });

  it("GENERIC_SUBMIT_PROFILE 是复用常量而不是新建对象", () => {
    const profiles = deriveActorSubmitProfiles(
      graphOf(["actor#1"], [{ id: "ask#1", actors: [] }]),
      specsOf([]),
    );
    assert.equal(profiles.get("actor#1"), GENERIC_SUBMIT_PROFILE);
    assert.deepEqual(GENERIC_SUBMIT_PROFILE, { kind: "generic" });
  });
});

describe("B27 serializeSchema：确定性序列化", () => {
  it("对象键递归排序，数组保持原序，末尾一个换行", () => {
    const schema = schemaOf(`
interface Ordered { zebra: string; apple: number[]; m: 1 | 2 }
const a = agent();
await a.ask<Ordered>("t");
return 1;
`);
    assert.deepEqual(schema.required, ["zebra", "apple", "m"]);
    assert.deepEqual(schema.properties.m.enum, [1, 2]);
    assert.equal(
      serializeSchema(schema),
      `{
  "additionalProperties": false,
  "properties": {
    "apple": {
      "items": {
        "type": "number"
      },
      "type": "array"
    },
    "m": {
      "enum": [
        1,
        2
      ]
    },
    "zebra": {
      "type": "string"
    }
  },
  "required": [
    "zebra",
    "apple",
    "m"
  ],
  "type": "object"
}
`,
    );
  });

  it("同一脚本两次编译逐字节相同", () => {
    const script = `
interface Tree { kids: Tree[]; v: string }
const a = agent();
await a.ask<Tree>("t");
return 1;
`;
    const first = serializeSchema(schemaOf(script));
    const second = serializeSchema(synthesizeWorkflowSchemas(script).schemas["ask#1"]);
    assert.equal(first, second);
    assert.match(first, /\n$/);
    assert.equal(first.endsWith("\n\n"), false);
  });

  it("$defs 与 $ref 一起排序，ref 字符串本身不动", () => {
    const schema = schemaOf(`
interface Rec { b?: Rec; a: string }
const a = agent();
await a.ask<Rec>("t");
return 1;
`);
    assert.match(serializeSchema(schema), /^\{\n {2}"\$defs"/);
    assert.deepEqual(JSON.parse(serializeSchema(schema)).$ref, "#/$defs/Rec");
  });

  it("序列化只重排键，不改内容：parse 回来与深结构等价的插入序对象相等", () => {
    const schema = {
      type: "object",
      required: ["b", "a"],
      properties: { b: { type: "string" }, a: { type: "number" } },
      additionalProperties: false,
    };
    assert.deepEqual(JSON.parse(serializeSchema(schema)), schema);
    assert.equal(
      serializeSchema(schema),
      serializeSchema({
        additionalProperties: false,
        properties: { a: { type: "number" }, b: { type: "string" } },
        required: ["b", "a"],
        type: "object",
      }),
    );
  });
});

describe("B28 校验器：许可式空 schema 与关键字优先级", () => {
  it("空 schema 放行任意值（unknown 的许可式 schema）", () => {
    for (const value of [null, undefined, 1, "s", true, [], {}, () => 1]) {
      assert.deepEqual(validate({}, value), []);
    }
  });

  it("关键字优先级 $ref > const > enum > anyOf > type：命中即返回，不再叠加", () => {
    assert.deepEqual(
      lines({ $ref: "#/$defs/S", type: "number", $defs: { S: { type: "string" } } }, 1),
      ["$: expected string, got number 1"],
    );
    assert.deepEqual(lines({ type: "string", const: "a" }, "b"), [
      '$: expected string "a", got string "b"',
    ]);
    assert.deepEqual(lines({ const: "a", minLength: 99 }, "a"), []);
    assert.deepEqual(lines({ enum: ["a"], type: "number", minLength: 9 }, "b"), [
      '$: expected one of string "a", got string "b"',
    ]);
    assert.deepEqual(lines({ anyOf: [{ type: "string" }], type: "number" }, true), [
      "$: expected one of 1 variants, got boolean true",
    ]);
  });

  it("没有 type 时 object/array 关键字惰性，string/number 约束只看实得值类型", () => {
    assert.deepEqual(
      lines({ properties: { a: { type: "string" } }, required: ["a"] }, { a: 1 }),
      [],
    );
    assert.deepEqual(lines({ items: { type: "string" }, minItems: 5 }, [1]), []);
    assert.deepEqual(lines({ minLength: 5 }, "abc"), [
      "$: expected string length >= 5, got length 3",
    ]);
    assert.deepEqual(lines({ minimum: 2 }, 1), ["$: expected >= 2, got number 1"]);
  });

  it("type 可以是数组，违规文本用 ` | ` 连接", () => {
    assert.deepEqual(lines({ type: ["string", "number"] }, true), [
      "$: expected string | number, got boolean true",
    ]);
    assert.deepEqual(lines({ type: ["string", "number"] }, "a"), []);
  });

  it("integer 的类型匹配放过任何有限数，整数性单独检查", () => {
    assert.deepEqual(lines({ type: "integer" }, 1.5), ["$: expected integer, got number 1.5"]);
    assert.deepEqual(lines({ type: "integer" }, 2), []);
    assert.deepEqual(lines({ type: "integer" }, "1"), ['$: expected integer, got string "1"']);
    assert.deepEqual(lines({ type: "string" }, 1), ["$: expected string, got number 1"]);
  });

  it("integer 出现在 union type 里时整数性检查整个消失（判定式是精确等于）", () => {
    assert.deepEqual(lines({ type: ["integer", "string"] }, 1.5), []);
  });

  it("NaN 与 Infinity 不算 number", () => {
    assert.deepEqual(lines({ type: "number" }, Number.NaN), ["$: expected number, got number NaN"]);
    assert.deepEqual(lines({ type: "number" }, Number.POSITIVE_INFINITY), [
      "$: expected number, got number Infinity",
    ]);
  });

  it("null 只匹配 null，undefined 谁都不匹配", () => {
    assert.deepEqual(lines({ type: "null" }, null), []);
    assert.deepEqual(lines({ type: "null" }, undefined), ["$: expected null, got undefined"]);
  });

  it("anyOf 只报「不匹配任何一个变体」，内层违规不外泄", () => {
    assert.deepEqual(lines({ anyOf: [{ type: "string" }, { type: "number", minimum: 10 }] }, 1), [
      "$: expected one of 2 variants, got number 1",
    ]);
    assert.deepEqual(
      lines({ anyOf: [{ type: "string" }, { type: "number", minimum: 10 }] }, 11),
      [],
    );
  });

  it("空 enum 谁都拒", () => {
    assert.deepEqual(lines({ enum: [] }, "a"), ['$: expected one of , got string "a"']);
  });
});

describe("B28 校验器：对象、数组与字符串/数值约束", () => {
  it("required 先报，属性按实得键的顺序报", () => {
    const schema = {
      properties: { a: { type: "string" }, b: { type: "string" }, z: { type: "string" } },
      required: ["b", "a"],
      type: "object",
    };
    assert.deepEqual(lines(schema, { z: 1, a: 2 }), [
      "$.b: expected present, got missing",
      "$.z: expected string, got number 1",
      "$.a: expected string, got number 2",
    ]);
  });

  it("additionalProperties 三态：false 报、schema 递归、true 放行", () => {
    assert.deepEqual(
      lines(
        { additionalProperties: false, properties: { a: { type: "string" } }, type: "object" },
        { b: "x" },
      ),
      ['$.b: expected no additional property, got string "x"'],
    );
    assert.deepEqual(
      lines(
        {
          additionalProperties: { type: "number" },
          properties: { a: { type: "string" } },
          type: "object",
        },
        { a: 1, b: "s" },
      ),
      ["$.a: expected string, got number 1", '$.b: expected number, got string "s"'],
    );
    assert.deepEqual(
      lines(
        { additionalProperties: true, properties: { a: { type: "string" } }, type: "object" },
        { b: 1 },
      ),
      [],
    );
  });

  it("长度约束在元素检查之前，数组长度用 array(N) 表述", () => {
    assert.deepEqual(
      lines({ items: { type: "string" }, maxItems: 3, minItems: 2, type: "array" }, ["a"]),
      ["$: expected at least 2 items, got array(1)"],
    );
    assert.deepEqual(lines({ items: { type: "string" }, type: "array" }, [1, "a", {}]), [
      "$[0]: expected string, got number 1",
      "$[2]: expected string, got object",
    ]);
    assert.deepEqual(lines({ items: { type: "string" }, type: "array" }, "notarray"), [
      '$: expected array, got string "notarray"',
    ]);
  });

  it("prefixItems 覆盖前缀，items 从前缀之后接管", () => {
    const schema = {
      items: { type: "boolean" },
      minItems: 1,
      prefixItems: [{ const: "a" }, { type: "number" }],
      type: "array",
    };
    assert.deepEqual(lines(schema, ["b", "x", "y", true]), [
      '$[0]: expected string "a", got string "b"',
      '$[1]: expected number, got string "x"',
      '$[2]: expected boolean, got string "y"',
    ]);
    assert.deepEqual(lines(schema, ["a", 1, true, false]), []);
    assert.deepEqual(lines(schema, []), ["$: expected at least 1 items, got array(0)"]);
  });

  it("只有 prefixItems 的 tuple：多余下标由 maxItems 挡，前缀内照常检查", () => {
    const schema = { maxItems: 1, prefixItems: [{ type: "string" }], type: "array" };
    assert.deepEqual(lines(schema, ["a"]), []);
    assert.deepEqual(lines(schema, [1]), ["$[0]: expected string, got number 1"]);
    assert.deepEqual(lines(schema, ["a", "b"]), ["$: expected at most 1 items, got array(2)"]);
  });

  it("字符串三条约束可以同时命中，pattern 违规把模式写成 /…/", () => {
    assert.deepEqual(lines({ maxLength: 4, minLength: 2, pattern: "^a", type: "string" }, "x"), [
      "$: expected string length >= 2, got length 1",
      '$: expected match /^a/, got string "x"',
    ]);
  });

  it("非法 pattern 直接把 SyntaxError 抛出去，不转成违规", () => {
    assert.throws(() => validate({ pattern: "(", type: "string" }, "x"), /Unterminated group/);
  });

  it("format 与 description/default 是注解，校验器不看", () => {
    assert.deepEqual(
      lines({ description: "d", default: 5, format: "date-time", type: "string" }, "nonsense"),
      [],
    );
  });

  it("数值四条边界各自独立成条", () => {
    assert.deepEqual(
      lines(
        { exclusiveMaximum: 5, exclusiveMinimum: 1, maximum: 4, minimum: 2, type: "number" },
        0,
      ),
      ["$: expected >= 2, got number 0", "$: expected > 1, got number 0"],
    );
    assert.deepEqual(
      lines(
        { exclusiveMaximum: 5, exclusiveMinimum: 1, maximum: 4, minimum: 2, type: "number" },
        6,
      ),
      ["$: expected <= 4, got number 6", "$: expected < 5, got number 6"],
    );
    assert.deepEqual(lines({ maximum: 4, minimum: 2, type: "number" }, 3), []);
  });

  it("const/enum 用 JSON 深相等：键序无关，值必须严格相等", () => {
    assert.deepEqual(lines({ const: { a: 1, b: [2] } }, { b: [2], a: 1 }), []);
    assert.deepEqual(lines({ const: { a: [1, { b: 2 }] } }, { a: [1, { b: 3 }] }), [
      "$: expected object, got object",
    ]);
    assert.deepEqual(lines({ enum: [1, true] }, 1), []);
    assert.deepEqual(lines({ const: null }, 0), ["$: expected null, got number 0"]);
  });
});

describe("B28 校验器：$ref 解析域", () => {
  it("$ref 只在根 $defs 内解析，形如 #/definitions/… 或带子路径的都算未解析", () => {
    assert.deepEqual(lines({ $ref: "#/$defs/X" }, 1), [
      "$: expected schema #/$defs/X, got unresolved $ref",
    ]);
    assert.deepEqual(lines({ $ref: "#/definitions/X", $defs: { X: { type: "string" } } }, 1), [
      "$: expected schema #/definitions/X, got unresolved $ref",
    ]);
    assert.deepEqual(
      lines({ $ref: "#/$defs/A/properties/x", $defs: { A: { type: "string" } } }, 1),
      ["$: expected schema #/$defs/A/properties/x, got unresolved $ref"],
    );
  });

  it("$defs 在根而不是局部：嵌套 schema 里的 $ref 仍按根解析", () => {
    assert.deepEqual(
      lines(
        {
          $defs: { S: { type: "string" } },
          properties: { a: { $ref: "#/$defs/S" } },
          type: "object",
        },
        { a: 1 },
      ),
      ["$.a: expected string, got number 1"],
    );
    assert.deepEqual(
      lines(
        {
          $defs: { S: { type: "string" } },
          properties: { a: { $defs: { S: { type: "number" } }, $ref: "#/$defs/S" } },
          type: "object",
        },
        { a: 1 },
      ),
      ["$.a: expected string, got number 1"],
    );
  });

  it("$ref 保持路径：经由 def 递归出的违规用原路径", () => {
    assert.deepEqual(
      lines(
        {
          $defs: { R: { properties: { self: { $ref: "#/$defs/R" } }, type: "object" } },
          $ref: "#/$defs/R",
        },
        { self: { self: 5 } },
      ),
      ["$.self.self: expected object, got number 5"],
    );
  });

  it("def 内部指向另一个未解析 def 也报在传入路径上", () => {
    assert.deepEqual(lines({ $defs: { A: { $ref: "#/$defs/B" } }, $ref: "#/$defs/A" }, 1), [
      "$: expected schema #/$defs/B, got unresolved $ref",
    ]);
  });

  it("合成器发的自引用 schema 能被校验器吃下（发射与校验是同一子集）", () => {
    const schema = schemaOf(`
interface Tree { kids: Tree[]; name: string }
const a = agent();
await a.ask<Tree>("t");
return 1;
`);
    assert.deepEqual(lines(schema, { name: "r", kids: [] }), []);
    assert.deepEqual(lines(schema, { kids: [{ kids: [{ name: 3 }], name: "a" }] }), [
      "$.name: expected present, got missing",
      "$.kids[0].kids[0].kids: expected present, got missing",
      "$.kids[0].kids[0].name: expected string, got number 3",
    ]);
    assert.deepEqual(lines(schema, { name: "r" }), ["$.kids: expected present, got missing"]);
  });
});

describe("B28 违规模型：formatViolation 与 formatViolations", () => {
  it("单条格式是 `<path>: expected <expected>, got <got>`", () => {
    assert.equal(
      formatViolation(validate({ type: "string" }, 1)[0]),
      "$: expected string, got number 1",
    );
    assert.deepEqual(validate({ type: "string" }, 1)[0], {
      expected: "string",
      got: "number 1",
      path: "$",
    });
  });

  it("多条一行一条，空列表是空串（不是空行）", () => {
    const violations = validate(
      { additionalProperties: false, properties: {}, type: "object" },
      { a: 1, b: 2 },
    );
    assert.equal(violations.length, 2);
    assert.equal(formatViolations(violations), violations.map(formatViolation).join("\n"));
    assert.equal(formatViolations([]), "");
  });

  it("长字符串截到 20 个字符加省略号，数组报长度不报内容", () => {
    assert.equal(
      formatViolation(validate({ const: "a" }, "abcdefghijklmnopqrstuvwxyz")[0]),
      '$: expected string "a", got string "abcdefghijklmnopqrst…"',
    );
    assert.equal(
      formatViolation(validate({ type: "string" }, [1, 2, 3])[0]),
      "$: expected string, got array(3)",
    );
    assert.equal(
      formatViolation(validate({ type: "string" }, { a: 1 })[0]),
      "$: expected string, got object",
    );
    assert.equal(
      formatViolation(validate({ const: "x" }, undefined)[0]),
      '$: expected string "x", got undefined',
    );
    assert.equal(
      formatViolation(validate({ const: "x" }, null)[0]),
      '$: expected string "x", got null',
    );
    assert.equal(
      formatViolation(validate({ enum: [true, false] }, "x")[0]),
      '$: expected one of boolean true, boolean false, got string "x"',
    );
  });
});
