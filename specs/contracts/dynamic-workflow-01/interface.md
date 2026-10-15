# dynamic-workflow-01 接口（interface.md）

本文件只列**兼容所需的模块路径、导出名、参数与返回类型**：替换包必须让这些模块路径与导出在编译产物中保持可用，签名不变。行为见 `behavior.md`，调用方见 `callers.md`。

覆盖范围：`apps/cli/packages/dynamic-workflow/src/analysis/`（54 个文件）与 `src/compiler/compile.ts`，共 **55 个继承文件**。`compiler/libs.generated.ts` 是 `scripts/generate-libs.mjs` 的构建期生成物（不进 git），不属合同范围。

## 兼容入口面（重写后必须原样可用）

- `@knorvia/dynamic-workflow` 根桶（`src/index.ts`）里来自本包的导出：`analyzeWorkflowScript`、`compileWorkflowScript`、`createWorkflowProgram`、`collectDiagnostics`、`collectSites`、`collectWorldRunCommands`、`collectPhaseMarkerDiagnostics`、`collectArtifactDeclarations`、`toActorGraph`、`projectControlFlow`、`projectHandoffGraph`、`reduceOrdering`、`serializeCore`、`serializeCausalityGraph`、`serializeControlFlow`、`serializeHandoffGraph`、七个 `*ToMermaid`、`decodeAnalysisCore`/`encodeAnalysisCore`，以及常量 `SCRIPT_FILE_NAME`、`WORLD_RUN_LITERAL_CODE`、`PHASE_MARKER_CODE`、`ARTIFACT_DECLARATION_CODE`、`ARTIFACT_HOISTING_CODE`、`ARTIFACT_PRIMARY_CONFLICT_CODE`、`FANOUT_EXPAND_CAP`、`FLOW_ENTRY`/`FLOW_SINK`/`FLOW_ABORT`、`SINK_ID`、`UNKNOWN_LANE`、`WORKSPACE_LANE`、`UNPHASED`、`UNPHASED_ID` 与全部类型导出。
- `@knorvia/dynamic-workflow/projections` 桶（`src/projections.ts`）整体来自本包分析模块（浏览器安全子集，不得引入 `typescript` 运行时依赖）。
- 包内深层模块路径（本包之外的 import 方按相对路径引用，重写后必须原样存在）：`analysis/analyze`（`schema` 夹具与 `interpret` 消费）、`analysis/interpret`（`schema/actor-submit-profiles`）、`analysis/sites`、`analysis/facade-misuse`（`lowering/lower`）、`analysis/graph`、`analysis/causality-graph`、`analysis/causality-reduce`、`analysis/causality-order`、`analysis/causality-order-settle`（core 夹具按字符串路径 import）、`analysis/causality-order-strands`（同前）、`analysis/causality-graph-lanes`（同前）、`analysis/flow-graph`、`analysis/handoff-graph`、`analysis/core`（core 夹具）、`analysis/core-json`、`analysis/types`、`analysis/mermaid`（core 夹具）、`analysis/serialize`、`analysis/actor-graph`、`analysis/fanout-cardinality`（core 夹具）、`analysis/constants`、`compiler/compile`（core 夹具与 `lowering`/`schema`）。
- core 测试夹具用**字符串路径**动态 import `src/analysis/*` 与 `src/compiler/compile.ts`（`causality-reduction-fixture.ts`、`fanout-cardinality-fixture.ts`、`may-set-lane-expansion-fixture.ts`、`causality-order-settlement-fixture.ts`、`causality-order-strands-fixture.ts`），并 pin dist 产物 sha256；这些模块路径与导出名是兼容面的一部分（见 `callers.md`）。

## 逐文件导出（共 55 文件 / 283 项导出）

### `apps/cli/packages/dynamic-workflow/src/analysis/actor-graph.ts`

导出 4 项（机器生成，逐字取自源码签名）。

