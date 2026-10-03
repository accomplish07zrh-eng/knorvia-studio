# Runtime construction and shutdown owner

Allocated source: `apps/cli/packages/core/src/runtime/agent-runtime.ts`, SHA256 `544b2940897ac38f656b38b21b7e50ec1b2342d5e47572f902f0871650cc12f1`. Existing records are protected inputs or unaccepted composition screens; no accepted complete owner was found. Current callers construct session/subagent/workflow runtimes and use beginShutdown/closeBrowserSession during teardown.

```text
retained instance field defaults → synchronous config/authority/port construction
→ registry branch binding → subagent/tooling → optional context bootstrap → detached MCP start
shutdown flag → memory extraction stop → REPL cleanup → awaited optional browser close
```

Reconstruct only constructor and two native lifecycle methods, from body-free behavior/public-port inputs and a whole sealed candidate. Retain existing field declarations/default data, public method signatures/interface prose, method installer and all lower methods/helpers. Constructor runs synchronously: no added promises, caches, cancellation guards or late initialization. Existing runtime remains the single session/queue/permission/state owner. Keep original reads, references, callback phases, receiver binding, default-deny admission, partial initialization and cleanup errors.

The predecessor has a concrete max-lines failure (573/400). Move the complete unchanged merged public interface and its needed type imports to one internal API declaration module, with zero originality credit; do not split individual methods or alter policy. Verify full public API and preserved field/default AST/order.

Minimum synthetic initialization/authority/identity/partial failure and browser cleanup checks; no actual Runtime dependencies, providers, services, credentials, files, grants or processes. Strict selected compiler emission and owned scoped lint/format/architecture only. Ordinary suites/builds/native acceptance deferred. Original branch/draft PR11, no cross-lane integration or licence grant. Source exposure and retained expression remain explicit.
