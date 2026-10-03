# Remote sync preflight owner — behavior/API contract

Batch starts from 9a51bac9b08bfe2033e6ee09b85dae9fde4ca72f on PR 10. Whole owner remoteSyncWriteAccess.ts; services unmanaged legacy. Keep two exports and RemoteSyncWriteAccessResult from @knorvia/shared. No authentication, permission policy or production access changes.

```text
caller → single-directory preflight → mkdir → exclusive marker write → remove → result
multi-directory caller → sequential preflight → first failure OR aggregate success
```

checkRemoteSyncDirectoryWriteAccess(directoryPath:string):Promise<RemoteSyncWriteAccessResult>. Before try construct marker path join(directoryPath, `.knorvia-sync-preflight-${process.pid}-${randomUUID()}`). Inside try await mkdir(directoryPath,{recursive:true}); await writeFile(markerPath,'ok',{encoding:'utf-8',flag:'wx'}); await rm(markerPath,{force:true}); return {ok:true,path:directoryPath}. Catch any mkdir/write/remove error: await rm(markerPath,{force:true}) swallowing cleanup rejection, then return {ok:false,path:directoryPath,error: error instanceof Error ? error.message : String(error)}. Marker construction failures precede try and reject. Preserve original failure value's message, not cleanup failure. Do not chmod, alter existing directory permissions, inspect credentials, retry or add fallback/queue. Directory creation is retained after success/failure. Random UUID from node:crypto. Async IO only.

checkRemoteSyncDirectoriesWriteAccess(directoryPaths:readonly string[]):Promise<RemoteSyncWriteAccessResult>. Iterate array directly sequentially in supplied order, invoking single helper; first !ok returns that result unchanged and stops. Success returns {ok:true,path:directoryPaths.join(', ')} after loop; empty array yields empty path. Do not deduplicate/cache/parallelize. Input mutation timing retained by direct iterator and final join.

Author allowed only this packet, guidance, RemoteSyncWriteAccessResult type declaration (locate using rg, no other bodies), and own code. Coordinator exposed to original. Tiny owner can naturally share conventional API spelling; no novelty criterion, no blanket independent/MIT claim. Retained shared declaration and node APIs require parent classification.

Minimal permission safety check only: fabricated temporary nested directories succeed with marker cleaned; existing file as directory fails without removing file; sequential batch stops before later directory, first result path preserved. Baseline/replacement same check. Ordinary tests/builds and production/remote permission checks skipped.
