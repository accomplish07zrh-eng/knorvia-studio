<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP 网络边界规格

Root read the existing boundary, declarations, shared sanitizer/public adapter contracts and MCP stdio/HTTP callers. Implement from this finalized contract, approved declarations and your own prior context; no main source, old bodies, tests, probes, history or compiled implementations. Write independent design before source in the new isolated workspace; static checks only, no product/candidate execution. This is not a whole-process clean-room claim.

Two synchronous public factories, both arity1: buildMcpStdioEnv(options) returns a string record; createMcpTransportFetch(options) returns typeof globalThis.fetch. Both accept required options with optional env:NodeJS.ProcessEnv and network:NetworkEgressEnvPolicy. Re-export that type from the accepted environment adapter. No new optional argument, public test endpoint, configuration or UI.

Stdio selects options.env or current process.env. Copy only own enumerable entries with string values into a new record. Pass that record to retained public sanitizeKnorviaRuntimeEnv, then pass its result to accepted applyNetworkEgressEnv with the selected original source and network policy. Keep source untouched, retaining sanitizer and projection responsibilities in their existing owners. Do not duplicate sanitation, credential policy, captured JSON or network selection. The caller later overlays plugin-specific environment; do not change that order or modify callers.

After projection, ensure a usable node location in the resulting PATH. Existing module captures process.execPath and process.platform at module initialization; preserve those captured values, not fresh fields each call. Capture only those two scalar process values, no process.env snapshot. Choose win32 path API for win32, posix for all other platforms. Recognize captured executable basename lowercased exactly node or node.exe; if different, return projected record directly without path scan or access checks. Win32 delimiter is ';', otherwise retain native node:path delimiter. Choose first own enumerable target key whose lowercase is path, even on POSIX, defaulting to PATH. Preserve other differently cased keys. Current path defaults empty; split by delimiter and discard only empty entries, without trim, dequote or environment expansion.

Before filesystem checks, if any retained path entry matches the running executable directory after native path.normalize (casefold only on win32), return projected record unchanged. No realpath, symlink or absolute-path equivalence rule. Otherwise look for an accessible node.exe in each entry on win32, node elsewhere, using native path.join and synchronous accessSync(candidate,constants.X_OK); any thrown access error counts as unavailable. Stop at first available executable. A different working Node already in PATH wins; do not force the bundled/current one. When no entry qualifies, return a new shallow object copying projected fields with only the selected path key replaced by running directory + delimiter + unchanged current path, or just running directory when current path is empty. Do not mutate the projected record in this insertion branch, deduplicate other entries or remove empties from the text eventually retained. No filesystem writes or subprocess/network launches.

HTTP factory calls accepted createNetworkProxyFetch with current env selection and scalar network fields caCertFile/httpProxy/noProxy, including undefined keys as the existing declaration requires. This wrapper does not perform auth, network normalization, environment sanitization or new caching. Capturing scalar network options in its new options record and borrowing the supplied env reference preserves existing adapter behavior. Failures from retained sanitizer, projection and fetch factory propagate synchronously with original causes; only native accessSync errors become false. Record/property errors stay ordinary native errors, no broad fallback or retry.

## Settled boundaries after finite observations

Root ran12 owned observations with the old body and actual current dependencies, plus6 observations of the frozen body with owned public-dependency stubs. No real PATH snapshot, external network or accessSync filesystem probe occurred. Native access was replaced by an owned observer. These finite results settle the following rules, not arbitrary Proxy/getter behavior.

Stdio dependency options have exactly two own keys in order network, sourceEnv, even when network is undefined. Do not supply platform or toolEnvPassthrough: the accepted adapter keeps its existing defaults independent of the PATH module capture. Select source, copy/filter, call sanitizer, then evaluate network for the projection-options object and invoke projection. Use the actual sanitized return as target and actual projected return for PATH. Return that projected object unchanged on early exits; only insertion shallow-copies it. The source original reference belongs in sourceEnv and is never replaced by its filtered copy.

HTTP dependency options have exactly four own keys in order caCertFile, env, httpProxy, noProxy, including undefined policy fields. Preserve their evaluation order: policy CA, env selection, policy HTTP proxy, policy bypass. Return the dependency result by identity. Do not add fetch or omit undefined keys. Env fallback is current process.env on each factory call; only the private PATH execPath/platform are module captures. Type signatures are in public-api.d.ts, proxy-fetch.d.ts and subprocess-env.d.ts.

