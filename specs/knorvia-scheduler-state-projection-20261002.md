# Workflow scheduler-state projection

Select `deriveWorkflowSchedulerState` in contracts/src/workflow/index.ts. It is an
active whole projection owner (dependency adjacency, readiness, membership and
collection/global state), unlike the thin core graph wrappers. Inventory records
upstream-unchanged/unreviewed. Curator read the source. Other contracts schemas,
types, sibling functions, core graph/ready-order and planner files stay unchanged.
No whole-file licence conclusion follows from a function replacement.

```text
plain graph -> node/edge/membership facts -> per-node and collection projections
                                         -> unchanged ready/blocked helpers
                                         -> unchanged scheduler dispatch
```

Functional requirements are the exact bounded author contract/API packet. Preserve
last-ID lookup versus per-occurrence projections, stable dependency/edge orders,
terminal blocking rules, explicit membership duplicates versus inferred deduplication,
empty-string membership distinctions, original node/collection references, shared
membership/blocker arrays, property presence/order and all existing default rules.
No IO, async changes, new validation or product policy. Public declaration API
shape must remain identical; the private terminal-status vocabulary stays unchanged.
Before source edits, the isolated compiler reordered union/type-property declarations
relative to the installed artifact while JS stayed byte-identical. Preserve that
failed byte assumption, verify parsed API shape, then pin the isolated declaration
for exact before/after equality in the same compiler context.

Freeze compact predecessor observations for readiness/counts, duplicate identity,
collection projection and real scheduler consumers. Store only the selected exact
source/compiled closure plus artifact digests, not a whole contracts bundle. Bind
actual current source and compiler-emitted module explicitly. Historical graph/
scheduler consumers replace only the contracts projection import via an exact
historical closure; all other dependency bodies remain unchanged. Ordinary source
core consumers resolve their contracts package to its emitted public entrypoint;
record that package boundary rather than claim a nonexistent all-source path.

One fresh no-context author may read only the two functional packet inputs. Save
and hash its draft before curator inspection, then integrate only selected function
syntax. No initialization retry or executor change. Author access is bounded by
instructions in a shared filesystem, not an absolute clean-room claim.

Run only affected source/strict-emitted/real-consumer groups and owned compiler,
lint, format and architecture gates. The pre-existing contracts index exceeds the
400-line configured limit; preserve baseline/final lint outcomes, do not disable
the rule or expand scope to split schemas. Exact historical assertions and failed
observations remain immutable. No aggregate suite/build or live workflow/provider.
