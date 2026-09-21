import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";
import { SplashScreen } from "@capacitor/splash-screen";

type NativeLifecycleOptions = {
  refreshServerData: () => void;
};

/**
 * Adds device-native lifecycle behavior only when the React application is
 * running inside Capacitor. Browser sessions retain their existing behavior.
 */
export function initializeNativeLifecycle({ refreshServerData }: NativeLifecycleOptions) {
  if (!Capacitor.isNativePlatform()) return;

  document.documentElement.dataset.nativeShell = "capacitor";
  void SplashScreen.hide({ fadeOutDuration: 220 });

  void App.addListener("appStateChange", ({ isActive }) => {
    document.documentElement.dataset.appState = isActive ? "active" : "background";
    if (isActive) refreshServerData();
  });

  void App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
      return;
    }
    void App.exitApp();
  });

  void Network.addListener("networkStatusChange", status => {
    document.documentElement.dataset.networkStatus = status.connected ? "online" : "offline";
    window.dispatchEvent(new CustomEvent("cloud-pos-network-status", { detail: status }));
    if (status.connected) refreshServerData();
  });

  void Network.getStatus().then(status => {
    document.documentElement.dataset.networkStatus = status.connected ? "online" : "offline";
  });
}
