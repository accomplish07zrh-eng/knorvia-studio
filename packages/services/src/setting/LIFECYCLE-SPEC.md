# Settings lifecycle replacement — 2026-10-02

Base: `f25b931164ee6287167e965e9da7a7586131b264`. Scope: complete settings persistence owner, normalization, deadline helper and host-local observation. No new product behavior, persistence format, UI, security policy or license decision.

## Ownership and ordering

```text
update / migration → per-service admission queue → read latest → validate/merge
                                                   ↓
get waits admitted writes ← completion ← atomic rename ← exclusive commit queue
                                           ↑
pre-commit deadline → invalidate old write ──┘ (stale writes cannot rename)
successful update → host observer event (original patch keys)
```

One service instance owns write admission and commit serialization; different instances are not consolidated. Existing atomic-file adapter owns locking, rename retry and temporary-file cleanup. A deadline may release admission before commit begins, but never after commit begins. A timed-out operation may finish preparation but must not rename. Rejection must not poison subsequent writes; existing errors propagate unchanged except the established timeout/stale-write errors. There is no new cancellation or cross-host replay API. Desktop and mobile use the same existing service contract; observer notifications remain host-local.

## Preserved contract

- Factories `createSettingService()` and `createSettingServiceWithMigrations(): {service}` retain `ISettingService`. No changes to RPC contracts or schemas.
- Resolve settings paths on each operation: trimmed `KNORVIA_DATA_BASE_DIR` + `.knorvia-studio/v2`; otherwise trimmed `KNORVIA_HOME` + `v2`; otherwise first nonempty trimmed desktop-home/HOME/USERPROFILE or OS home + `.knorvia-studio/v2`. File is `setting.json`; JSON is two-space-indented, without an added newline. Runtime data-location reporting retains its separate existing adapter.
- Read failures and invalid schemas return schema defaults without overwriting the file. Invalid JSON gets three retries, each after 300 ms, then best-effort rename to `setting.json.corrupt-<ISO with colons/dots replaced by hyphens>`. Retry IO errors participate in that same retry sequence. Missing-file reads do not write.
- Existing object settings lacking the first-run property parse with `studioFirstRunGuideStatus: legacy`. Migration persistence is needed when either close-to-tray or reasoning migration initialization is not true, or first-run status is undefined. Migration writes queue, reread, and only write if still needed. `get` then rereads. Preserve schema-derived defaults/migrations rather than duplicating schema logic.
- `update` normalizes and validates the patch inside its queued operation, reads latest settings, shallow-merges, validates the full result, stable-deduplicates recent projects and caps them at ten. Preserve failure objects from validation and IO.
- Normalize a copied patch: string locale fills absent localePreference; terminal font and three proxy strings trim and empty to undefined; auto integrated shell becomes undefined, shell mode copies selection and trims id/label/path. Leave other values unchanged, including explicit localePreference undefined. Do not mutate input.
- Timeout reads positive finite numeric `KNORVIA_SETTING_WRITE_QUEUE_TIMEOUT_MS`, otherwise 30000. Timer is unref'ed; commit entry clears it. Timeout invalidates first, then rejects `settingService update timed out after <ms>ms`. Guard before atomic rename and inside exclusive rename: `stale settings write skipped before atomic rename`.
- Directory creation/fault hooks remain before atomic writing. Keep atomic adapter `beforeRename` and `runRename` integration so rename cannot overtake newer work.
- `updateDataBaseDir` rejects portable/environment-fixed locations before copy. Preserve exact existing Chinese error strings and validation error code/message. Validate trimmed new target or OS home, copy only if target differs, then call `this.update({dataBaseDir: newDir})` with the original value. Do not change runtime paths during this operation.
- Default project is `<argument>/KnorviaProject`; access failure means previously absent, recursive mkdir always runs; mkdir failure identity is preserved.
- Observable wrapper spreads base methods, supports Set listeners and unsubscribe, awaits successful base update before a shallow-frozen event whose frozen keys are original patch keys. Empty patches do not notify. Set iteration remains live, listener throws propagate unchanged and stop delivery. Failed writes do not notify; inferred normalized keys are not included.

## Acceptance and provenance limits

Use synthetic temporary roots only. Minimal checks cover queued disjoint writes, normalization/persistence/reopen, observer failure identity, timeout invalidation and commit protection, plus existing data-location checks if dependencies permit. No full build, broad suite or repetitive equivalence matrix in this batch. Record failures and unrun checks accurately.

The coordinator inspected inherited implementation to extract this contract. A fresh author receives this specification and API details without inherited source or history, and replaces complete selected owners. This supports bounded authorship review only; retained schemas/adapters/contracts and all untouched sync implementation remain separately reviewable. No MIT claim or global provenance modification is authorized by this evidence alone.
