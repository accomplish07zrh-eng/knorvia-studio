# Remote CDN and network complete functional contract

This packet contains functional/public API information distilled by source-exposed E curator, not target implementation/history/test bodies or prescribed helper structure. Root exclusively owns replacement implementation. Read the two public-api.d.ts files plus dependency-api.md and error-text.json. No copied implementation/commentary skeleton is provided. Required public signatures, strings and protocol/data behavior are compatibility boundaries; ordinary idioms need no novelty requirement.

Root reports deliberate prior access only to public declarations/callable dependencies, while prior generic scanners/compiler may have processed target bytes. Root's existing broad conversation/context is retained. This is not a new no-inherited-context or OS-isolation claim. E has read the complete target bodies at the pinned manifest baseline. Before implementation root must confirm current target bytes match those bindings or qualify changed behavior. E is not implementing or integrating these two modules.

## Shared rules

All CDN functions are synchronous, pure candidate/path construction except throwing validation failures. Return fresh arrays/strings, never mutate supplied arrays/options, perform no fetch/file IO/logging/clock/cache/config-env reads. Preserve first-occurrence order whenever deduplicating exact strings. Dedup is case-sensitive and uses resulting literal strings; do not dedup distinct inputs early unless specifically stated. No mandatory URL validity or http/https restriction, query/hash normalization, host lowercasing, percent decoding of bases, automatic default CDN, mirror failover request, version validation, auth or escaping policy is added. Unusual but typed inputs follow the literal rules below.

## resolveRemoteCdnBaseUrls(options)

Candidate observation order: entire options.remoteCdnBaseUrls ?? [] list first, then options.remoteCdnBaseUrl ?? empty string. Trim each candidate string at both ends using normal JS trim. Remove resulting empty strings, then exact-string dedup preserving first occurrence. No trailing slash stripping, URL parse/canonicalization or protocol/version inspection. plural and singular are combined, neither overrides the other. Undefined options themselves are outside the public surface.

## buildReleaseBaseCandidates(remoteCdnBaseUrls,version)

Visit supplied base list in order, without trimming/removing empties first. Strip the maximal run of trailing literal forward slashes from each base. If resulting base ends with the literal slash followed by the supplied version string, emit only that stripped base (already pinned to that exact version). Otherwise emit strippedBase + slash + version first, then strippedBase as fallback. Dedup the complete resulting ordered string list. No semver/URL validation or special query/fragment handling. Empty fallback bases are retained. Version is interpolated literally, not trimmed/encoded/defaulted. Case-sensitive suffix matching; a suffix ending with a different version does not trigger this current-version shortcut.

## buildReleaseAssetUrlCandidates(releaseBaseCandidates,fileCandidates)

Iterate files outermost in supplied order. For each file, normalize/validate it with label exactly release asset path before visiting any base for that file. Then visit bases in supplied order and join that normalized relative path to each base as described in URL joining. Dedup the complete URL list preserving first occurrence. File priority dominates base priority. Even when bases are empty, validate each file; a bad file throws rather than returning an empty list. Empty file list produces empty list and no base processing. No request is executed.

## buildArtifactUrlCandidates(remoteCdnBaseUrls,artifactPath)

Normalize/validate artifactPath once with label exactly artifactPath before processing any base. Join to each base in supplied order, then dedup full resulting URL strings. An invalid path throws even with no bases. Do not interpret supplied bases as release roots or append a version in this function.

## buildComponentReleaseBaseCandidates(releaseBaseCandidates,version)

Visit supplied candidates in order and strip maximal trailing literal slash run. If stripped base ends with literal slash + supplied version, emit its parent obtained by deleting exactly that final slash and version, then the stripped version base. The parent is preferred: currently component archives may live at cross-version root. For a nonmatching suffix emit only stripped base. After expanding all bases, remove exactly zero-length strings, then dedup preserving first occurrence. Do not trim whitespace, validate URLs, independently derive parent directories or strip a different pinned version. Supplied version is literal; parent may be empty and removed. Root-slash candidates strip to empty and disappear here, unlike release-base fallback output.

## buildComponentArtifactUrlCandidates(releaseBaseCandidates,artifactPath,version)

Construct the component release candidate list with the preceding rules first; then apply artifact candidate rules with label artifactPath. Preserve that order, all outputs and exception behavior. No alternate version/root normalization or additional fallback.

## normalizeRemoteAssetRelativePath(rawPath,label)

Use normal JS trim to obtain validation input; errors interpolate the original untrimmed rawPath and supplied label exactly. Checks occur in this precedence and throw a new ordinary Error with the corresponding exact template from error-text.json:

