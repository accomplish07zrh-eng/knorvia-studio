# Filter complete owner compatibility spec

2026-10-02, base `045e4422a8c18a51cf7351c84d32d33a8fc245eb`. Same draft PR10. Body-free fresh author, coordinator source-exposed; public types/policy values and retained dependencies preserve lineage. No new user-data migration/security/API policy.

Complete owner: packages/services/src/file/workspaceFileMentionFilter.ts. Read only filter-api.ts, filter-data.json, this packet, root guidance and own draft. Reauthor complete final stateless filter. Exact five arrays are inherited policy literals; preserve values but no new origin claim for corpus. Export all four existing interfaces and defaultWorkspaceFileSearchFilter:WorkspaceFileSearchFilter; no new exports. Uses node:path.extname for file extension semantics; no IO/matching third-party parser.
Directories: when !context?.ignoreRulesActive, compare name.toLowerCase against exact skipped name set, prefixes startsWith and suffixes endsWith; excluded => {include:false,traverse:false}. Active ignore means built-in directory blacklist retired so user removes node_modules/ in ignorefile can restore traversal. Every otherwise eligible directory traverse true; include false if own entry.name startsWith('.') OR any earlier relativePath segment before last segment (split only '/') startsWith('.'); include true otherwise. Hidden ancestor tests are original case/path spelling, not OS-normalized. Even hidden directories remain traversed to discover normal files. Files include unless lowercased name exactly .env OR starts .env. OR in exact skipped file names OR extname(lowercase) in exact extensions. File context ignored, ancestor hidden paths do not exclude ordinary file, traverse false. Return keys include then traverse. Input objects untouched. Unknown type runtime follows file branch. No new deny lists, containment/case/security changes.

```text
input -> sole owner -> admission/order -> state or traversal -> existing API output
                    -> retained ports/policy, synthetic safety only
```

Acceptance: synthetic original/replacement boundary check only. Ordinary suites/builds deferred. Missing ignore dependency retains exact TS2307 baseline, no parser equivalence claim/network installation. No actual files/databases/scans/deletes/credentials/process/network or other-lane integration.

Clarification before submission: type branch precedes name access; active ignore directory does not lowercase name. Inactive directory blacklist and file checks lowercase only in their relevant branch.