```ts
export interface ActorNode {
  /**
   * An actor-site id (`actor#1`); `"source"` / `"sink"` — the orchestrator's enter
   * and exit roles, kept unmerged so the graph reads as a pipeline; or `"workspace"`.
   */
  id: string;
  name?: string;
  loc?: SiteLoc;
  /** Enclosing promoted fan-out id when the actor site is a lane family (×N). */
  family?: string;
}
export interface ActorEdge {
  from: string;
  to: string;
  /** OR over the contributing site edges' exactness (a may-projection forces false). */
  exact: boolean;
  /** How many site data-edges collapsed into this actor edge. */
  count: number;
  /**
   * The producer artifact types carried by the contributing site edges — the message
   * types on this actor edge (provenance: values of these types flow `from` -> `to`).
   * Deduped, in contribution order (site-edge iteration order). Present iff non-empty;
   * contributing edges with no type (e.g. `source` edges) add nothing.
   */
  types?: string[];
}
export interface ActorGraph {
  nodes: ActorNode[];
  edges: ActorEdge[];
}
export function toActorGraph(graph: SiteGraph): ActorGraph;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/actor-names.ts`

导出 2 项（机器生成，逐字取自源码签名）。

```ts
export const FANOUT_ACTOR_NAME_CODE = 9006;
export function collectDuplicateActorNames(
  workflow: WorkflowProgram,
  table: SiteTable,
): CompileDiagnostic[];
```

### `apps/cli/packages/dynamic-workflow/src/analysis/analyze.ts`

导出 2 项（机器生成，逐字取自源码签名）。

```ts
export interface AnalyzeResult {
  diagnostics: CompileDiagnostic[];
  ok: boolean;
  /**
   * The all-in-one analysis artifact: taint
   * facts + temporal trace, position-free. `graph` and `causality` are pure projections
   * of it — deriving them again later needs the core only, never the script.
   */
  core?: AnalysisCore;
  graph?: SiteGraph;
  /** The presentation-level happens-before view. */
  causality?: CausalityGraph;
  /** Where execution can go next, per occurrence and per phase. */
  flow?: ControlFlowGraph;
  /** Who takes part in each phase and who hands off to whom. */
  handoff?: HandoffGraph;
  /**
   * 脚本声明的**用户面产物**：`[{id, kind}]`，去重、按 id
   * 排序。与 world.run 的命令集同族的编译产物——运行前就能说出这个工作流会产出什么。
   * 与图不同，它在诊断非空时**照常给出**（它是从站点表直接读的事实，不依赖解释）。
   */
  declaredArtifacts: DeclaredArtifact[];
}
export function analyzeWorkflowScript(scriptText: string): AnalyzeResult;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/array-methods.ts`

导出 1 项（机器生成，逐字取自源码签名）。

```ts
export function handleArrayMethod(
  ev: Evaluator,
  node: ts.CallExpression,
  cand: IterationCandidate,
  ctx: EvalContext,
): AbstractValue;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/artifact-types.ts`

导出 2 项（机器生成，逐字取自源码签名）。

```ts
export interface ArtifactTypes {
  /**
   * Whole-value artifact type per site, keyed by site id. Ask/world-read/join sites use
   * their final ids (`ask#1`); fan-out candidates are keyed by their PROVISIONAL id
   * (`fan-out@order`, see {@link provisionalFanoutId}) — the same key the taint pass
   * stamps into occurrences, so graph assembly looks them up before the `fan-out#N`
   * rename.
   */
  siteType: Map<string, string>;
  /**
   * Per-element awaited types of a join over a static array literal, keyed by join id.
   * Index i is the type of array element i (the join input at port i), or `undefined`
   * when that element's type is unknowable/uninformative. Absent for joins whose
   * argument is not a static array literal (no ports exist).
   */
  joinPortTypes: Map<string, (string | undefined)[]>;
}
export function computeArtifactTypes(workflow: WorkflowProgram, table: SiteTable): ArtifactTypes;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/artifacts.ts`

导出 6 项（机器生成，逐字取自源码签名）。

```ts
export const ARTIFACT_DECLARATION_CODE = 9007;
export const ARTIFACT_HOISTING_CODE = 9008;
export const ARTIFACT_PRIMARY_CONFLICT_CODE = 9009;
export interface DeclaredArtifact {
  id: string;
  /** 成员种类（`file` / `markdown` / `chart` / `table` / `metrics` / `board`）。 */
  kind: ArtifactOp;
}
export interface ArtifactDeclarations {
  /** 脚本声明的产物清单：去重、按 id 字典序（`declaredCommands` 的同形产物）。 */
  declaredArtifacts: DeclaredArtifact[];
  /** 定位诊断；非空即脚本不可提交。 */
  diagnostics: CompileDiagnostic[];
}
export function collectArtifactDeclarations(
  workflow: WorkflowProgram,
  table: SiteTable,
): ArtifactDeclarations;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/assign.ts`

导出 4 项（机器生成，逐字取自源码签名）。

```ts
export function handleAssignment(
  ev: Evaluator,
  node: ts.BinaryExpression,
  ctx: EvalContext,
): AbstractValue;
export function handleCompoundAssignment(
  ev: Evaluator,
  node: ts.BinaryExpression,
  ctx: EvalContext,
): AbstractValue;
export function bindForInitializer(
  ev: Evaluator,
  initializer: ts.ForInitializer,
  value: AbstractValue,
  ctx: EvalContext,
): void;
export function mergeIntoRootIdentifier(
  ev: Evaluator,
  expr: ts.Expression,
  value: AbstractValue,
): void;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/callbacks.ts`

导出 6 项（机器生成，逐字取自源码签名）。

```ts
export type CallbackMultiplicity = "each" | "once";
export interface CallbackSemantics {
  multiplicity: CallbackMultiplicity;
  /** Running the call provably runs the callback body (at least once). */
  entered: boolean;
  /** Argument indices that may hold callbacks, in order. */
  callbacks: readonly number[];
  /** Display / region label: the method or global function name. */
  label: string;
  /**
   * `once` only: the callback runs AFTER the receiver settles (a promise continuation, a
   * timer), not during the call. The ordering walk places the body at the call site and
   * opens it with a may-barrier over the receiver, so the receiver's steps precede the
   * callback's without the continuation being mistaken for a synchronous call.
   */
  deferred?: true;
  /** `each` only: the expression the callback is applied to element-wise. */
  iterated?: ts.Expression;
  /** `each` only: callback parameter indices that receive an ELEMENT. */
  elementParams?: readonly number[];
  /** `each` only: callback parameter indices that receive the WHOLE collection. */
  wholeParams?: readonly number[];
  /** `each` only: the callback parameter index that receives the accumulator (`reduce`). */
  accumulatorParam?: number;
}
export const DEFAULT_CALLBACK_SEMANTICS: Pick<CallbackSemantics, "multiplicity" | "entered"> = {
  entered: false,
  multiplicity: "once",
};
export function callbackSemanticsOf(
  node: ts.CallExpression | ts.NewExpression,
  checker: ts.TypeChecker,
  program: ts.Program,
): CallbackSemantics | undefined;
export function isGlobalLibValue(
  expr: ts.Expression,
  name: string,
  checker: ts.TypeChecker,
  program: ts.Program,
): boolean;
export function isForeignMember(
  name: ts.MemberName,
  checker: ts.TypeChecker,
  scriptFile: ts.SourceFile,
): boolean;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/calls.ts`

导出 5 项（机器生成，逐字取自源码签名）。

```ts
export function evalCall(ev: Evaluator, node: ts.CallExpression, ctx: EvalContext): AbstractValue
export function applyCall(
  ev: Evaluator,
  calleeExpr: ts.Expression,
  argVals: AbstractValue[],
  ctx: EvalContext,
  argPlaces?: (AbstractValue | undefined)[],
  tail?: AbstractValue,
  site?: ts.Node,
): AbstractValue
export function applyPessimistically(
  ev: Evaluator,
  source: AbstractValue,
  pot: AbstractValue,
  ctx: EvalContext,
  out: AbstractValue,
  site?: ts.Node,
): void
export function applyCallbackFns(
  ev: Evaluator,
  fns: readonly ts.Node[],
  actuals: AbstractValue[],
  regionStack: string[],
  site: ts.Node,
): AbstractValue
export function recordCall(
  ev: Evaluator,
  id: number,
  regionStack: string[],
  argVals: AbstractValue[],
  argPlaces?: (AbstractValue | undefined)[],
  application?:
```

### `apps/cli/packages/dynamic-workflow/src/analysis/causality-graph-lanes.ts`

导出 3 项（机器生成，逐字取自源码签名）。

```ts
export function expandMaySetLanes(graph: CausalityGraph): CausalityGraph;
export function dedupeFacts(facts: readonly Fact[]): Fact[];
export function weakest(values: readonly Certainty[]): Certainty;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/causality-graph-types.ts`

导出 12 项（机器生成，逐字取自源码签名）。

```ts
export type StepKind = "ask" | "world-read";
export type Certainty = "always" | "maybe";
export const WORKSPACE_LANE = "workspace";
export const UNKNOWN_LANE = "unknown";
export const SINK_ID = "sink";
export interface Step {
  /** A site id (`ask#3`, `world-read#1`); it is also the runtime instance's key. */
  id: string;
  kind: StepKind;
  label: string;
  /** `label` 只拿到兜底串时，内联 `agent()` receiver 的模板形状。 */
  labelPattern?: NamePattern;
  loc: SiteLoc;
  /** Actor site id, or `workspace` / `unknown`. For an unexpanded may-set, `lanes[0]`. */
  lane: string;
  /** Present only when the ask receiver is dynamically selected: the candidate lanes. */
  lanes?: string[];
  /**
   * The step this one was expanded from, emitted only on a may-set copy (see
   * `expandMaySetLanes` in causality-graph-lanes.ts). It is the site id a runtime instance
   * actually reports, which is what makes it the live overlay's join key (`source ?? id`
   * against `node.siteId`, narrowed by `node.actorSiteId === lane`).
   *
   * This composes with future per-callsite specialization rather than competing with it. Once
   * specialization lands, the expanded-from id IS the specialized site id —
   * `ask#3/2~actor#1` carries source `ask#3/2` — so the join stays stable under both
   * features. On a copy the field means "the site the runtime reports", NOT "the site
   * before specialization".
   */
  source?: string;
  /** Innermost enclosing region id. */
  region: string;
  certainty: Certainty;
  /**
   * The author-declared phase this step belongs to (`phase#2`, or the reserved
   * `unphased`). Present only when the script declares at least one `phase()` marker, in
   * which case EVERY step carries one — a step claimed by k>1 phases is expanded into k
   * copies to keep the partition total (see phase-graph.ts).
   */
  phase?: string;
  /**
   * How this step's instances relate when an enclosing region repeats:
   *   `stack`  — they coexist, which is the one multiplicity cue (stacked cards);
   *   `serial` — they follow one another, already visible as the cycle-closing arrow.
   * Absent when the step runs at most once. Finding: the cue splits on
   * CONCURRENCY, not cardinality — a step is `serial` exactly when a barrier inside
   * the repeating region settles it, or when a fixed actor's mailbox serializes it.
   */
  repeat?: "stack" | "serial";
}
export interface Region {
  id: string;
  kind: RegionKind;
  parent?: string;
  loc?: SiteLoc;
  /** Derivable literal round count of a `for`; model-only, never displayed. */
  bound?: number;
  label?: string;
}
export interface OrderEdge {
  from: string;
  to: string;
  kind: OrderKind;
  certainty: Certainty;
  /** `data` edges only: the taint witness path's exactness bit. Model-only. */
  exact?: boolean;
}
export interface Lane {
  id: string;
  /** The author's verbatim word, when `agent()` was given a literal. Never a reconstruction. */
  name?: string;
  /**
   * `name` 缺席而 `agent()` 首参是带洞的模板串时，那个名字的静态形状。省略号在渲染时才加。
   */
  namePattern?: NamePattern;
  loc?: SiteLoc;
  /**
   * Enclosing iteration regions of the `agent()` call, outermost first. A non-empty
   * list makes the lane a family — one fresh actor per element — and nested iterations
   * MULTIPLY, so multiplicity is the product and a single id cannot express it.
   */
  families?: string[];
}
export interface Phase {
  id: string;
  name?: string;
  loc?: SiteLoc;
}
export interface CausalityGraph {
  steps: Step[];
  regions: Region[];
  lanes: Lane[];
  edges: OrderEdge[];
  /** Step ids whose artifacts reach the script's return; absent when it returns nothing. */
  sink?: { fedBy: string[] };
  /**
   * The phase vocabulary, present TOGETHER WITH `phaseEdges` and `Step.phase` or not at
   * all: a script with no `phase()` markers gets none of the three and its graph is
   * byte-identical to what it was before the feature. `unphased` first when it has
   * members, then the author's phases in first-reach order.
   */
  phases?: Phase[];
  /** The quotient of `edges` by the phase partition. Never carries `exact`. */
  phaseEdges?: OrderEdge[];
}
export interface Fact {
  from: string;
  to: string;
  kind: OrderKind;
  certainty: Certainty;
  exact?: boolean;
  /** carry 边的底层 kind（改型前的前向 kind）；carry 最小化按它判见证强度。 */
  carryOf?: Exclude<OrderKind, "carry">;
  /**
   * 见证这条事实的 issue 事件所在的阶段集（**只有 await 屏障产生的 seq 事实**带它）。
   * 阶段拷贝按它收窄边的头端：屏障事实是在某一次具体 issue 上被见证的，而当前「一站点一步」
   * 的设计把同一站点在不同调用点的多次 issue 合成了一个 step，丢掉这个来源就会
   * 把「gate 的 bench 发出前 cargo test 已 settle」当成 preflight 的 bench 也成立——
   * 一条方向错误的时间断言（多序是被许可的，错序不是）。
   *
   * 缺席 = 无来源信息 = 头端全展开（data/control/fifo 与区域重复事实按契约全展开）。
   *
   * 尾端没有对称的来源信息（settle 事件不带阶段），但**尾侧不再是缺口**：阶段拷贝的时间
   * 可行性判定（phase-graph.ts 的 `admits`）按位置对**两端**一视同仁地拦截，所以「拷贝排
   * 在产出它自己实参的那个 step 之前」这类伪边由那条规则消掉，不靠这里的来源信息。
   */
  toPhases?: Set<string>;
  /**
   * 这条 `seq` 事实只能靠**下一轮**成立：`from` 在一个以 `continue` 结束的分支臂里发出，
   * `to` 在同一个循环体里更靠后的位置。线性的时间走查按 may 语义会继续走完循环体，于是
   * 把「fixer@k 先于 juries@k+1」记成了同一轮的前向顺序；控制流投影对同一处给的是
   * `loop via=continue`。带此标记的事实在回边定型时按 carry 处理（配对里全部事实都带才算，
   * 见 `dedupeFacts`，causality-graph-lanes.ts）。以 `break` 结束的臂更强：其中的 step 根本
   * 不可能先于同一循环里后面的 step，那样的事实直接不发。
   */
  viaJump?: true;
}
```

### `apps/cli/packages/dynamic-workflow/src/analysis/causality-graph.ts`

导出 1 项（机器生成，逐字取自源码签名）。

```ts
export function projectCausalityGraph(core: AnalysisCore, site: SiteGraph): CausalityGraph;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/causality-order-calls.ts`

导出 2 项（机器生成，逐字取自源码签名）。

```ts
export function walkCall(
  state: TraceState,
  node: ts.CallExpression,
  chain: readonly string[],
): void;
export function applyAt(
  state: TraceState,
  node: ts.CallExpression | ts.NewExpression | ts.TaggedTemplateExpression,
  chain: readonly string[],
  handled: ReadonlySet<ts.Node> = new Set(),
  receiverIssues: readonly string[] = [],
): void;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/causality-order-functions.ts`

导出 7 项（机器生成，逐字取自源码签名）。

```ts
export type ScriptFunction = ts.SignatureDeclaration & { body: ts.Node };
export function boundIdentifiers(name: ts.BindingName): ts.Identifier[];
export function asScriptFunction(
  node: ts.Node,
  scriptFile: ts.SourceFile,
): ScriptFunction | undefined;
export function enclosingFunctions(node: ts.Node): ScriptFunction[];
export function functionName(decl: ts.Node): string | undefined;
export function resolveCallDeclaration(
  call: ts.CallExpression,
  checker: ts.TypeChecker,
  scriptFile: ts.SourceFile,
): ScriptFunction | undefined;
export function collectRecursiveFunctions(
  scriptFile: ts.SourceFile,
  checker: ts.TypeChecker,
  applications: ReadonlyMap<ts.Node, ReadonlyMap<ts.Node, ApplicationVia>>,
): Set<ts.Node>;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/causality-order-loops.ts`

导出 1 项（机器生成，逐字取自源码签名）。

```ts
export function walkLoop(state: TraceState, node: ts.Node, chain: readonly string[]): boolean;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/causality-order-settle.ts`

导出 4 项（机器生成，逐字取自源码签名）。

```ts
export function settlesAt(state: TraceState, node: ts.Node, at: number): OracleClaim;
export function barrier(
  state: TraceState,
  certain: readonly string[],
  maybe: readonly string[],
  chain: readonly string[],
  awaited?: AwaitedOperand,
): void;
export function bindSteps(state: TraceState, name: ts.BindingName, steps: readonly string[]): void;
export function recordControl(state: TraceState, guard: ts.Expression, region: string): void;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/causality-order-state.ts`

导出 10 项（机器生成，逐字取自源码签名）。

```ts
export interface TraceState {
  readonly scriptFile: ts.SourceFile;
  readonly program: ts.Program;
  readonly checker: ts.TypeChecker;
  readonly toScriptLoc: WorkflowProgram["toScriptLoc"];
  readonly oracle: OrderOracle;
  readonly body: ts.Block;
  // --- Site indexes, by call node ---------------------------------------------------
  readonly askByCall: ReadonlyMap<ts.Node, string>;
  readonly readByCall: ReadonlyMap<ts.Node, string>;
  readonly actorByCall: ReadonlyMap<ts.Node, string>;
  /** Per-element callback calls by CALL node (the fan-out region opens there). */
  readonly candByCall: ReadonlyMap<ts.Node, IterationCandidate>;
  /** Their inline literals (an iteration construct for the admission test). */
  readonly candByCallback: ReadonlyMap<ts.Node, IterationCandidate>;
  /**
   * A function applied per element at a candidate call (`xs.map(review)`) encloses its
   * steps in an iteration exactly as an inline callback literal does.
   */
  readonly eachCallbackFns: ReadonlySet<ts.Node>;
  readonly recursive: ReadonlySet<ts.Node>;
  /**
   * Only real steps can be ordered. An occurrence set may also carry join and fan-out
   * labels, which are relays, not things that take time.
   */
  readonly realSteps: ReadonlySet<string>;
  readonly callByStep: ReadonlyMap<string, ts.Node>;
  readonly iterationAncestorCache: Map<ts.Node, Set<ts.Node>>;
  // --- Trace accumulators -----------------------------------------------------------
  readonly events: OrderEvent[];
  readonly regions: OrderRegion[];
  readonly controls: ControlFact[];
  readonly counters: Map<TraceRegionKind, number>;
  readonly issued: Set<string>;
  // --- Strands: one frame per open asynchronous activation --------------------------
  // A barrier settles steps for the strand it stands in and for strands spawned later
  // inside it, never for the spawner — so the settled set is per FRAME (root frame
  // first) and `isVisiblySettled` asks the whole stack. `issued` stays global: from any
  // frame's view everything issued earlier is in flight until visibly settled, which is
  // what widening needs. See causality-order-strands.ts.
  readonly frames: Frame[];
  /** Every strand the walk spawned, in spawn order; `joined` is the ones already awaited. */
  readonly strands: StrandRecord[];
  readonly joined: Set<string>;
  /** Which strands a variable may hold the promise of — the syntactic half of the join. */
  readonly strandsBySymbol: Map<ts.Symbol, Set<string>>;
  // --- Jump-target bookkeeping (control-flow projection) ----------------------------
  // Innermost-first stacks of the regions a `return` / `throw` lands on, and the region each
  // loop / switch STATEMENT opened — set while its body is walked, so a helper inlined twice
  // resolves each occurrence's jumps to that occurrence's own region.
  readonly returnTargets: string[];
  readonly throwTargets: string[];
  readonly regionByStatement: Map<ts.Node, string>;
  /** decl -> the `loop` region its SCC entry opened; where a re-entrant call `recur`s to. */
  readonly sccLoopByDecl: Map<ts.Node, string>;
  /**
   * Which steps a variable may hold the answer of. The syntactic half of the control
   * relation: it catches implicit flows the taint oracle cannot see, because a condition
   * never joins the data contract (`const flag = (await ask()) ? 1 : 2` taints nothing).
   */
  readonly stepsBySymbol: Map<ts.Symbol, Set<string>>;
  readonly walkedFns: Set<ts.Node>;
  readonly fnStack: ts.Node[];
  // --- Phase state: the author's grouping, threaded through the walk ----------------
  // The extent of `phase("gate")` is REST-OF-BLOCK, so the state is one mutable
  // "current phase" plus a save/restore around every statement list (`walkStatements`).
  // Nested blocks and inlined helper bodies therefore inherit it for free, and the
  // marker's effect dies with the list it stood in — which IS rest-of-block.
  readonly markerByStatement: ReadonlyMap<ts.Node, PhaseMarkerSite>;
  readonly phases: PhaseInfo[];
  readonly phaseIdByName: Map<string, string>;
  currentPhase: string;
  /** The root `seq` region id; every other region descends from it. */
  readonly root: string;
  /** The node visitor, bound to this state so every module can recurse without a cycle. */
  readonly walk: (node: ts.Node, chain: readonly string[]) => void;
}
export function applicationsAt(
  state: Pick<TraceState, "oracle" | "scriptFile">,
  node: ts.Node,
  via: ApplicationVia,
): ScriptFunction[]
export function openRegion(
  state: Pick<TraceState, "counters" | "regions">,
  kind: TraceRegionKind,
  parent: string | undefined,
  extra:
export function createTraceState(
  workflow: WorkflowProgram,
  table: SiteTable,
  oracle: OrderOracle,
  walk: (state: TraceState, node: ts.Node, chain: readonly string[]) => void,
): TraceState
export function locOf(state: TraceState, node: ts.Node): ScriptLoc
export function innermost(state: TraceState, chain: readonly string[]): string
export function issue(state: TraceState, step: string, chain: readonly string[]): void
export function jump(
  state: TraceState,
  kind: JumpKind,
  target: string,
  chain: readonly string[],
): void
export function issuesSince(state: TraceState, mark: number): string[]
export function phaseIdOf(state: TraceState, marker: PhaseMarkerSite): string | undefined
```

### `apps/cli/packages/dynamic-workflow/src/analysis/causality-order-strands.ts`

导出 13 项（机器生成，逐字取自源码签名）。

```ts
export interface Frame {
  readonly region: string;
  readonly settled: Set<string>;
}
export interface StrandRecord {
  /** The `call` / `fanout` region that IS the strand. */
  readonly region: string;
  /**
   * Spawn order: this record's own index in `state.strands`. A barrier joins every strand
   * with `at >= the count it saw when it took its mark`, which is "spawned while the
   * operand was evaluated". Deliberately NOT an event index: a strand that emits no event
   * before the await inside it would then tie with that await's mark, and the barrier
   * would join the very strand it stands in (`await ask()` as the first statement of an
   * `async` helper settled the helper's own summary into its own frame).
   */
  readonly at: number;
  /** Steps issued inside it (the innermost open strand at each issue) — the lift rule. */
  readonly issued: Set<string>;
  /** What the strand itself awaited: its frame's settled set at close. */
  summary: ReadonlySet<string>;
  /** False until the body finished. Only a CLOSED strand can be lifted. */
  closed: boolean;
}
export interface AwaitedOperand {
  /** `state.strands.length` where the operand's evaluation began. */
  mark: number;
  operand: ts.Expression;
}
export function currentFrame(state: TraceState): Frame
export function isVisiblySettled(state: TraceState, step: string): boolean
export function innermostOpenStrand(state: TraceState): StrandRecord | undefined
export function openStrand(state: TraceState, region: string): StrandRecord
export function closeStrand(state: TraceState, record: StrandRecord): void
export function strandMark(state: TraceState): number
export function strandsSince(state: TraceState, mark: number): string[]
export function bindStrands(
  state: TraceState,
  name: ts.BindingName,
  regions: readonly string[],
): void
export function isAsyncFunction(decl: ts.Node): boolean
export function joinStrands(
  state: TraceState,
  certain: readonly string[],
  maybe: readonly string[],
  awaited: AwaitedOperand | undefined,
):
```

### `apps/cli/packages/dynamic-workflow/src/analysis/causality-order-types.ts`

导出 11 项（机器生成，逐字取自源码签名）。

```ts
export interface OrderOracle {
  /** Step occurrences the operand of each `await` carries. */
  awaitSettles: Map<number, TaintOcc[]>;
  /** Step occurrences each guard expression reads. */
  guardReads: Map<number, TaintOcc[]>;
  /**
   * The call oracle: per call / `new` / tagged-template node, the script functions the
   * interpreter applied there and how (`TaintState.applications`). The walk inlines exactly
   * these bodies at exactly these sites.
   */
  applications: ReadonlyMap<ts.Node, ReadonlyMap<ts.Node, ApplicationVia>>;
}
export interface OrderRegion {
  id: string;
  kind: TraceRegionKind;
  parent?: string;
  loc?: ScriptLoc;
  /** Derivable literal round count of a `for` loop; model-only (never displayed). */
  bound?: number;
  /** fanout: the iterated expression; loop: the recursive helper's name; call: the helper's name. */
  label?: string;
  /**
   * True iff running the parent provably runs this region's body at least once: a
   * `do…while` body, a `for` whose literal bound is positive, or an inlined call.
   * Drives the certainty carve-out.
   */
  entered: boolean;
  /** choice: one arm MUST run (if/else, ternary, switch with default). Absent = skippable. */
  exhaustive?: boolean;
  /**
   * loop: a recursion SCC folded into a loop, not a loop statement. Only re-entrant calls
   * (`recur` jumps) close it; its body completing normally is the helper returning.
   */
  recursive?: boolean;
  /** choice: an arm completing normally continues into the next arm (switch). */
  fallthrough?: boolean;
  /**
   * branch: a never-called function body the end-of-walk sweep placed here. It runs at
   * an unknown point, if at all; its position in the stream is an artifact of the sweep.
   */
  detached?: boolean;
  /**
   * `call` / `fanout` only: this region is a STRAND — one asynchronous activation that
   * runs alongside the body that spawned it (an inlined `async` body, or a deferred
   * callback). Its `await`s suspend the strand, never the spawner, so the walk gives it a
   * settled set of its own and the spawner learns of its completion only by awaiting its
   * promise ({@link SettleEvent.joins}).
   */
  strand?: true;
}
export interface PhaseInfo {
  id: string;
  /** The author's verbatim word. Always present — a nameless marker never mints a phase. */
  name: string;
  /** The first marker that minted this phase; later same-name markers do not move it. */
  loc: ScriptLoc;
}
export interface IssueEvent {
  at: "issue";
  step: string;
  regions: readonly string[];
  /**
   * The phase current where the call was evaluated — {@link UNPHASED_ID} outside every
   * marker's extent. Issue is the step's identity moment, so this is the whole of phase
   * membership.
   */
  phase: string;
}
export interface SettleEvent {
  at: "settle";
  /**
   * EMPTY when the barrier only joined strands: awaiting a strand whose summary is
   * already settled (or empty) settles nothing new, but the join itself is a control-flow
   * fact — it is where the strand's parked exits reconnect — so the event is still
   * recorded. Readers iterate `steps` and see nothing; readers of {@link joins} see the
   * join. `maybe` is meaningless on such an event and is written `false`.
   */
  steps: readonly string[];
  /**
   * True when this settle is a MAY-claim rather than a certainty. Two sources: the
   * barrier widened (nothing resolvable settled here, so everything in flight is assumed
   * to have), or the oracle's witness set was ambiguous — several witnesses, of which
   * exactly one settles at runtime, or a single inexact one smeared through a container.
   */
  maybe: boolean;
  /** Region chain the barrier sits in — a loop's carry edge needs to know. */
  regions: readonly string[];
  /**
   * The STRAND regions this barrier waits for, in join order: the strands whose promises
   * the awaited expression names (spawned while it was evaluated, or bound to an
   * identifier in an awaited position) plus the ones lifted because a settled step was
   * issued inside them. A strand joins once — a second await of the same promise lists
   * nothing. Absent when the barrier joins no strand.
   */
  joins?: string[];
}
export interface ActorEvent {
  at: "actor";
  actor: string;
  regions: readonly string[];
}
export interface MarkEvent {
  at: "mark";
  /** The phase current from here to the end of the enclosing statement list. */
  phase: string;
  regions: readonly string[];
}
export interface JumpEvent {
  at: "jump";
  kind: JumpKind;
  target: string;
  regions: readonly string[];
  /** The phase current where the jump was evaluated (a phase CFG edge leaves from here). */
  phase: string;
}
export type OrderEvent = IssueEvent | SettleEvent | ActorEvent | MarkEvent | JumpEvent;
export interface ControlFact {
  /** Controllers the analysis is sure of: a syntactic witness, or a singleton-exact one. */
  controllers: readonly string[];
  /** Controllers only the ambiguous half of the oracle claims; disjoint from the above. */
  maybeControllers: readonly string[];
  region: string;
}
export interface OrderTrace {
  events: OrderEvent[];
  regions: OrderRegion[];
  controls: ControlFact[];
  /** The root `seq` region id; every other region descends from it. */
  root: string;
  /**
   * Phases the walk reached, in first-reach order. Empty for a script with no markers,
   * which is what makes the whole phase vocabulary absent downstream. {@link UNPHASED_ID}
   * is NOT listed here — it is synthetic, and the projection adds it only if it has
   * members.
   */
  phases: PhaseInfo[];
}
```

### `apps/cli/packages/dynamic-workflow/src/analysis/causality-order-walk.ts`

导出 2 项（机器生成，逐字取自源码签名）。

```ts
export function walkStatements(
  state: TraceState,
  statements: readonly ts.Statement[],
  chain: readonly string[],
): void;
export function walkNode(state: TraceState, node: ts.Node, chain: readonly string[]): void;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/causality-order.ts`

导出 1 项（机器生成，逐字取自源码签名）。

```ts
export function traceOrder(
  workflow: WorkflowProgram,
  table: SiteTable,
  oracle: OrderOracle,
): OrderTrace;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/causality-reduce.ts`

导出 4 项（机器生成，逐字取自源码签名）。

```ts
export type OrderKind = "data" | "control" | "fifo" | "seq" | "carry";
export const KIND_RANK: Record<OrderKind, number> = {
  carry: 0,
  control: 4,
  data: 3,
  fifo: 2,
  seq: 1,
};
export interface ReducibleEdge {
  from: string;
  to: string;
  kind: OrderKind;
  /** Forward kind used to judge a carry witness; omitted values use data. */
  carryOf?: Exclude<OrderKind, "carry">;
}
export function reduceOrdering<E extends ReducibleEdge>(edges: readonly E[]): E[];
```

### `apps/cli/packages/dynamic-workflow/src/analysis/classes.ts`

导出 8 项（机器生成，逐字取自源码签名）。

```ts
export function evalClasses(ev: Evaluator): void;
export function resolveClassNode(ev: Evaluator, expr: ts.Expression): ts.Node | undefined;
export function classNodeOfSymbol(
  ev: Evaluator,
  sym: ts.Symbol,
  seen = new Set<ts.Symbol>(),
): ts.Node | undefined;
export function classConstructor(
  ev: Evaluator,
  cls: ts.Node,
  seen = new Set<ts.Node>(),
): ts.ConstructorDeclaration | undefined;
export function enclosingClassInstance(ev: Evaluator, node: ts.Node): AbstractValue | undefined;
export function enclosingBaseInstance(ev: Evaluator, node: ts.Node): AbstractValue | undefined;
export function hasUnresolvedHeritage(ev: Evaluator, cls: ts.Node): boolean;
export function applySuperCall(ev: Evaluator, node: ts.CallExpression, ctx: EvalContext): void;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/constants.ts`

导出 6 项（机器生成，逐字取自源码签名）。

```ts
export type RegionKind = "seq" | "parallel" | "loop" | "fanout" | "branch" | "shared";
export type StructuralRegionKind = "choice" | "call" | "try" | "attempt" | "catch" | "finally";
export type TraceRegionKind = RegionKind | StructuralRegionKind;
export function isStructuralRegionKind(kind: TraceRegionKind): kind is StructuralRegionKind;
export const UNPHASED_ID = "unphased";
export type JumpKind = "continue" | "break" | "return" | "throw" | "recur";
```

### `apps/cli/packages/dynamic-workflow/src/analysis/control-flow.ts`

导出 3 项（机器生成，逐字取自源码签名）。

```ts
export function visitForStatement(ev: Evaluator, node: ts.ForStatement, ctx: EvalContext): void;
export function handleForOf(ev: Evaluator, node: ts.ForOfStatement, ctx: EvalContext): void;
export function handleForIn(ev: Evaluator, node: ts.ForInStatement, ctx: EvalContext): void;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/core-json.ts`

导出 4 项（机器生成，逐字取自源码签名）。

```ts
export type MapEntries<V> = [string, V][];
export interface AnalysisCoreJson {
  /** 格式版本；解码器只认识它认得的版本，其余抛错而不是猜。 */
  version: 1;
  sites: CoreSites;
  facts: {
    askData: MapEntries<TaintOcc[]>;
    askActor: MapEntries<TaintOcc[]>;
    worldReadData: MapEntries<TaintOcc[]>;
    joinIn: MapEntries<TaintOcc[]>;
    fanoutIn: MapEntries<TaintOcc[]>;
    returnData: TaintOcc[];
  };
  trace: OrderTrace;
  types: {
    siteType: MapEntries<string>;
    /** 端口类型的洞（`undefined`）在这里是 `null`——JSON 数组里没有 `undefined`。 */
    joinPortTypes: MapEntries<(string | null)[]>;
  };
}
export function encodeAnalysisCore(core: AnalysisCore): AnalysisCoreJson;
export function decodeAnalysisCore(json: AnalysisCoreJson): AnalysisCore;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/core.ts`

导出 10 项（机器生成，逐字取自源码签名）。

```ts
export interface CoreAskSite {
  id: string;
  order: number;
  label: string;
  labelPattern?: NamePattern;
  loc: ScriptLoc;
  within?: string;
}
export interface CoreSimpleSite {
  id: string;
  order: number;
  label: string;
  loc: ScriptLoc;
  within?: string;
}
export interface CoreActorSite {
  id: string;
  order: number;
  loc: ScriptLoc;
  name?: string;
  namePattern?: NamePattern;
  within?: string;
}
export interface CoreFanoutSite {
  id: string;
  order: number;
  label: string;
  loc: ScriptLoc;
  within?: string;
  /**
   * 字面量基数：被迭代的是无展开的数组字面量
   * 或从未被写入的 `const` 字面量绑定时的元素个数；其余缺席。铸造期算好，投影只读。
   */
  cardinality?: number;
}
export interface CoreSites {
  asks: CoreAskSite[];
  worldReads: CoreSimpleSite[];
  joins: CoreSimpleSite[];
  actors: CoreActorSite[];
  fanouts: CoreFanoutSite[];
}
export interface CoreFacts {
  askData: Map<string, TaintOcc[]>;
  askActor: Map<string, TaintOcc[]>;
  worldReadData: Map<string, TaintOcc[]>;
  joinIn: Map<string, TaintOcc[]>;
  fanoutIn: Map<string, TaintOcc[]>;
  returnData: TaintOcc[];
}
export interface CoreTypes {
  /** Whole-value artifact type per producer site. */
  siteType: Map<string, string>;
  /** Per-element awaited types of a join over a static array literal. */
  joinPortTypes: Map<string, (string | undefined)[]>;
}
export interface AnalysisCore {
  sites: CoreSites;
  facts: CoreFacts;
  /** The raw temporal trace — issue/settle/spawn events, regions, controls, phases. */
  trace: OrderTrace;
  types: CoreTypes;
}
export function isActorSite(site: string): boolean;
export function serializeCore(core: AnalysisCore): string;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/domain.ts`

导出 34 项（机器生成，逐字取自源码签名）。

```ts
export interface TaintOcc {
  site: string;
  exact: boolean;
  port?: number;
}
export interface Placeholder {
  fnId: number;
  param: number;
  /**
   * A rest parameter (`...parts`) is a single formal that gathers every actual at
   * index >= `param`. Resolution (substitute in calls.ts, emitFacts in state.ts)
   * unions ALL those actuals into the formal rather than the single positional one.
   */
  rest?: boolean;
}
export interface AbstractValue {
  /** Keyed by `${site}|${port ?? ""}`. */
  occs: Map<string, TaintOcc>;
  /** Keyed by `${fnId}:${param}`. */
  phs: Map<string, Placeholder>;
  fields: Map<string, AbstractValue>;
  fns: Set<ts.Node>;
  /**
   * A partial-application prefix from `Function.prototype.bind`: `f.bind(null, a)` yields
   * a value carrying f in `fns` plus `bound = [a]`. At the eventual call the prefix is
   * PREPENDED to the actuals (`applyToFns`), so `g()` reaches f's param 0 as `a`. Rebinding
   * composes (earlier bind's args first). Because `fns` is a set, a merged bound/plain
   * value (`flag ? f : f.bind(null, a)`) can't say which fn is bound, so application unions
   * BOTH alignments (with and without the prefix) — sound either way. Undefined for the
   * overwhelmingly common non-bound value (kept off the hot path).
   */
  bound?: AbstractValue[];
  /**
   * MAY-ALIAS back-references: live places a WRITE through this value must ALSO weakly
   * reach, because at runtime this value may BE one of them. Set for a conditional binding
   * (`const a = flag ? box1 : box2` → a's value may-aliases box1 AND box2) and for a
   * `Promise.all` result element that aliases its (place) input. Consulted ONLY at the
   * write primitives ({@link replayMayAliasWrite} in writeField / handleHeapMutator): the
   * write is replayed into each target INEXACTLY (it happens on one arm only — never a
   * strong update), recursing into each target's OWN mayAlias (chained aliases). A Set so
   * unions dedup by slot IDENTITY (loop-carried merges stay finite → the fixpoint
   * terminates). Undefined for the overwhelmingly common non-aliased value.
   *
   * That termination argument has a PREMISE — the **canonical-heap invariant**: every
   * target is drawn from the pass-stable heap, i.e. values keyed by a static program point
   * and created once for the whole fixpoint (env slots per symbol, class instances per
   * class, join results per join call, conditional places per ternary node, and the
   * persistent fields of any of those). A per-pass temporary must NEVER become a target:
   * identity dedup cannot recognize it, so each pass would add one more member, `changed`
   * would stay true forever, and the analysis would hit `ITERATION_CAP` instead of
   * converging (state.ts `joinResultOf` / `condPlaceOf` record the two repros that did).
   */
  mayAlias?: Set<AbstractValue>;
}
export function emptyValue(): AbstractValue
export function phKey(ph: Placeholder): string
export function addOcc(target: AbstractValue, occ: TaintOcc): boolean
export function addPlaceholder(target: AbstractValue, ph: Placeholder): boolean
export const VALUE_DEPTH_CAP = 8
export function mergeInto(target: AbstractValue, source: AbstractValue, depth = 0): boolean
export function mergeBound(
  target: AbstractValue,
  sourceBound: AbstractValue[],
  depth: number,
): boolean
export function cloneValue(v: AbstractValue): AbstractValue
export function unionValues(...values: AbstractValue[]): AbstractValue
export function singleOcc(site: string, exact: boolean, port?: number): AbstractValue
export function collapse(v: AbstractValue): AbstractValue
export function collapseInto(
  out: AbstractValue,
  v: AbstractValue,
  seen = new Set<AbstractValue>(),
): boolean
export function readField(container: AbstractValue, key: string): AbstractValue
export function clearExact(v: AbstractValue): AbstractValue
export function provisionalFanoutId(order: number): string
export const HEAP_MUTATORS = new Set<string>(["push", "unshift", "splice", "set", "add"])
export const COMPOUND_ASSIGNMENT_OPS = …
export function findWorkflowBody(scriptFile: ts.SourceFile): ts.Block
export function isFunctionLike(node: ts.Node): boolean
export function isNonArrowFunctionLike(node: ts.Node): boolean
export function isDirectCallee(callee: ts.Expression): boolean
export function isJsonStringify(access: ts.PropertyAccessExpression): boolean
export function staticIndexKey(arg: ts.Expression): string | undefined
export function peelPlace(expr: ts.Expression): ts.Expression
export function liveField(container: AbstractValue, key: string): AbstractValue
export function replayMayAliasWrite(
  container: AbstractValue,
  key: string,
  value: AbstractValue,
): boolean
export function replayMayAliasMerge(container: AbstractValue, value: AbstractValue): boolean
export function adoptFields(target: AbstractValue, source: AbstractValue): boolean
export function bindingPropertyKey(element: ts.BindingElement): string | undefined
export interface TaintFacts {
  /** Artifact occurrences reaching each ask instruction (data in-edges to the ask). */
  askData: Map<string, TaintOcc[]>;
  /** Actor occurrences of each ask receiver (drive the context relation). */
  askActor: Map<string, TaintOcc[]>;
  /** Artifact occurrences reaching each world-read argument. */
  worldReadData: Map<string, TaintOcc[]>;
  /** Artifact occurrences reaching each join, carrying the join input port. */
  joinIn: Map<string, TaintOcc[]>;
  /** Artifact occurrences reaching each promoted fan-out (provisional id). */
  fanoutIn: Map<string, TaintOcc[]>;
  /** Artifact occurrences reaching the script's return expression(s). */
  returnData: TaintOcc[];
  /** Promoted iteration candidates, in source order; `id` is provisional (`fan-out@N`). */
  promoted: PromotedFanout[];
}
export interface PromotedFanout {
  order: number;
  id: string;
  loc: ScriptLoc;
  label: string;
}
```

### `apps/cli/packages/dynamic-workflow/src/analysis/facade-misuse.ts`

导出 1 项（机器生成，逐字取自源码签名）。

```ts
export function collectFacadeMisuse(
  workflow: WorkflowProgram,
  table: SiteTable,
): CompileDiagnostic[];
```

### `apps/cli/packages/dynamic-workflow/src/analysis/fanout-cardinality.ts`

导出 1 项（机器生成，逐字取自源码签名）。

```ts
export function literalCardinality(
  iterated: ts.Expression,
  checker: ts.TypeChecker,
): number | undefined;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/flow-graph.ts`

导出 12 项（机器生成，逐字取自源码签名）。

```ts
export type FlowNodeKind = "issue" | "mark";
export interface FlowNode {
  /** `${step}@${k}` — the k-th issue of that step; `${phase}@${k}` for a mark. */
  id: string;
  kind: FlowNodeKind;
  /** issue: the step's site id. */
  site?: string;
  /** The phase current at this leaf (a mark's is the phase it switched TO). */
  phase: string;
  /**
   * mark only: the phases whose strands are still running when this marker is entered —
   * every strand parked here, minus this node's own phase and minus any strand the marker
   * sits inside. In the trace's phase-table order, absent when empty. Flow-insensitive
   * across choice arms, like the walk's `issued` set: over-claiming "may run alongside" is
   * the licensed direction.
   */
  alongside?: string[];
  /** Inside a never-called body the sweep placed: runs at an unknown point, if at all. */
  detached?: true;
}
export type FlowEdgeKind =
  | "next" // sequential successor
  | "branch" // choice head -> an arm; or, for a skippable choice, head -> what follows it
  | "loop" // loop back edge (body end, `continue`, `recur`)
  | "exit" // loop exit (normal, `break`, or a never-entered loop skipped)
  | "fork" // into a fan-out body or a strand
  | "join" // out of one, at the barrier that joins it, or at the sink when nothing does
  | "jump" // `return` out of a call, or to the sink
  | "throw" // explicit `throw` -> catch entries or abort
  | "may-throw";
export type FlowVia = "continue" | "break" | "return" | "recur";
export interface FlowEdge {
  from: string;
  to: string;
  kind: FlowEdgeKind;
  /** The jump statement kind behind a `loop` / `exit` / `jump` / `join` edge, when any. */
  via?: FlowVia;
}
export interface FlowPhase {
  id: string;
  /** Absent for {@link UNPHASED_ID}. */
  name?: string;
  /** The first marker that minted the phase; absent for {@link UNPHASED_ID}. */
  loc?: ScriptLoc;
  /**
   * Phases whose strands were still running when this one was entered: the union of
   * {@link FlowNode.alongside} over the phase's mark nodes, in phase-table order, absent
   * when empty. All-or-nothing with the rest of the phase vocabulary.
   */
  alongside?: string[];
}
export const FLOW_ENTRY = "entry";
export const FLOW_SINK = "sink";
export const FLOW_ABORT = "abort";
export interface ControlFlowGraph {
  /** Leaf-stream order; detached nodes last (the sweep runs after the main walk). */
  nodes: FlowNode[];
  /** Canonical order: by from-node, to-node, kind, via; `entry` first, terminals last. */
  edges: FlowEdge[];
  /**
   * The phase quotient, present iff the script declares a phase (all-or-nothing, exactly
   * like the causality graph's `phaseEdges`). Same-phase edges dissolve except `loop`
   * back edges, which stay as self-loops.
   */
  phaseEdges?: FlowEdge[];
  /** Phases that appear on some node, in first-reach order, {@link UNPHASED_ID} first. */
  phases?: FlowPhase[];
}
export interface Src {
  from: string;
  kind: FlowEdgeKind;
  via?: FlowVia;
}
export function projectControlFlow(core: AnalysisCore): ControlFlowGraph;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/flow-phase.ts`

导出 2 项（机器生成，逐字取自源码签名）。

```ts
export function collectFlowPhases(trace: OrderTrace, nodes: readonly FlowNode[]): FlowPhase[];
export function quotientFlow(
  nodes: readonly FlowNode[],
  edges: readonly FlowEdge[],
  phases: readonly FlowPhase[],
): FlowEdge[];
```

### `apps/cli/packages/dynamic-workflow/src/analysis/flow-strands.ts`

导出 1 项（机器生成，逐字取自源码签名）。

```ts
export function createStrandPark(phases: readonly PhaseInfo[]): StrandPark;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/flow-tree.ts`

导出 4 项（机器生成，逐字取自源码签名）。

```ts
export interface RegionNode {
  type: "region";
  region: OrderRegion;
  children: TreeNode[];
  /** Index of the first leaf in this subtree; Infinity when it holds none. */
  first: number;
}
export interface LeafNode {
  type: "leaf";
  event: OrderEvent;
  index: number;
}
export type TreeNode = RegionNode | LeafNode;
export function buildTree(trace: OrderTrace):
```

### `apps/cli/packages/dynamic-workflow/src/analysis/graph.ts`

导出 1 项（机器生成，逐字取自源码签名）。

```ts
export function projectSiteGraph(core: AnalysisCore): SiteGraph;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/handoff-graph.ts`

导出 6 项（机器生成，逐字取自源码签名）。

```ts
export interface HandoffParticipant {
  /** `${phase}:${lane}`，家族成员 `${phase}:${lane}[${index}]`。 */
  id: string;
  /** 阶段 id；脚本无阶段词汇时恒为 `unphased`。 */
  phase: string;
  /** 车道 id：actor 站点 id、`workspace` 或 `unknown`。 */
  lane: string;
  /** 该阶段内落在这条车道上的 step id，源码序，至少一个。 */
  steps: string[];
  /** 字面量基数展开出的成员。 */
  member?: { index: number; of: number };
  /** 基数未知（或超过展开上限）的家族：一张卡代表全部成员。 */
  many?: true;
}
export interface Handoff {
  from: string;
  to: string;
  /** 全部贡献边都是循环回边（carry）。 */
  back?: true;
  /** 阶段内 from 卡的站点 → to 卡的站点的 `data` 边产物类型，按贡献序去重。 */
  types?: string[];
}
export interface HandoffGraph {
  participants: HandoffParticipant[];
  handoffs: Handoff[];
}
export const UNPHASED = "unphased";
export const FANOUT_EXPAND_CAP = 8;
export function projectHandoffGraph(
  core: AnalysisCore,
  causality: CausalityGraph,
  sites: SiteGraph,
): HandoffGraph;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/heap-ops.ts`

导出 3 项（机器生成，逐字取自源码签名）。

```ts
export function isObjectAssign(access: ts.PropertyAccessExpression): boolean;
export function handleHeapMutator(
  ev: Evaluator,
  node: ts.CallExpression,
  access: ts.PropertyAccessExpression,
  ctx: EvalContext,
): AbstractValue;
export function handleObjectAssign(
  ev: Evaluator,
  node: ts.CallExpression,
  ctx: EvalContext,
): AbstractValue;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/interpret.ts`

导出 1 项（机器生成，逐字取自源码签名）。

```ts
export function interpret(workflow: WorkflowProgram, table: SiteTable): AnalysisCore;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/literals.ts`

导出 2 项（机器生成，逐字取自源码签名）。

```ts
export function evalArrayLiteral(
  ev: Evaluator,
  node: ts.ArrayLiteralExpression,
  ctx: EvalContext,
): AbstractValue;
export function evalObjectLiteral(
  ev: Evaluator,
  node: ts.ObjectLiteralExpression,
  ctx: EvalContext,
): AbstractValue;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/mermaid.ts`

导出 7 项（机器生成，逐字取自源码签名）。

```ts
export function siteGraphToMermaid(graph: SiteGraph): string
export function actorGraphToMermaid(graph: ActorGraph): string
export function causalityGraphToMermaid(graph: CausalityGraph): string
export function phaseGraphToMermaid(graph: CausalityGraph): string
export function phaseFlowToMermaid(flow: ControlFlowGraph): string
export function controlFlowToMermaid(flow: ControlFlowGraph): string
export function handoffGraphToMermaid(
  graph: HandoffGraph,
  names: Pick<CausalityGraph, "lanes" | "phases"> =
```

### `apps/cli/packages/dynamic-workflow/src/analysis/operators.ts`

导出 3 项（机器生成，逐字取自源码签名）。

```ts
export function evalBinary(
  ev: Evaluator,
  node: ts.BinaryExpression,
  ctx: EvalContext,
): AbstractValue;
export function evalPropertyAccess(
  ev: Evaluator,
  node: ts.PropertyAccessExpression,
  ctx: EvalContext,
): AbstractValue;
export function evalElementAccess(
  ev: Evaluator,
  node: ts.ElementAccessExpression,
  ctx: EvalContext,
): AbstractValue;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/patterns.ts`

导出 3 项（机器生成，逐字取自源码签名）。

```ts
export function bindPattern(
  ev: Evaluator,
  name: ts.BindingName,
  value: AbstractValue,
  ctx: EvalContext,
  sourcePlace?: AbstractValue,
): void;
export function extractField(ev: Evaluator, container: AbstractValue, key: string): AbstractValue;
export function selectField(value: AbstractValue, key: string): AbstractValue;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/phase-graph.ts`

导出 3 项（机器生成，逐字取自源码签名）。

```ts
export interface PhaseSourceFact {
  from: string;
  to: string;
  kind: OrderKind;
  certainty: Certainty;
  /** carry 边改型前的底层 kind；carry 最小化按它判见证强度。 */
  carryOf?: Exclude<OrderKind, "carry">;
  /**
   * 见证这条事实的 issue 事件所在的阶段集（只有 await 屏障产生的 seq 事实带它；见
   * causality-graph.ts 的 `Fact.toPhases`）。头端收窄按 {@link headPhasesOf}。
   */
  toPhases?: ReadonlySet<string>;
}
export function collectPhaseClaims(
  events: readonly OrderEvent[],
  steps: ReadonlySet<string>,
  certainChain: (chain: readonly string[]) => boolean,
  controlled: ReadonlySet<string>,
): PhaseClaims;
export function projectPhaseGraph(
  graph: CausalityGraph,
  phases: readonly PhaseInfo[],
  claims: PhaseClaims,
  facts: readonly PhaseSourceFact[],
  sharesIteration: (a: string, b: string) => boolean,
): CausalityGraph;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/phases.ts`

导出 2 项（机器生成，逐字取自源码签名）。

```ts
export const PHASE_MARKER_CODE = 9004;
export function collectPhaseMarkerDiagnostics(
  workflow: WorkflowProgram,
  table: SiteTable,
): CompileDiagnostic[];
```

### `apps/cli/packages/dynamic-workflow/src/analysis/placeholder-resolution.ts`

导出 1 项（机器生成，逐字取自源码签名）。

```ts
export function resolveOccurrences(actuals: ParamActuals, value: AbstractValue): TaintOcc[];
```

### `apps/cli/packages/dynamic-workflow/src/analysis/promise-ops.ts`

导出 6 项（机器生成，逐字取自源码签名）。

```ts
export function handleNewUnknown(
  ev: Evaluator,
  node: ts.NewExpression,
  ctx: EvalContext,
): AbstractValue;
export function evalAwait(ev: Evaluator, node: ts.AwaitExpression, ctx: EvalContext): AbstractValue;
export function handlePromiseReject(
  ev: Evaluator,
  node: ts.CallExpression,
  ctx: EvalContext,
): AbstractValue;
export function isPromiseReject(access: ts.PropertyAccessExpression): boolean;
export function applyConstructor(
  ev: Evaluator,
  id: number,
  ctx: EvalContext,
  argVals: AbstractValue[],
  argPlaces?: (AbstractValue | undefined)[],
  site?: ts.Node,
): void;
export function applyMixinConstructor(
  ev: Evaluator,
  ctx: EvalContext,
  instance: AbstractValue,
  argVals: AbstractValue[],
): void;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/relays.ts`

导出 3 项（机器生成，逐字取自源码签名）。

```ts
export function handleAsk(
  ev: Evaluator,
  node: ts.CallExpression,
  askId: string,
  ctx: EvalContext,
): AbstractValue;
export function handleWorldRead(
  ev: Evaluator,
  id: string,
  args: readonly ts.Expression[],
  ctx: EvalContext,
): AbstractValue;
export function handleJoin(
  ev: Evaluator,
  node: ts.CallExpression,
  id: string,
  arg: ts.Expression | undefined,
  ctx: EvalContext,
): AbstractValue;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/serialize.ts`

导出 5 项（机器生成，逐字取自源码签名）。

```ts
export function serializeGraph(graph: SiteGraph): string;
export function serializeActorGraph(graph: ActorGraph): string;
export function serializeCausalityGraph(graph: CausalityGraph): string;
export function serializeControlFlow(flow: ControlFlowGraph): string;
export function serializeHandoffGraph(graph: HandoffGraph, lanes: readonly Lane[]): string;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/sites-labels.ts`

导出 11 项（机器生成，逐字取自源码签名）。

```ts
export function resolveSymbol(node: ts.Node, checker: ts.TypeChecker): ts.Symbol | undefined
export function isFacadeDeclared(symbol: ts.Symbol | undefined): boolean
export function literalText(expr: ts.Expression | undefined): string | undefined
export class Counter
export function askLabel(receiver: ts.Expression, checker: ts.TypeChecker): string
export function askLabelPattern(
  receiver: ts.Expression,
  checker: ts.TypeChecker,
): NamePattern | undefined
export function actorName(call: ts.CallExpression): string | undefined
export function actorNamePattern(call: ts.CallExpression): NamePattern | undefined
export function worldReadLabel(op: WorldReadOp, arg: ts.Expression | undefined): string
export function eachCandidate(
  call: ts.CallExpression,
  semantics: CallbackSemantics,
  order: number,
  loc: ScriptLoc,
): IterationCandidate | undefined
export function forOfCandidate(
  statement: ts.ForOfStatement,
  order: number,
  loc: ScriptLoc,
): IterationCandidate
```

### `apps/cli/packages/dynamic-workflow/src/analysis/sites.ts`

导出 13 项（机器生成，逐字取自源码签名）。

```ts
export interface AskSite {
  id: string;
  order: number;
  label: string;
  /** `label` 落到兜底串时，内联 `agent()` receiver 的模板形状；见 `askLabelPattern`。 */
  labelPattern?: NamePattern;
  loc: ScriptLoc;
  /** The `x.ask(...)` call. */
  call: ts.CallExpression;
  /** The receiver of `.ask` (the actor expression). Read for actor/context labels. */
  receiver: ts.Expression;
  /** The instruction argument, if present. The taint pass reads it as a sink. */
  instructions: ts.Expression | undefined;
}
export interface ActorSite {
  id: string;
  order: number;
  name: string | undefined;
  /** `name` 缺席而首参是模板字符串时的静态形状；见 `actorNamePattern`。 */
  namePattern?: NamePattern;
  loc: ScriptLoc;
  /** The `agent(...)` call. */
  call: ts.CallExpression;
}
export interface ReportSite {
  id: string;
  order: number;
  loc: ScriptLoc;
  /** The `report(...)` call. */
  call: ts.CallExpression;
  /**
   * The reported item expression, if present. Read by the compile-side serializability
   * check (schema/synthesize.ts) — NOT by the taint pass.
   */
  item: ts.Expression | undefined;
  /**
   * The artifact tag (`report(item, "perf")`), set only when the second argument is a
   * string literal without holes. It routes the item to a preset artifact. Absent means
   * either "no tag" or "a tag the compiler could not read"; {@link artifactIdExpr} tells
   * those apart, and the artifacts pass rejects the second case.
   */
  artifactId?: string;
  /**
   * The tag argument, if present. Kept raw so the diagnostics pass can position a
   * rejection on the offending expression rather than on the call (same reason
   * {@link PhaseMarkerSite.nameExpr} is kept).
   */
  artifactIdExpr: ts.Expression | undefined;
}
export interface ArtifactSite {
  id: string;
  order: number;
  /** The registry op (`file`, `chart`, …), resolved by DECLARING CONTAINER, never by name. */
  op: ArtifactOp;
  loc: ScriptLoc;
  /** The `artifact.file(...)` / `artifact.chart(...)` call. */
  call: ts.CallExpression;
  /** The artifact id — set only when the first argument is a string literal without holes. */
  artifactId?: string;
  /**
   * The id argument, if present. Kept raw so the diagnostics pass can position a rejection
   * on the offending expression.
   */
  artifactIdExpr: ts.Expression | undefined;
}
export interface PhaseMarkerSite {
  /** The phase name — set only when the argument is a string literal without holes. */
  name?: string;
  loc: ScriptLoc;
  /** The `phase(...)` call. */
  call: ts.CallExpression;
  /**
   * The name argument, if present. Kept raw so the diagnostics pass can position a
   * rejection on the offending expression rather than on the call.
   */
  nameExpr: ts.Expression | undefined;
}
export interface WorldReadSite {
  id: string;
  order: number;
  /**
   * Boundary A's op, resolved from the world-read registry by the DECLARING CONTAINER
   * (`files`×`glob` → `"glob"`), never from the bare member name. Not the member name:
   * `git.log` maps to `"git-log"`.
   */
  op: WorldReadOp;
  label: string;
  loc: ScriptLoc;
  /** The `files.glob(...)` / `files.read(...)` call. */
  call: ts.CallExpression;
  /**
   * The call's arguments in source order (`files.glob(p)` → `[p]`). Positional, and
   * plural because ops differ in arity (`files.grep(pattern, glob?)`, `git.status()`);
   * the taint pass treats every one as a sink.
   */
  args: readonly ts.Expression[];
}
export interface JoinSite {
  id: string;
  order: number;
  method: "all" | "allSettled";
  label: string;
  loc: ScriptLoc;
  /** The `Promise.all(...)` / `Promise.allSettled(...)` call. */
  call: ts.CallExpression;
  /** The single argument expression (the iterable); ports come from array literals. */
  arg: ts.Expression | undefined;
}
export interface IterationCandidate {
  order: number;
  form: "array-method" | "for-of";
  loc: ScriptLoc;
  /** Registry label (`map`, `reduce`, `from`, …); undefined for `for...of`. */
  method?: string;
  /** The call (array-method form only) — the key both listeners look the candidate up by. */
  call?: ts.CallExpression;
  /** The registry entry that made this call a candidate (array-method form only). */
  semantics?: CallbackSemantics;
  /** The inline callback literal (array-method form, when the argument is one). */
  callback?: ts.FunctionExpression | ts.ArrowFunction;
  /**
   * The callback argument when it is NOT a literal (`xs.map(review)`, `xs.map(this.f)`):
   * the taint pass applies whatever script functions its value holds, per element.
   */
  callbackExpr?: ts.Expression;
  /** The body values flow through: the callback body or the `for...of` statement body.
   * For a non-literal callback this is the argument expression itself (no lexical body). */
  body: ts.Node;
  /** The element binding (array method: first callback parameter; `for...of`: the loop variable). */
  element: ts.BindingName | undefined;
  /** The iterated expression: the array-method receiver, or the `for...of` right-hand side. */
  iterated: ts.Expression;
}
export interface TopLevelReturn {
  loc: ScriptLoc;
  /** The returned expression, if any (`return;` has none). Read as the sink. */
  expression: ts.Expression | undefined;
}
export interface SiteTable {
  asks: AskSite[];
  actors: ActorSite[];
  worldReads: WorldReadSite[];
  /** `report(...)` sites — sited but drawn in neither graph (see {@link ReportSite}). */
  reports: ReportSite[];
  /** `artifact.*(...)` sites — sited but drawn in neither graph (see {@link ArtifactSite}). */
  artifacts: ArtifactSite[];
  /** `phase("…")` markers — collected but NOT sited (see {@link PhaseMarkerSite}). */
  phases: PhaseMarkerSite[];
  joins: JoinSite[];
  iterations: IterationCandidate[];
  topLevelReturns: TopLevelReturn[];
}
export function collectSites(workflow: WorkflowProgram): SiteTable;
export function findWorkflowBody(scriptFile: ts.SourceFile): ts.Block;
export function isFunctionLike(node: ts.Node): boolean;
```

### `apps/cli/packages/dynamic-workflow/src/analysis/state.ts`

导出 2 项（机器生成，逐字取自源码签名）。

```ts
export type ApplicationVia = "callee" | "argument";
export class TaintState
```

### `apps/cli/packages/dynamic-workflow/src/analysis/taint.ts`

导出 2 项（机器生成，逐字取自源码签名）。

```ts
export interface EvalContext {
  /** Enclosing dataflow regions, innermost last: "top", `fn@<id>`, `cand@<order>`. */
  regionStack: string[];
  /** Sink for `return` statements in this region. */
  onReturn: (value: AbstractValue) => void;
}
export class Evaluator
```

### `apps/cli/packages/dynamic-workflow/src/analysis/types.ts`

导出 7 项（机器生成，逐字取自源码签名）。

```ts
export type SiteKind = "ask" | "world-read" | "join" | "fan-out" | "source" | "sink";
export type SiteLoc = ScriptLoc;
export interface NamePattern {
  head?: string;
  tail?: string;
}
export interface SiteNode {
  id: string;
  kind: SiteKind;
  loc?: SiteLoc;
  label: string;
  /**
   * `label` 只拿到兜底串（内联的 `` agent(`研究员${i}`).ask(…) ``——receiver 是调用式，
   * 既非字面量也非标识符，于是落到 `"ask"`）时，模板的静态形状。仅 `ask` 节点可能有。
   */
  labelPattern?: NamePattern;
  actors?: string[];
  within?: string;
  artifactType?: string;
}
export interface ActorSite {
  id: string;
  loc: SiteLoc;
  name?: string;
  /**
   * `name` 缺席（`agent()` 的首参不是字面量）而首参是模板字符串时的静态形状。与 `name`
   * 实际互斥：字面量给名字，模板给形状。**刻意不写进 `name`**——`name` 的契约是「作者原样
   * 写下的那个词」，把重建物混进去，下游就再也分不清看到的是字面量还是推断。
   */
  namePattern?: NamePattern;
  within?: string;
}
export interface SiteEdge {
  from: string;
  to: string;
  kind: "data" | "context";
  exact: boolean;
  port?: number;
  type?: string;
}
export interface SiteGraph {
  nodes: SiteNode[];
  actors: ActorSite[];
  edges: SiteEdge[];
}
```

### `apps/cli/packages/dynamic-workflow/src/analysis/world-run.ts`

导出 3 项（机器生成，逐字取自源码签名）。

```ts
export const WORLD_RUN_LITERAL_CODE = 9003;
export interface WorldRunCommands {
  /** 脚本声明的命令集：去重、字典序（确认窗与 driver 复验共用的形状）。 */
  commands: string[];
  /** 非字面量 cmd 的定位诊断；非空即脚本不可提交。 */
  diagnostics: CompileDiagnostic[];
}
export function collectWorldRunCommands(
  workflow: WorkflowProgram,
  table: SiteTable,
): WorldRunCommands;
```

### `apps/cli/packages/dynamic-workflow/src/compiler/compile.ts`

导出 10 项（机器生成，逐字取自源码签名）。

```ts
export interface CompileDiagnostic {
  code: number;
  column: number;
  line: number;
  message: string;
}
export interface CompileResult {
  diagnostics: CompileDiagnostic[];
  ok: boolean;
}
export const SCRIPT_FILE_NAME = "workflow-script.ts";
export const WORKFLOW_FUNCTION_NAME = "__workflowScript__";
export interface ScriptLoc {
  line: number;
  column: number;
}
export interface WorkflowProgram {
  program: ts.Program;
  scriptFile: ts.SourceFile;
  toScriptLoc(pos: number): ScriptLoc;
}
export interface CreateWorkflowProgramOptions {
  facadeDts?: string;
}
export function createWorkflowProgram(
  scriptText: string,
  options?: CreateWorkflowProgramOptions,
): WorkflowProgram;
export function collectDiagnostics(program: ts.Program): CompileDiagnostic[];
export function compileWorkflowScript(scriptText: string): CompileResult;
```
