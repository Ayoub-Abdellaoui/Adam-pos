const { app, BrowserWindow, shell, session } = require("electron");

const DEFAULT_APP_URL = "https://cloudposinv-uew3onk4.manus.space";
const APP_URL = process.env.CLOUD_POS_APP_URL || DEFAULT_APP_URL;

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#f8fafc",
    autoHideMenuBar: true,
    title: "Cloud POS",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: process.env.NODE_ENV !== "production",
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  void window.loadURL(APP_URL);
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(["notifications", "camera", "microphone"].includes(permission));
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
