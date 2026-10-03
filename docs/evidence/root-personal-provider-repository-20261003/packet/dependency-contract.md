# Retained dependency and side-effect ports

Public API declarations preserve original import-route spelling; these are reading views, not a relocated standalone runtime package. dependency-types.d.ts preserves exact layer/update/repository interfaces from the local published source. Its ProviderSource read/onDidChange contract matches the retained source interface. ModelSelection, provider map/rule/template classes and canonical schema/rule output types remain original public package types, not newly implemented stubs. D config-service/registry-service/model-config/account-service implementations and G adapter work are excluded.

runtime-ports.d.ts provides declaration-only codec/lock/write types and a conceptual observation boundary for future fake-only verification, not a new production export or injection API. The codec's encode return has no explicit source annotation: its declaration is manually grounded in the version1 object projection and ReturnType of the two existing facade serializers. Snapshot/default selection types remain imported canonical relations; full semantic TypeScript/Zod closure is deferred, not reported PASS.

| Collaborator | Required behavior owned there, kept opaque |
| --- | --- |
| @knorvia/provider | ProviderConfigMap.empty and ModelConfigRules.empty; rule/map identities; toJSON/toPersonalJSON; PersonalProviderConfigRepository and layer data types |
| provider-config-file-codec | Strict version1 wire object, decode/encode, personal source validation, optional selection/order and limited legacy manual-config normalization; no network |
| shared/node withFileLock | Exact path, operation callback/return, same-process path FIFO, shared atomic cross-process lock/release and original defaults/errors; no repository replacement lock |
| shared/node atomicWritePrivateTextFile | Private mode0600 UTF-8 temp file in same directory, atomic replacement, existing retry and cleanup/error behavior |
| node:fs/promises readFile | Exact path and utf8 string read; repository handles only ENOENT as missing |
| node:crypto createHash | SHA256 of compact encoded JSON, hex digest |
| setTimeout/clearTimeout/timer.unref | Lazy single pending/in-flight lifecycle and optional unref; native timer semantics retained |
| importLegacy/onRecovery/onPollingError/listeners | Supplied callable ports: importer/recovery/polling-error use repository receiver; transform/listeners are unbound local calls; no invented credential/account/user path source |

Retained lock defaults are process FIFO per original filePath string and atomic lock retry delays25/50/100/200/400ms, ownerless grace100ms, max wait8000ms. Original helper makes parent directory, obtains lock, awaits operation, releases lock and process queue in finally. Its underlying atomic lock implementation was not read; no fairness/security/full lock grant proof beyond these visible wrapper facts is claimed.

Retained writer uses same-directory temp material and requests mode0600 on temporary-file creation. It retries rename only for EPERM/EBUSY/EACCES with50/100/200/400/800ms delays, removes temp best-effort after failure and rethrows. Actual platform ACL enforcement, atomic-file-lock internals and real filesystem behavior have not been executed or certified. Unrelated backupCorruptFile exists in the same helper source; target does not import/call it and this packet does not authorize recovery/extraction from backups.

Codec is unchanged and owns all parsing/migration rules. Root object/config are strict. Provider/model rule payloads are decoded through retained personal parsers; hidden/system model leaves cannot be newly accepted on writes. Existing legacy complete/editable manual shapes are recognized narrowly and projected through the retained editable extraction; unknown/corrupt shapes are not repaired merely by deleting fields. ModelSelection is strict with trimmed nonempty providerId/modelId, optional strict options with a trimmed nonempty reasoningLevel. No new field/default/version/account permission is added.

Preparation reads repository source and directly grounded dependency code/type declarations only. The curator saw whole privateFilePersistence source (including unused backup helper), source interfaces file and shared model-selection source; this incidental exposure is disclosed, not a clean-room claim. No source implementation is included among eventual author inputs and no native IO, timers, provider/model/account requests or repository construction was run.
