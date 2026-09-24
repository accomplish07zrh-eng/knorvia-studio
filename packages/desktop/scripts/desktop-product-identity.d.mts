export type DesktopProductFlavor = "production" | "preview";
export interface DesktopProductIdentity {
  readonly flavor: DesktopProductFlavor;
  readonly appId: string;
  readonly productName: string;
  readonly linuxExecutableName: string;
  readonly linuxPackageName: string;
  readonly cuaHelperInstallVariant: "preview" | null;
}
export const KNORVIA_PREVIEW_IDENTITY_ENV: "KNORVIA_PREVIEW_IDENTITY";
export const desktopProductIdentities: Readonly<Record<DesktopProductFlavor, DesktopProductIdentity>>;
export function isPreviewIdentityRequested(env?: NodeJS.ProcessEnv): boolean;
export function resolveDesktopProductFlavor(env?: NodeJS.ProcessEnv): DesktopProductFlavor;
export function resolveDesktopProductIdentity(env?: NodeJS.ProcessEnv): DesktopProductIdentity;
export function resolveDesktopArtifactSuffix(env?: NodeJS.ProcessEnv): "_TEST" | "";
export function resolveWindowsAppUserModelIdForFlavor(
  flavor: DesktopProductFlavor,
  runtime?: { isPackaged: boolean },
): string;
export function resolveWindowsAppUserModelId(
  env?: NodeJS.ProcessEnv,
  runtime?: { isPackaged: boolean },
): string;
