# Draft 01 author seal

Completion UTC: 2026-10-03T02:44:17.394599545Z
Candidate SHA256 binding: 164e7f33a00d2e0ced92d11e845773483a9636f6960c531a2b1a116ce083b3d2  /tmp/knorvia-turn-machine-author-20261003/draft-01/candidate.ts
Input SHA256 bindings: accessed-inputs.sha256

## Scope and design

This draft implements the complete public TurnMachine interface and TurnMachineImpl class for apps/cli/packages/core/src/agent/turn-machine.ts. It retains the supplied state reference and implements synchronous projections without assigning this.state after construction. It delegates phase legality, terminal-phase facts, initial state construction, error construction, ID generation, and failure content conversion to the supplied dependency ports.

Transitions validate before timestamp effects. Projection records retain ordinary object-spread key insertion behavior and share unchanged nested references. Tool completion covers duplicate IDs, appends one result even without a match, and converts failure content before any tool projection or timestamp. Permission projections preserve the four decision behaviors and nullish modified-input fallback. Native Date and crypto.randomUUID seams are retained.

## Dependency interpretation and validation limits

The packet allows value/type imports from ./turn-state.js and @knorvia/contracts. State-module exports are imported from ./turn-state.js; the additional declared dependency ports are imported from @knorvia/contracts. This routing follows the allowed module list; their implementations or exports were not independently inspected.

No compilation, tests, runtime execution, provider calls, policy/service calls, or process/task operations from the authored module were performed. Curator comparison and integration validation remain outstanding. No revision was made after the draft was saved and SHA-bound.

## Actual access record

Current-task repository reads were restricted to the exact five packet files: api.d.ts, state-api.d.ts, imports.txt, ports.d.ts, contract.md in /workspace/knorvia-studio/docs/evidence/turn-machine-author-20261003. They were first read together for authoring and then reread solely for SHA256 input binding. The owned candidate was read solely for SHA256 binding. Writes were limited to candidate.ts, candidate.sha256, accessed-inputs.sha256, and this author-record.md in the owned draft-01 directory; artifact permissions were made read-only after sealing.

The same executor and conversation previously carried the completed AgentRuntime packet-author assignment. Its six packet inputs, authored candidate, and closure context remain inherited conversational knowledge. That earlier assignment is complete and immutable; its files were not opened during this distinct TurnMachine assignment. No predecessor TurnMachine source, history, oracle, tests, compiled dependencies, dependency bodies, receipts, git data, production files, or other repository files were accessed. No agents or additional tasks were launched, and existing model/reasoning settings were retained.

Shared-filesystem access limits were instruction-only, not enforced isolation. No clean-room or license claim is made. Await curator comparison after the sealed draft.
