# Public telemetry shape/signature clarification

The ordered command facts are nested in `detail.command`: the telemetry record is `{ detail: { kind: 'command', command: { ...ordered public command fields... } } }`. Both foreground and background/empty projections use this nesting.

Existing dependency signatures:

```ts
compactToolExecutionTelemetry(perf: ToolExecutionTelemetry): ToolExecutionTelemetry | undefined;
attachToolExecutionTelemetry<T extends object>(output: T, perf: ToolExecutionTelemetry | undefined): T;
```

Pass the compacted telemetry as attach's second argument, after evaluating the first output record. Retain attach's exact return identity. No dependency implementation or representation prescription is supplied here. This factual sixth input supplements the five pre-change packet files without altering them or the frozen observations.

The Buffer.byteLength fallback uses the original parsed output.stdout and output.stderr fields, before stdout normalization or stderr abort decoration. A successful image parse supplies both block mediaType and dataUrl from the parser return object (not the original stdout string). The parser receives stdout and `{ allowWhitespace: true }` as stated in the original contract.
