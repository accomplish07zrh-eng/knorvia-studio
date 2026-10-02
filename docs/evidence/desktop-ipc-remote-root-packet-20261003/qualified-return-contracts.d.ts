// Source-grounded exact qualifications; raw isolated diagnostics remain recorded, no semantic compilation claim.
// screenshot: async function yields this shape or null, not the raw isolated unknown.
type QualifiedScreenshotResult = Promise<{
  dataBase64: string;
  filename: string;
  contentType: string;
  size: number;
} | null>;
// registerRemoteIpcHandlers already emits void despite inherited TS9007; keep explicit void.
type QualifiedRemoteIpcRegistrationResult = void;
// Manager's other method signatures/ordered object fields are exact in its public-api.d.ts.
// Its raw isolated disposeAllAndWaitForAppShutdown(_reason:string):any is specifically Promise<void>.
type QualifiedDisposeAllAndWaitForAppShutdown = (_reason: string) => Promise<void>;
// Suggested replacement result shape uses existing public declaration mapped type only:
type QualifiedRemoteSessionManager = Omit<
  ReturnType<typeof import("../../../packages/desktop/src/main/desktopRemoteSessions.js").createRemoteWorkspaceSessionManager>,
  "disposeAllAndWaitForAppShutdown"
> & {
  disposeAllAndWaitForAppShutdown: QualifiedDisposeAllAndWaitForAppShutdown;
};
// Avoid using this self-return-derived suggestion within its own implementation if it causes circular inference.
// Authors may explicitly spell the exact private return interface from supplied method signatures instead.
