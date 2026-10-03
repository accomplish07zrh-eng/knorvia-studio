# Media preparation complete owner

Before source replacement: original SHA256 e1263f8d945290612c65995d466151f149b2503c628e77061ff7e2418d1ca6e8. Migration evidence binds inherited modified source; no legal acceptance is implied. Replace the complete preparation owner through a fresh declaration/behavior-only author. Coordinator has read the original. Keep public types, descriptor, optional methods and dependencies unchanged.

The service owns one preparation operation and its factory-captured inline budget (`inlineMaxBytes ?? 8*1024*1024`). Resolve the public shared format first; reject absent/mismatched kind with `Unsupported media preview format: ${path}` before any IO. Await `fileService.stat({path})`; reject non-file or non-number size with `Path is not a media file: ${path}`. Do not add validation of numeric edge values.

When both local hooks are present, await authorization of the input path, then call URL creation with the returned canonical path. Return local-url using canonical path, format media type and original stat size, regardless of inline budget. Never read inline bytes in this branch; authorization failures keep original identity and prevent URL creation. Otherwise enforce stat-size greater-than budget with `Media file is too large for inline preview: ${path}`, then request `readMediaPreview({path,maxBytes:budget})` once. Its base64, mediaType and totalBytes are forwarded without recomputation in the inline result with original input path. Preserve errors from format/stat/hooks/read and synchronous URL exceptions. Hooks and file service are read from the passed options at use time; only budget is captured at creation. No real filesystem/provider/network or application state in acceptance checks.

```text
prepare -> format admission -> stat -> paired local hooks? -> authorize -> URL -> result
                                    -> size admission -> bounded preview read -> result
```

Minimum synthetic validation checks denied authorization cannot produce URLs/read bytes, unsupported kind cannot stat, and inline budget/returned data identity. Relevant scoped types/lint/format/architecture only; no broad tests/builds or licensing changes.

Coordinator clarification before acceptance: local result format mediaType and stat size are observed before synchronous URL creation; hooks mutating these objects do not retroactively affect captured result fields. Getter failures occur before URL invocation. Raw draft is retained; author freezes its own correction.
