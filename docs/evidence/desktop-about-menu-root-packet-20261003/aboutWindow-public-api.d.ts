interface CustomAboutDialogHtmlInput {
    applicationName: string;
    iconDataUrl: string;
    appVersion: string;
    copyright: string;
    optimizationLine: string;
    versionLabel: string;
    okButtonLabel: string;
}
export declare function createCustomAboutDialogHtml(input: CustomAboutDialogHtmlInput): string;
export {};
