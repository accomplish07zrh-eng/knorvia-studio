# Bounded Git service expression review

Review gitService.ts at46973a29b0186be28a946a2a2e488636e3ed4b94 without changing
production. Compare exact declarations against publisher872ad960, local import
7619e41 and integrated0d80f9c using existing read-only Git objects. Preserve all
earlier receipts, especially refresh46973a2: its changed assembly remains mixed
source, with no whole-file originality or licence conclusion.

The initially considered generateCommitMessage owner checks availability, awaits
status, projects unstaged before staged, filters the current session, selects the
first eight files before skipping excluded sources, awaits ordered allSettled
diffs, then awaits one existing generator. Sync acquisition errors stop later
reads; rejected diffs are omitted; fulfilled truthy patch/summary values retain
input order. Targets, receivers, optional metadata and late generator reads stay
exact. Existing service/repo caches own lifetimes and settlement; this review adds
no request, await, state, retry, cancellation or permission policy.

```text
UI callback → service → existing status owner → scoped files → diff fanout
             original three awaits                         → one generator
review tool → project Git objects/bytes → exact expression facts only
```

Inventory every service method, private query selector, fixed constant and factory
capture. Exact matches establish retention, not protectability; changed bytes do
not establish independent authorship. Bind source/emitted/declaration hashes and
protect accepted helpers, projectors, generation/filtering and public declarations.
The checker must reject source/digest tampering, omitted expressions and incorrect
retention facts, using small synthetic inputs. No production suites/builds are
needed for evidence-only work; tool tests and owned format/lint/architecture suffice.

Report a concrete next rights/design decision under the existing MIT acceptance
criteria. Candidate decision stays null/NOASSERTION and outside shared review
records. No count increment, MIT grant, clean-room, native or publication claim.
