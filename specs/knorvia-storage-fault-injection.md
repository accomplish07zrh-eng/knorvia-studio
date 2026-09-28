<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# Storage filesystem fault port behavioral contract

Prepared by the root reviewer on 2026-09-29 before independent implementation. Scope is one public synchronous fault-check module. Root inspected the current inherited module and the storage, logging and fs callers. This is a behavioral/public-interface specification, not a reproduction of the implementation. Preserve currently supported behavior; there is no approved new product behavior in this batch.

## Public interface and environment

The runtime exports exactly three names:

- `KNORVIA_E2E_FS_FAULTS_ENV`, literal string `KNORVIA_E2E_FS_FAULTS`.
- `KNORVIA_E2E_FS_FAULTS_ALLOW_ENV`, literal string `KNORVIA_E2E_FS_FAULTS_ALLOW`.
- `maybeThrowStorageFsFault(input: { operation: "appendFile" | "any" | "mkdir" | "rename" | "rm" | "sqliteOpen" | "sqliteRun" | "writeFile"; path: string }): void`.

No exported constructors, reset hook, dependency injection, filesystem access or process control. Existing callers check before filesystem or SQLite operations. The check itself must never perform those operations, terminate a process, or start a command. No external dependencies beyond Node's `process.env` and standard JavaScript globals; Node error typing may be used.

Import does not read or parse the configuration. The first call trims the current raw fault JSON environment string. A missing/blank value installs an empty cached rule set. A nonblank value is active only if `KNORVIA_ENV` is exactly `test`, OR the allow variable is exactly `1`. All other strings, including surrounding whitespace in these flags, disable injection and do not validate malformed raw JSON. A successful first initialization, including a disabled or empty rule set, is cached for the life of that module instance. Later environment edits do not change it. Failed initialization is not cached: the next call tries the then-current environment again. A successfully parsed rule set is cached even when the first check throws an injected error.

## Configuration and eager validation

The nonblank active value must parse with native JSON.parse and produce an array. JSON syntax errors are wrapped as a plain Error with message `Invalid KNORVIA_E2E_FS_FAULTS: <native parser message>`, not with a cause. Non-array JSON produces `Invalid KNORVIA_E2E_FS_FAULTS: expected a JSON array`.

Before validating any individual fields, check every array item is a non-null non-array object in array order. Invalid item error: `Invalid fs fault rule at index <i>: rule must be an object`. Thus a later item shape error precedes an earlier item's invalid fields. An empty array is valid. Ignore unknown fields. The externally reachable input is JSON, so no requirement for getters/proxies or sparse rule arrays that cannot arise from JSON.

Normalize all rules eagerly, in source order, before attempting a match. A malformed later rule must fail initialization even when an earlier valid rule would match or rules would not match the current input. For each rule the validation/error precedence is:

1. `maxMatches`: omitted means 1. Must be a number and an integer >= 0. Error suffix: `maxMatches must be a non-negative integer`.
2. `pathRegex` type: omitted means absent, otherwise must be string. Compile only at step 9.
3. `code`: string with nonblank trim; preserve its trimmed value. Error suffix `code must be a non-empty string`.
4. `id`: same behavior and suffix with `id`.
5. `message`: optional string, retain exactly, including empty string and whitespace.
6. `operations`: omitted means matches any operation. Otherwise nonempty array; error suffix `operations must be a non-empty array`. Every item must be one of the eight exact operation names above, checked in order. Error suffix `unsupported operation <String(value)>`. Duplicate names are accepted. Runtime JSON null/object/array entries use normal JS String conversion. No trimming or case folding of operation names.
7. `pathEndsWith`: optional string, retained exactly.
8. `pathIncludes`: optional string, retained exactly.
9. Compile the optional string from step 2 with `new RegExp(value)` and no flags. Native SyntaxError type/message are not wrapped. Empty regex string is valid.

All field errors are plain Error with prefix `Invalid fs fault rule at index <i>: `. Every optional-string type error is `<field> must be a string`; null is invalid, while omission is accepted. Unknown fields do not alter this precedence.

## Matching and counters

Walk the normalized rules in source order. Skip exhausted finite rules before checking the input path. A positive maximum permits that many matching throws over the module lifetime; zero means unlimited, not disabled. Nonmatching calls do not consume a rule. When a rule matches, consume one match before throwing; do not consume or inspect later rules during that call. After a finite earlier rule is exhausted, a later rule may match subsequent calls.

An operation matches if the rule contains the exact operation or contains `any`. Because `any` is also an allowed input operation, a non-any rule still matches only its corresponding exact input. Input operation/path are not trimmed or otherwise validated. Do not access/normalize the path for a skipped operation or exhausted rule. A rule with a matching operation always normalizes the input path with slash replacement, even if it has no path filters; runtime invalid path may therefore throw the native TypeError. Preserve this ordering rather than adding validation.

Path matching converts every backslash to forward slash in the input and in the includes/ends-with literals. It does not resolve, canonicalize, case-fold or touch the filesystem. Each present literal must match by ordinary case-sensitive includes/endsWith; empty literal matches. The regex is applied to the normalized input but the regex source is not slash-rewritten. All three conditions are ANDed. No flags means the regex has no global/sticky state. Only actual throw increments the counter.

## Injected error

Create a fresh plain Error each time. Message is the exact configured message if present, even when empty. Otherwise `Injected fs fault <trimmed code> for <original operation>: <original path>`.

Assign these own enumerable ordinary writable/configurable properties in this order: `code` = trimmed code, `path` = original input path (not slash-normalized), `syscall` = original operation, `knorviaFsFaultId` = trimmed id. No cause or Error subclass. Callers depend on the original error crossing their boundary. A successful no-match check returns undefined.

## Validation boundaries

Root will first exercise the old public module, then the independent candidate, with isolated task-owned Node module instances/processes and synthetic environment values. No actual failure-inducing filesystem, SQLite, process kill or user data operation is needed to verify this port. Cases include lazy init, disabled malformed configuration, flags, cache/no-cache, ordered errors, all operations, path separator/case behavior, finite/unlimited priority and error properties. Existing storage facade fault-map and parent-directory fixture tests remain relevant integration checks. Compilation and full offline suite follow integration.

Independence evidence must describe actual source access. The author is not given the inherited body, git history, baseline bundle, tests or probes. Prior context is not a claim of clean-room isolation. Required names, fixed field/error vocabulary and straightforward standard JS/Node idioms are compatibility constraints, not proof of new algorithms. A rename, extra abstraction, line-count change or license header is not evidence of independent implementation.
