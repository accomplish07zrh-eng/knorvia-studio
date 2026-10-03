# Promise joins and awaited positions: bounded review contract

Scope: `causality-order-strands.ts`, its named test/archive/selector and lane review.
Production remains unchanged unless a simpler substantive replacement is demonstrated.
May-set, settlement, graph projections, runtime and shared licensing are excluded.

`TraceState` owns the strand records, frame stack, symbol bindings and joined set.
Calls open/close asynchronous activations; declarations and assignments bind spawned
regions; await and for-await take a strand-count mark before evaluating the operand.
Settlement consumes the join result. There is no promise execution, asynchronous wait,
deadline, cancellation, retry or second state owner in this synchronous analysis module.

Supported rules to preserve:

- Join new operand activations first, then bound awaited identifiers, then closed
  activations whose issued steps are claimed. Preserve spawn/occurrence/binding/record
  order. Already joined region ids are ignored. A lifted certain claim wins over a
  maybe claim for that record; an earlier admitted duplicate cannot be upgraded.
- Operand positions include identifiers, arrays/spreads, parentheses, non-null/type
  wrappers, and arguments of the actual global Promise all/allSettled/race/any.
  Unknown calls, ordinary property reads and shadowed combinators are opaque.
  The checker resolves identifiers by AST/symbol identity, not by their text alone.
- Finish the entire awaited-position scan before resolving any collected identifier.
  Mark-spawned joins are already committed if that scan throws. A later failed symbol
  lookup leaves earlier binding joins committed. Mark joined before projecting its id.
  No rollback or new exception translation is introduced.
- Frames and records retain their references. Closing stores the popped frame's set,
  opening leaves the root below the activation, and visibility spans active frames.
  Existing binding sets are extended in place. Repeated joins return fresh empty arrays
  without replacing state, records, frames or symbols.
- The complete walk/settlement/analyzer path must preserve core, causality, flow,
  handoff and Mermaid output. All scripts and checker ports are synthetic owned data.

The exact historical compiled/declaration archive is immutable. Current source,
actual JS, declaration, the two private runtime imports and named caller artifacts are
digest-selected separately; wrong/missing artifacts fail closed. Historical analyzer
imports explicitly route state/settlement/calls/loops/walk through archived strands.
Current tests import the real selected source/dist modules, never that historical URL.

Review decision: the existing scan and ordered three-phase admission already form a
compact owner. Batch collection changes partial commits; moving loops or replacing
recursion with a traversal framework does not establish substantive reconstruction.
Retain this implementation and its discretionary narrative as inherited/unresolved.
This freeze adds compatibility evidence, not originality credit or a licence decision.
