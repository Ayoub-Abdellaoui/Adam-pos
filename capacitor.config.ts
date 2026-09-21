import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.adamstores.cloudpos",
  appName: "Cloud POS",
  webDir: "dist/public",
  server: {
    url: "https://cloudposinv-uew3onk4.manus.space",
    cleartext: false,
    allowNavigation: ["cloudposinv-uew3onk4.manus.space"],
  },
  android: {
    backgroundColor: "#f8fafc",
  },
  ios: {
    contentInset: "automatic",
  },
};

export default config;
