# Post-seal contract clarification

The configured startup debug callback can publish a different plain `runtime.mcpStartupPromise`. The predecessor returns the current field after that callback, rather than the previously tracked local value. A single owned logger probe freezes this reference boundary: baseline passes, exact sealed draft fails. This clarification was not in the author inputs; the correction is source-exposed.

Static compatibility also retains native truthiness of the model capability, the original falsy selection getter read count, and current cached-builder/startup field reads after publication. These are constrained property/field idioms, not independent expression credit. No new permission, timeout, cancellation or connection policy is introduced. The historical contract/API/oracle/assertions and complete sealed drafts remain immutable.
