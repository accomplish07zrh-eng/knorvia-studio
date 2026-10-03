# Supplementary body-free dependency signatures (before seal)

createCoreError(type:CoreErrorType,message:string,options:{context?:Record<string,unknown>;recoverable?:boolean}):CoreError.
isCoreError(error:unknown):error is CoreError; CoreError.type is the discriminator, CoreErrorType.SessionCorrupted is retained.
parseRemoteWorkspaceIdentity(identity:string|undefined):{kind:'ssh'|'wsl'|'docker';workspacePath:string}|undefined.
Session store port uses branded SessionId; keep the imported original public types and casts where the API declaration has them. The simplified supporting aliases are reference facts only.
