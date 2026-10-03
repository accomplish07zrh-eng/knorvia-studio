import { connectViaWebSocket } from "@knorvia/client";
import { generateMobileDeviceFingerprint, setStreamClientId } from "@knorvia/ui";
import "@knorvia/ui/styles.css";
import { createRoot } from "react-dom/client";
import { createWebWorkspace, WebBootstrapErrorScreen } from "./webAppViews.js";
import { readWebServerInfo, resolveWebBootstrap } from "./webBootstrap.js";
import { createWebPlatform } from "./webPlatform.js";
import { startWebApp } from "./webStartup.js";
import { initializeWebTheme } from "./webThemeBootstrap.js";

initializeWebTheme();
const root = createRoot(document.getElementById("root")!);
setStreamClientId(generateMobileDeviceFingerprint());

void startWebApp({
  resolve: () => resolveWebBootstrap({ location: window.location, serverInfo: readWebServerInfo }),
  connect: url => connectViaWebSocket(url, { onClose: () => {} }),
  createPlatform: createWebPlatform,
  present: input => {
    document.title = "Knorvia Studio";
    root.render(createWebWorkspace(input));
  },
  failure: error => {
    document.title = "Knorvia Studio";
    root.render(
      <WebBootstrapErrorScreen message={error instanceof Error ? error.message : String(error)} />,
    );
  },
});