PATH key selection uses own enumerable aliases, but reading the selected key uses ordinary exact property access and nullish-empty fallback. If there is no own alias and a projected record inherits exact PATH, the default key can read that inherited string. Root confirmed this at the owned projection boundary, not as a new behavior of the retained sanitizer. Preserve ordinary record behavior, no own-property filter on the value read.

For equality, normalize both each retained entry and the captured executable's raw dirname with the selected native path API, casefold both on win32. When insertion is needed, prefix the original dirname, not its normalized comparison value. Dot-segment observations confirmed both rules. Native path.join candidate construction occurs outside the accessSync-only catch; do not turn path errors into absence. Comparison scans precede all availability checks. Fixed non-Windows delimiter remains the native node:path delimiter rather than a new literal assumption.

## Implementation and acceptance limits

Use one normally formatted module under400 lines with small focused PATH operations and no general mapping framework. The existing public @knorvia/shared/runtime-env entry supplies only the declared sanitizer; private adapter imports use the approved declarations. Re-export the policy type without a new runtime export. Do not duplicate dependency bodies, introduce cache/global-env state, change callers/auth/permissions or add a public test injection hook. No behavior correction is approved in this batch.

Allowed product inputs are behavior.md, public-api.d.ts, shared.d.ts, proxy-fetch.d.ts, subprocess-env.d.ts and input-hashes.json, plus own prior context and new authored files. Do not read old/main source, history, tests, probes, runtime bundles or other product bodies. Use fixed Node24 parse-only checks, strict/noUncheckedIndexedAccess types against copied approved declarations, normal formatter and94-rule strict lint. Audit actual compiler inputs and preserve first failures/corrections. No candidate execution, real env/PATH inspection, filesystem/CA probe, network/model call, tests, installation or product build. Root separately performs old-first, source, actual CLI and full offline acceptance.

Fixed signatures, short native expressions, names, MIT headers and passing tests alone do not establish authorship. Root has full-source knowledge and author retains prior context; no whole-process clean-room or legal guarantee. Root Apache-2.0, retained dependencies and preview identity remain until applicable work is complete. UI and user data stay unchanged.

## 补充的记录语义

This supplements behavior.md without changing its frozen bytes. The approved public API and other input files remain unchanged. No feature or policy change is authorized.

Root made four finite old-first observations at the input of the retained sanitizer. The source is an owned ordinary record, including a JSON-created own enumerable key spelled `__proto__`. With either a nonempty or empty string value under that key plus KEEP="value", the sanitizer receives a fresh ordinary-prototype record whose only own key is KEEP. The source remains untouched. A nonstring value under that key is likewise absent. Ordinary string shadow names constructor and toString remain own copied properties in their enumeration order; they are not forbidden keys.

The initial candidate preserved an own `__proto__` string in both string cases, whereas the prior boundary did not. The two nonstring/ordinary-shadow observations agreed. Preserve the established ordinary string-record outcome without broadening filters, mutating the source or adding a public hook. Other sequencing, projection/fetch options and PATH contracts remain as approved.

This is behavioral feedback only. Do not inspect the observation script, tests, old implementation, retained implementations or runtime bundles. Preserve the exact first candidate, report and check evidence before revising. Record this supplemental input and the reason for revision. Re-run static checks only, and freeze the revised candidate for root runtime acceptance. Neither this observation nor use of a standard record operation establishes legal authorship by itself.

## 唯一所有者与顺序

MCP网络模块只拥有调用编排及Node路径补入；sanitizer拥有运行环境清理，既有环境投影拥有网络字段，fetch adapter拥有请求生命周期。CLI当前不属于架构检查器的托管模块，本批另行核对公开shared入口、适配层依赖和调用方的插件env覆盖顺序。

```text
调用借用源env → 新字符串记录 → sanitizer → 网络投影 → PATH判断
                                                     ├─ 已满足：返回投影本体
                                                     └─ 缺Node：新浅拷贝补目录
HTTP选项依次读取CA/env/proxy/noProxy → retained fetch factory → 原返回值
```

跨平台PATH用受控process标识及原生path API验证；可执行性以自有观察器替代真实文件访问。保留完整旧先行/候选/主仓源码/CLI实际可达产物及全量离线结果，有限模拟不等于真实SSH、WSL、Docker或外部MCP服务验收。
