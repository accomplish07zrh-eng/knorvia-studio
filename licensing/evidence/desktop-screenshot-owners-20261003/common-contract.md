# Fresh author boundary

Read ONLY this file, your assigned owner contract and ports declarations in this
packet. Do not read repository implementations, tests, history, dependencies,
upstream, previous/sibling drafts, patches or other evidence. Do not inspect your
own output after writing. You may hash/stat your own generated file. Shared fs
does not enforce this boundary. No delegated subagents.

Write exactly one complete TypeScript literal at the assigned /tmp output path,
using existing import paths and public API. No novelty requirement, cosmetic
renaming goal, policy improvement or helper inlining. Private structure is your
choice; preserve all contract behavior and exception/reentrancy ordering. Retained
imports are ports. Do not create or alter product dependencies/tests/evidence.

Report output path, byte count, SHA256, access declaration and then STOP editing.
The curator freezes your completion before reading the candidate. If later asked
to correct, author a full new literal from own memory and supplied facts; never
read prior output, inherited source or sibling output. Keep all variants.

TypeScript/Node timers use real async callback semantics; positive/zero timer ids
and listeners have ordinary platform semantics. Promise resolution microtasks
must remain async; do not add catch normalization, waits, retries or resource
policy that the behavior contract does not specify. Option objects remain live
references except explicitly captured fields.
