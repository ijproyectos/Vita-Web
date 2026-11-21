import type { CapacitorConfig } from "@capacitor/cli";

// The shell loads the deployed web app (Next.js with Server Actions cannot be
// exported as static files). Override VITA_APP_URL to point at a preview or a
// local dev server; plain http is only allowed for those local cases.
const url = process.env.VITA_APP_URL ?? "https://vitappweb.netlify.app";
const host = new URL(url).host;

const config: CapacitorConfig = {
  appId: "ar.com.soyvita.app",
  appName: "vita",
  webDir: "www",
  server: {
    url,
    cleartext: url.startsWith("http://"),
    // Local page shown when the site cannot be reached.
    errorPath: "offline.html",
    // Only the app's own host stays inside the WebView. Anything else (for
    // example Google sign-in) must open in the system browser.
    allowNavigation: [host],
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
