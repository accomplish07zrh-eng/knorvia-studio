# Public callbacks clarified after full v2 read

Author asked before any draft:
- onSessionClosed receives ONE merged event object with remoteSessionId,exitCode,signal,error?; releaseWorkspace(services,context) and onWorkspaceReleaseError(context,error) are TWO positional arguments.
- bindWorkspaceContext receives ONE {remoteSessionId,workspacePath,workspaceIdentity} object, synchronously returns Promise<void> directly and can throw synchronously.
- attachment factory {resolveScope,expose}; expose receives ONE {port,services,clientMode,scope,capabilities?} object and returns {server,dispose}. No other required factory options.

Curator supplied these in collaboration message, no private source/body/layout. Author had already read full v2 and may proceed without rereading. Initial paused output had no source/file/hash or validation claim. This v3 combined packet is curator evidence, not falsely counted as an author file read.

- Browser materializeRecording authority checks and capability lookup execute synchronously; return accepted materializer Promise directly. Missing/blank identity/scoped capability errors throw synchronously, no async wrapper.
