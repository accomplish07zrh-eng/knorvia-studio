# Collection-planner v2: strict type and complete declaration review

**Result:** the exact 11,883-byte v2 draft, SHA-256 `32ffd9142ec2d13db5589fa520222c68dbd15e8da2d248efb3b72377620de3af`, passes strict TypeScript compilation against the actual pinned core source types and reachable dependencies. Its complete public declaration matches the corrected predecessor after one equivalent type-import syntax normalization. No author or curator correction was required, so the two successful behavioral probes were not repeated.

The complete-module packet-authored contribution recommendation remains positive, subject to the existing exposure and integration limits. The [v2 delta review](knorvia-collection-planner-author-v2-handoff-20261002.md) still applies: only the aggregation expression, removed phase capture and thirteen phase reads changed. Type checking introduces no new discretionary implementation or authorship claim. The different existing `39cc7b5` source remains mixed; this result does not reclassify it or clear dependency owners.

## Actual source/dependency check

The saved E environment initially lacked a compiler and installed dependencies. An isolated `/tmp` workspace was populated from exact Git source objects at `39cc7b5fa60c7337a4b1139e8bab8cc0d6a079ec`. Six official npm package tarballs were verified against the **root** lockfile's SHA-512 integrities before extraction: TypeScript 6.0.2, `@types/node` 24.12.2, `undici-types` 7.16.0, contracts Zod 3.25.76, shared Zod 4.6.5, and `zod-to-json-schema` 3.25.2. No lifecycle scripts ran and no production dependencies were installed. The nested CLI lock's different compiler/type versions were not silently substituted for the root pins.

Two programs used the sole root `core/src/workflow/scheduler/collection-planner.ts`: the corrected source, then an in-memory compiler-host overlay containing the exact v2 bytes. They used the real core tsconfig, including `strict: true`, `module/moduleResolution: NodeNext`, Node types and its existing `skipLibCheck: true`. RootDir/outDir were moved to the disposable source/output roots. Explicit paths resolve actual workspace public source barrels and shared-package subpaths taken from its package exports. This is a source-bound dependency check, not compilation against hand-written packet types, diagnostic doubles or newly invented declarations.

Both final programs produced **zero diagnostics** and emitted successfully. An earlier preparation attempt produced the same ten TS2307 shared-subpath resolution errors in baseline and v2. Those failures are [preserved](evidence/collection-planner-v2-types-20261002/preparation-failures.json); fixing the temporary path mapping, rather than source/types/assertions, resolved them. The [receipt](evidence/collection-planner-v2-types-20261002/receipt.json), compiler driver, package provenance, exact program input bindings and declaration files preserve the successful check.

## Complete public declaration

| Declaration | Bytes | SHA-256 |
| --- | ---: | --- |
| Corrected predecessor | 560 | `ef74e17fff17b01a4fa8e5e8aaccddd339a5744e0bf4f81105e9da8f42edff08` |
| Exact v2 | 560 | `a135865f012eb9d991a96a432a4625791bba081cae45e839cd67ee19eeb84406` |

The corrected declaration is byte-identical to the declaration already frozen in `workflow-collection-planner-baseline.json`. V2 differs only in the equivalent spelling `import { type WorkflowRunSnapshot }` versus `import type { WorkflowRunSnapshot }`. After that single import normalization, the **entire files** match: three imported type bindings, the sole exported function, all four parameters, its Promise/result fields and the map comment. No property/union/parameter reordering or selective signature comparison is used. The private attempt result interface does not leak into the public declaration.

## Limits retained

Execution used Node **24.19.0**, not the repository-pinned Node 24.14.0. Strict source checking used the actual transitive type closure, but declaration-library checking retains the project's `skipLibCheck` setting. This did not exercise the root's later combined source checkpoint, installed emitted-package resolution, actual scheduler consumers, Windows/macOS or runtime behavior.

The original v1 red phase/argument-limit results and the v2 two-probe results remain unchanged. Those earlier probes used dependency doubles; the present real-type compilation does not convert them into real-consumer tests. Root owns exact integrated descendant validation. No broad suite, successful probe rerun, production edit, licence change, release, deployment or raw bundle upload occurred.