1. trimmed string empty -> empty.
2. contains literal backslash anywhere -> backslash.
3. starts with literal forward slash OR first two characters are ASCII letter A-Z/a-z and colon -> absolute/drive-relative rejection.
4. split trimmed input by literal slash; any zero-length segment -> empty segment.
5. any whole raw segment equals two periods -> parent segment.
6. any whole raw segment equals one period -> current segment.
7. Pass trimmed input to existing Node path.posix.normalize. Split the returned normalized path by slash. If any resulting segment is empty, one period or two periods -> invalid after normalization.
8. Return those normalized segments joined by slash.

No decode before path validation; encoded dots/slashes/backslashes are not raw separators here. Do not normalize Unicode, escape spaces, interpret schemes as URLs, reject colons elsewhere, disallow extensionless paths, trim individual segments, resolve against a root or check filesystem safety. Leading/trailing whitespace is trimmed, embedded/segment whitespace remains. Literal repeated/leading/trailing slashes are rejected rather than collapsed. A dot inside a longer filename is accepted. Protocol-looking input without a drive-letter prefix follows these same string-segment rules; do not add independent protocol filtering.

## URL joining and segment encoding

Strip maximal trailing literal slashes from the base, with no other normalization. The relative path is already normalized by its caller. Split relative path at literal slash and encode each segment independently, joining encoded segments by literal slash; concatenate base + slash + encoded path.

For each segment, try decodeURIComponent followed by encodeURIComponent, so a valid pre-encoded escape is decoded once then canonically encoded once (e.g. raw + becomes %2B, %2B stays %2B). This try includes both decoding and re-encoding. If either throws, fall back to encodeURIComponent on the original segment. The fallback's own exception escapes unchanged; malformed lone-surrogate input can still throw URIError. Do not claim all invalid input is made nonthrowing. Invalid percent sequences are typically encoded literally in fallback. Existing encoded slash stays encoded within its segment; raw literal slash remains a structural separator. Bases themselves are not encoded, URL-resolved, decoded or scheme-validated. Encoded-dot inputs are not rerun through the earlier raw-segment validation after decode; preserve this current boundary without silently introducing extra path policy.

## assertRemoteCdnBaseVersionMatches(baseUrls,expectedVersion)

Inspect every supplied base in order, with duplicates retained. For each, strip maximal trailing literal slash run. Attempt new URL on that stripped value without supplying a base URL. On successful URL construction use its pathname only (normal native URL parser semantics, no explicit decode); on construction failure use the stripped original string as path text. Split chosen path text on slash, remove empty segments, and inspect only final segment. No final segment means no pinned version.

A pinned version is recognized only when the entire final segment has three one-or-more decimal digit groups separated by periods, optionally followed by hyphen and one-or-more ASCII digits/letters/periods/hyphens, optionally followed by plus and one-or-more of that same set. Leading zeros are accepted; leading v, underscores, a missing patch number, empty prerelease/build suffix or non-ASCII characters fail recognition. This is semver-like textual recognition, not a full semantic-version validator. A relative fallback path containing query/fragment text retains that text; a successfully parsed URL ignores query/fragment when examining pathname.

Mismatch if a recognized nonempty pinned segment differs exactly from expectedVersion. Unrecognized/unpinned or exact-match bases are permitted. Collect all mismatches in input order; do not early-throw or dedup. If none return undefined. Otherwise throw a new ordinary Error whose exact Chinese text is in error-text.json: expected version appears in the introduction and final advice; each mismatch renders PINNED + space + opening parenthesis + original untrimmed/unstripped base + closing parenthesis, joined with comma+space; no newline/escaping. No comparison/coercion/normalization of supplied expectedVersion or environment lookup. Earlier string/URL native failures outside the deliberately caught URL-constructor failure are not rewritten.

## resolveRemoteAssetFetch(network)

Public port has fetch with exact typeof globalThis.fetch type. If network is non-nullish and its current fetch property is non-nullish, return that value exactly by identity. Do not bind/wrap the injected function to network, call it, validate it, install proxy settings or consult global fetch for this path. A caller uses the returned function normally; receiver assumptions belong to injection contract. Repeated resolutions return the same injected reference when unchanged; observe replaced network.fetch on each call.

If network/fetch is nullish, read then-current globalThis.fetch and return a newly bound function with globalThis as receiver using the existing function's bind facility. Each fallback resolution performs its own binding, so it need not share function identity with a prior fallback or global fetch. Subsequent global fetch replacement affects future resolutions, not an already returned bound function. No module-load capture/cache/default custom transport/wrapper. Binding/lookup errors escape unchanged. Runtime-falsy but non-nullish property values are retained rather than treated as absent; function validity is guaranteed by public typing rather than an extra check. No network request is made by resolving. Standalone fallback continues direct global transport; injected Desktop transport preserves caller-owned proxy configuration.
