# Scheduler-state and graph boundary: independent expression/API review

**Recommendation:** accept the selected `deriveWorkflowSchedulerState` function at `fcd4f1250183b11ca0c247f9e72580a85543b0d5` as a complete packet-authored contribution candidate, with the access limitations below. No specific unexplained discretionary copied block or new static API blocker was found. The later `0cca0d486ea9709a59caae138192f8a9c339c48d` change is a verified relocation of authored and retained statements; it earns no independent-reconstruction credit. New filenames do not clear inherited schemas, run/session projections or core graph helpers.

## Exact origin, draft and scope

A single successful primary-publisher fetch independently verified [ZCode's workflow/index.ts at `872ad960`](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521b/apps/zcode-cli/packages/contracts/src/workflow/index.ts): **28,035 bytes**, SHA-256 `a8918a260154ddf41ad0ef085789233490ada8e053b6525afc15559611e00e62`, Git blob `19014a9700639cd4ad75ecbc62be2dd294fca781`. It is byte-identical to A's local `f72c514c4daad48620b293a29fe5907cd81ea101` predecessor; no package-name normalization was needed. No failed or rate-limited material source was retried.

The fresh-author record contains a **4,827-byte** function, SHA-256 `039f5714d3fec3c009099599bb82ecb9efdbe40dd90b556a4f63f1cc26a94056`. Both supplied inputs match their recorded hashes and original freeze `0dcdc63a3ac1f0272fb07c0962f73aead50fe3b3`; the draft record remains unchanged from `1d331c4dd5a13351ec1116eb03d8809746e712c5`. Independent TypeScript 6.0.2 parsing/printing confirms the complete integrated function equals that draft after formatting. Removing only the selected function leaves predecessor and candidate bytes identical, SHA-256 `b2e067ad7d04df839e802392b53a5c7b7c982dc56dfa1d2d891f2e078f3b66d4`.

The reported fresh-author boundary is two behavior/structural-API files, no inherited conversation, followed by a saved draft before review. E verified the committed bindings and chronology, not an independently audited read trace. A's curator was source-exposed; the executor was shared and restrictions were instruction-based. No author was created or contacted for this review. These qualifications remain attached to the selected-function recommendation; this is not whole-file or absolute clean-room evidence.

## Complete selected-function expression

The packet specified last-record dependency lookup, occurrence-level readiness/counts, stable dependency order, explicit membership repetitions, shared-versus-fresh arrays, exact fields/defaults and original object references. It did not prescribe a storage strategy or implementation layout.

| Region | Assessment |
| --- | --- |
| Last-record table and incoming/outgoing sets | The draft builds the last-record map by iteration, initializes incoming sets from that map and inserts edges into adjacency sets. The predecessor builds copied arrays, appends edges, then deduplicates during projection. The draft's storage/evaluation arrangement is discretionary, while lookup precedence and observable ordering are required. Map/Set construction is standard, not algorithmic novelty. |
| Membership association | Both implementations process explicit collection memberships before node-declared associations. That order, retained explicit repetitions and shared membership-array identity are explicitly prescribed. The draft's lazy array creation and positive branch differ from the predecessor's get/fallback/set and early-continue form. Matching field names and the two-stage association do not establish unexplained implementation transfer. |
| Occurrence projection/counting | The draft combines node projection, status partitioning and aggregate updates in a pass with a switch. The predecessor uses mapping and repeated filters. Duplicate node occurrences still retain their own object/status while dependency lookup uses the last record; absent membership gets a fresh empty array and blockedNodes reuses the node projection's blocker array. These distinctions are supported by inspection, not merely renamed variables. |
| Collection projection | The draft builds an ordered membership Set and partitions status lists in one pass; the predecessor builds a union array and separately filters each status. Filtering global ready occurrences by membership preserves duplicates/order. The explicit-then-inferred membership rule, nullish defaults, original collection reference and twelve ordered fields came from the packet. |
| Result fields and terminal-status vocabulary | The eight top-level fields, counts, schema vocabulary and terminal-status Set are prescribed or retained. No demand for different prose, unfamiliar algorithms or gratuitous field order is warranted. The unchanged terminal Set is not newly authored source. |

No concrete ordinary-plain-record functional discrepancy was identified. This does not claim arbitrary getter/proxy or malformed-object equivalence. The packet's narrowed structural declarations are adequate for the selected implementation; it does not assume omitted fields or replace schema validation. The complete-function recommendation is not based on fewer lines or a similarity score.

## Module boundary and retained helpers

Independent checks used exact source overlays at each checkpoint and actual pinned TypeScript/dependencies in a disposable workspace. The state predecessor, integrated state and relocated boundary all compiled with zero diagnostics. State predecessor and integrated **complete workflow public declarations are byte-identical**. For the split, the source-statement and flattened-public-declaration maps match independently, and compiler-resolved export names are unchanged:

| Surface | Source statements preserved | Public declarations preserved | Public exports |
| --- | ---: | ---: | ---: |
| Workflow contracts | 94 | 92 | 123 |
| Core scheduler graph | 18 | 16 | 16 |

Source comparisons parse and print complete statements, preserving the selected authored function and inherited statement bodies. Declaration comparison permits only union-member and property-only type-literal ordering; it rejects call/index/overload-member normalization. Import routing and physical declaration layout necessarily change. The selected scheduler-state function also remains draft-equal after moving to `scheduler-state.ts`.

**Retained expression is concrete:** all **93 other workflow declaration statements** still match the publisher, including schemas/refinements, the terminal Set, `deriveWorkflowRunSchedulerState`, `deriveWorkflowSessionLinks` and `workflowSessionLinkStatusFromActivity`. All **17 graph statements other than previously reviewed `orderedReadyExecutableNodes`** match the independently retained publisher graph. Those include readiness/completion helpers, snapshot/activity/artifact updates, normalization, membership/frontier, phase checks and edge IDs. Their relocation is not replacement.

| New module | Ownership consequence |
| --- | --- |
| contracts `definition`, `graph-schema`, `run-schema` | Inherited vocabulary, schema and refinement bodies retain their source relationships. |
| contracts `scheduler-state` | Selected new function plus retained schemas, terminal Set and run-state overlay; not whole-file independent. |
| contracts `session-links` | Retained attempt/status projection and helper. |
| contracts `index` | Public reexports and retained store interfaces; routing change only. |
| core `ready-order` | Previously reviewed selected authored ordering remains unchanged; no new originality credit. |
| core `graph-helpers` and `graph` | Retained helper bodies and a public reexport barrel, respectively. |

The import graph routes value dependencies from definition through graph/run schemas to the public barrel; state/session modules use direct internal imports, with run-state types erased. Core ordering imports helpers and helpers do not import the ordering/barrel. Static inspection found no new internal barrel cycle, renamed export, schema recreation or changed alias expression. Runtime schema/function identity remains supported by A's focused tests, not by a new E runtime run.

## Receipt and acceptance limits

E verified all available tracked receipt bindings: **9** at the state checkpoint and **21** at the boundary checkpoint. The original state tests, historical oracle and two input files remain unchanged from freeze through boundary; the author draft record is unchanged. A's untracked emitted artifacts (2 state and 18 boundary JS/declaration files) were unavailable for independent byte verification. E's independent compiler/declaration checks are recorded separately and do not impersonate those artifacts or logs.

A reports six groups per mode for state, and fourteen per mode for the later boundary, with explicit overlap with prior checks. E did not repeat them or count them as new tests. The original declaration-context/absent-archive failure, stale-selector failures and source-stage configured 820/400 max-lines failure remain in A's receipts. The relocation yields physical module sizes below 400 and A reports configured lint closure; E did not independently rerun that linter. No assertion weakening or global licence acceptance is inferred.

[Independent source/API evidence](evidence/scheduler-state-e-review-20261002/receipt.json) preserves publisher verification, draft equality, statement hashes, receipt checks and compiler/declaration bindings. It uses Node 24.19.0 and root-pinned TypeScript 6.0.2; pinned Node 24.14 and native platform behavior were not exercised. Root's later combined scheduler/planner integration remains its own acceptance surface.

No production source, author artifact, licence/header/global inventory, fixed publication checkpoint or release was changed. No broad suite, new author, deployment or raw bundle upload occurred.
