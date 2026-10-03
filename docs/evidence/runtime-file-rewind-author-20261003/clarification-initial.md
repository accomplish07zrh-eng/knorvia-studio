# Supplementary fixed projection facts (before seal)

Missing artifactStore row reason:'checkpoint_unreadable',message:'ArtifactStore is not configured.'. Missing filesystem row reason:'file_read_failed',message:'FileSystemPort is not configured.'. ArtifactStore wins if both missing. No checkpoints means canApply:false,ignoredFiles:[],operations:[],safeFiles:[],unsafeFiles:[].
Unsupported and external_modified mark no invented message. External_modified includes expectedHash/currentHash; read failure includes message. Unreadable artifact row uses original error rendering Error.message or String(error).
Success info fileCount = plan.safeFiles.length, operationCount = plan.operations.length, restoredFileCount = count of successful write/delete effects (including repeated paths). No deduplication of successful operations.
Trace is createEvent third argument and appendEvent second argument only, never an extra payload key. Rewind payload ordered rewindId,scope,strategy,targetMessageId,targetCheckpointId,restoredSnapshotRef,reason. Existing imported enums supply Workspace/ActiveChain values. Message target fallback is live at publication; final operation supplies checkpoint fields.
Empty arrays/no applicable files never apply/commit/emit. Existing helper selection output identity is retained internally, not cloned checkpoints/artifacts; row/result arrays are new.
