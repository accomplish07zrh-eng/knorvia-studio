/** 独立应用没有远程产品帮助配置；保留调用形状供既有本地帮助菜单使用。 */
export function createDesktopHelpConfigReader(_options: {
  resolveEndpointOrigin: () => Promise<string>;
  appVersion: string;
  deviceMid: string;
}) {
  return async (): Promise<unknown> => ({ configs: {} });
}
