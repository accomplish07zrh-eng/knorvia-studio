# Observable message and path constants

Templates below specify output strings, not implementation expressions. Braced names are runtime substitutions; preserve punctuation/spaces. String(error) is JavaScript string conversion. Unless marked otherwise, messages create ordinary Error objects. Existing dependency errors remain the responsibility of those unchanged dependencies.

## Configuration and parsing

- Invalid signal timeout: `[remote-assets] manifest request timeout must be a positive safe integer: {String(timeoutMs)}`
- Missing ensure configuration: `[deploy] production remote assets require remoteCdnBaseUrl or remoteCdnBaseUrls, remoteCacheDir and platformArch (remoteCdnBaseUrl={original remoteCdnBaseUrl or <empty> if nullish}, remoteCdnBaseUrls={JSON.stringify(original remoteCdnBaseUrls or [] if nullish)}, remoteCacheDir={original remoteCacheDir or <empty> if nullish}, platformArch={original platformArch or <empty> if nullish}).`
- Empty safe path segment: `[remote-assets] {label} is empty`
- Slash/backslash in safe segment: `[remote-assets] {label} must be a single path segment: {value}`
- Dot/dot-dot safe segment: `[remote-assets] {label} is invalid: {value}`
- Invalid requested id: `[remote-assets] component id is invalid: {id}`
- Missing selected ids: `[remote-assets] manifest is missing requested components: {ids joined by comma-space}`
- Missing manifest: `[remote-assets] manifest not found for {platformArch}: {manifest file name}`
- Aggregate fetch failure: `[remote-assets] failed to fetch {fileLabel}: {candidate errors joined by semicolon-space}`
- Candidate errors: `{url} -> HTTP {status}` or `{url} -> {String(error)}`. Manifest fileLabel is `manifest-{platformArch}.json`; artifact fileLabel is `{id}@{version}`.
- JSON failure: `[remote-assets] invalid manifest json from {sourceUrl}: {String(error)}`
- Invalid top-level payload: `[remote-assets] invalid manifest payload from {sourceUrl}: expect object`
- Wrong/nonfinite schema type: `[remote-assets] manifest.schemaVersion must be finite number`
- Unsupported schema: `[remote-assets] unsupported manifest schemaVersion={schemaVersion} from {sourceUrl}`
- Required string type: `[remote-assets] {context}.{field} must be string`
- Empty trimmed string: `[remote-assets] {context}.{field} is empty`
- App mismatch: `[remote-assets] manifest appVersion mismatch from {sourceUrl}: expected={expected}, actual={actual}`
- Platform mismatch: `[remote-assets] manifest platformArch mismatch from {sourceUrl}: expected={expected}, actual={actual}`
- Components not array: `[remote-assets] manifest.components must be array from {sourceUrl}`
- Empty raw components: `[remote-assets] manifest.components is empty from {sourceUrl}`
- Component not object: `[remote-assets] {context} must be object`
- Invalid parsed id: `[remote-assets] {context}.id is invalid: {id}`
- Duplicate id: `[remote-assets] duplicate component id in manifest: {id}`
- Invalid SHA: `[remote-assets] {context}.sha256 is invalid`
- Mount mismatch: `[remote-assets] {context}.mount mismatch for {id}: expected={expectedMount}, actual={mount}`

Contexts are `manifest` or `manifest.components[{zero-based index}]`. Parsed safe-version labels are `{context}.version`; top-level safe labels are `appVersion`, then `platformArch`. Relative-path field labels are `{context}.artifactPath` and `{context}.mount`.

## Filesystem and integrity

- Unrecognized component root: `[remote-assets] component id is not in local whitelist: {id}`
- Containment: `[remote-assets] {label} escapes base dir: {relativePath}`
- Empty stream: `response body is empty`
- Archive mismatch: `[remote-assets] sha256 mismatch for {id}@{version}: expected={expected}, actual={actual}`
- Empty extraction: `[remote-assets] extracted component archive is empty for {id}@{version}`
- Empty migration: `[remote-assets] migrated component source is empty for {id}@{version}`
- Empty release mount staging: `[remote-assets] release component is empty for {id}@{version}`
- Invalid assembled full release: `[remote-assets] assembled release directory is invalid`
- Symlink during materialization: `[remote-assets] symlink is not allowed in component cache: {sourcePath}`
- Unsupported materialization entry: `[remote-assets] unsupported component entry type: {sourcePath}`
- Unsupported hash root: `unsupported path type: {path}`
- Unsupported hash entry: `unsupported entry type: {path}`
- Failed commit and rollback: `[remote-assets] failed to commit staged directory and failed to restore backup: commit={String(commitError)}, restore={String(restoreError)}`

Containment labels: `required cache path`, `component {id} mount`, `legacy component {id} mount`. Path substitutions are platform-native filesystem paths.

## Logger messages

All below are one string argument. Missing lists contain absolute paths joined with comma and no spaces; unready/null component missing-list becomes an empty string.

| Method | Template |
| --- | --- |
| logWarn | `[remote-assets] download required: component=<release> reason=local cache missing or invalid path={releaseDir}` |
| logWarn | `[remote-assets] locked release cache still incomplete: missing={missing}; redownloading` |
| logWarn | `[remote-assets] locked component cache still incomplete: component={id} missing={missing}; redownloading` |
| logWarn | `[remote-assets] forced component refresh: component={id} path={componentDir}` |
| logWarn | `[remote-assets] local component cache incomplete: component={id} missing={missing}; redownloading` |
| logWarn | `[remote-assets] migrated local component cache incomplete: component={id} missing={missing}; redownloading` |
| logWarn | `[remote-assets] skip legacy component migration for {id}@{version} from {legacyVersion}: {String(error)}` |
| log | `[remote-assets] downloading {url}` |
| log | `[remote-assets] migrated {id}@{version} from {sourceLabel}` |
| log | `[remote-assets] download progress: {percent toFixed(1)}% ({transferredMB toFixed(1)}/{totalMB toFixed(1)} MB, {speedMBPerSecond toFixed(2)} MB/s)` |
| log | `[remote-assets] download progress: {transferredMB toFixed(1)} MB (total unknown, {speedMBPerSecond toFixed(2)} MB/s)` |
